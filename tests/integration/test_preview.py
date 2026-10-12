import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

import time
from threading import Event

import pytest
from PIL import Image
from PySide6.QtCore import QCoreApplication, QEvent, QSize, QThread, QThreadPool, QTimer, Qt
from PySide6.QtWidgets import QApplication, QGraphicsPixmapItem, QWidget, QVBoxLayout

from app.ui import image_preview
from app.ui.image_preview import ImagePreview


def wait_until(app, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError('Preview worker timeout')
        app.processEvents()
        time.sleep(0.002)
    app.processEvents()


@pytest.fixture
def app():
    return QApplication.instance() or QApplication([])


@pytest.fixture
def preview(app):
    view = ImagePreview()
    view.show()
    yield view
    view.close()
    wait_until(app, lambda: QThreadPool.globalInstance().activeThreadCount() == 0)
    image_preview._preview_jobs().collect()
    view.deleteLater()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)


def pixmap(view):
    return next(item.pixmap() for item in view.scene().items() if isinstance(item, QGraphicsPixmapItem))


def test_actual_preview_pixels_scaled_and_gui_conversion(app, preview, tmp_path, monkeypatch):
    path = tmp_path / 'large.png'
    Image.new('RGB', (3200, 1800), (11, 80, 140)).save(path)
    threads = []
    real_reader = image_preview.QImageReader

    def reader(source):
        threads.append(QThread.currentThread() == app.thread())
        return real_reader(source)

    monkeypatch.setattr(image_preview, 'QImageReader', reader)
    assert preview.load_path(str(path)) is None
    assert preview._loading
    wait_until(app, lambda: preview._has_image)
    assert not preview._loading
    output = pixmap(preview)
    assert (output.width(), output.height()) == (1600, 900)
    assert output.toImage().pixelColor(800, 450).getRgb()[:3] == (11, 80, 140)
    assert threads == [False]
    assert preview.dragMode() == preview.DragMode.ScrollHandDrag
    preview.fit_image()
    assert preview.transform().m11() > 0
    preview.clear_preview('cleared')
    assert not preview._has_image
    assert len(preview.scene().items()) == 1


def test_rapid_twenty_loads_cancel_stale_and_keep_last(app, preview, tmp_path, monkeypatch):
    paths = []
    for index in range(20):
        path = tmp_path / f'{index}.png'
        Image.new('RGB', (80, 60), (index, 40, 90)).save(path)
        paths.append(path)
    entered = Event()
    release = Event()
    original = image_preview._PreviewTask.run

    def blocked_first(task):
        if task.path == str(paths[0]):
            entered.set()
            assert release.wait(5)
        original(task)

    monkeypatch.setattr(image_preview._PreviewTask, 'run', blocked_first)
    preview.load_path(str(paths[0]))
    wait_until(app, entered.is_set)
    first = next(task for task in image_preview._preview_jobs().tasks.values() if task.path == str(paths[0]))
    for path in paths[1:]:
        assert preview.load_path(str(path)) is None
    assert first.cancelled.is_set()
    wait_until(app, lambda: preview._has_image)
    assert pixmap(preview).toImage().pixelColor(40, 30).red() == 19
    release.set()
    wait_until(app, lambda: QThreadPool.globalInstance().activeThreadCount() == 0)
    image_preview._preview_jobs().collect()
    assert pixmap(preview).toImage().pixelColor(40, 30).red() == 19
    assert not image_preview._preview_jobs().tasks


def test_finished_tail_retains_signals_without_gui_wait(app, preview, tmp_path, monkeypatch):
    path = tmp_path / 'image.png'
    Image.new('RGB', (64, 48), (7, 8, 9)).save(path)
    completed = Event()
    release = Event()
    original = image_preview._PreviewTask.run

    def held_tail(task):
        original(task)
        completed.set()
        assert release.wait(5)

    monkeypatch.setattr(image_preview._PreviewTask, 'run', held_tail)
    preview.load_path(str(path))
    wait_until(app, completed.is_set)
    image_preview._preview_jobs().collect()
    assert image_preview._preview_jobs().tasks
    ticks = []
    QTimer.singleShot(0, lambda: ticks.append(True))
    wait_until(app, lambda: bool(ticks))
    assert preview._has_image
    release.set()
    wait_until(app, lambda: not image_preview._preview_jobs().tasks)


def test_stale_already_queued_result_ignored(app, preview, tmp_path):
    red = tmp_path / 'red.png'
    blue = tmp_path / 'blue.png'
    Image.new('RGB', (64, 48), 'red').save(red)
    Image.new('RGB', (64, 48), 'blue').save(blue)
    preview.load_path(str(red))
    deadline = time.monotonic() + 5
    while QThreadPool.globalInstance().activeThreadCount():
        assert time.monotonic() < deadline
        time.sleep(0.002)
    preview.load_path(str(blue))
    wait_until(app, lambda: preview._has_image)
    assert pixmap(preview).toImage().pixelColor(20, 20).blue() == 255


def test_async_error_renders_text_and_clear_invalidates_pending(app, preview, tmp_path):
    assert preview.load_path(str(tmp_path / 'missing.png')) is None
    wait_until(app, lambda: not image_preview._preview_jobs().tasks)
    assert not preview._has_image
    assert preview.scene().items()[0].toPlainText() != 'Önizleme yükleniyor…'
    path = tmp_path / 'image.png'
    Image.new('RGB', (64, 48), 'green').save(path)
    preview.load_path(str(path))
    preview.clear_preview('cancelled preview')
    wait_until(app, lambda: not image_preview._preview_jobs().tasks)
    assert not preview._has_image
    assert preview.scene().items()[0].toPlainText() == 'cancelled preview'


def test_oversized_decode_rejected_before_read(app, preview, monkeypatch):
    class OversizedReader:
        def __init__(self, path):
            pass

        def setAutoTransform(self, enabled):
            pass

        def size(self):
            return QSize(10000, 10000)

        def read(self):
            raise AssertionError('Oversized source must not decode')

    monkeypatch.setattr(image_preview, 'QImageReader', OversizedReader)
    preview.load_path('oversized')
    wait_until(app, lambda: not preview._loading)
    assert not preview._has_image
    assert '40 megapiksel' in preview.scene().items()[0].toPlainText()


def test_parent_destroyed_while_worker_running_safe(app, tmp_path, monkeypatch):
    path = tmp_path / 'image.png'
    Image.new('RGB', (64, 48), 'green').save(path)
    entered = Event()
    release = Event()
    original = image_preview._PreviewTask.run

    def held(task):
        entered.set()
        assert release.wait(5)
        original(task)

    monkeypatch.setattr(image_preview._PreviewTask, 'run', held)
    parent = QWidget()
    parent.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    view = ImagePreview(parent)
    layout = QVBoxLayout(parent)
    layout.addWidget(view)
    parent.show()
    view.load_path(str(path))
    wait_until(app, entered.is_set)
    task = next(task for task in image_preview._preview_jobs().tasks.values() if task.path == str(path))
    start = time.monotonic()
    parent.close()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    assert time.monotonic() - start < 0.5
    assert task.cancelled.is_set()
    assert image_preview._preview_jobs().tasks
    release.set()
    wait_until(app, lambda: not image_preview._preview_jobs().tasks)
