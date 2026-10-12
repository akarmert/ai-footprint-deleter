import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

import json
import time
from contextlib import contextmanager
from dataclasses import replace
from threading import Event

import pytest
from PIL import Image
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox

from app.ui.main_window import MainWindow
from app.ui.image_preview import _PreviewTask
from app.workers.workflow_task import WorkflowTask
from modules.analysis import AnalysisCancelled, AnalysisEngine, MemoryBudget, MemoryBudgetExceeded


def wait_until(app, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while not predicate():
        assert time.monotonic() < deadline, 'Qt worker timeout'
        app.processEvents()
        time.sleep(0.002)
    app.processEvents()


@pytest.fixture
def app():
    return QApplication.instance() or QApplication([])


@pytest.fixture
def source(tmp_path):
    path = tmp_path / 'pixels.png'
    image = Image.new('RGB', (2, 1))
    image.putdata([(0, 20, 40), (100, 120, 140)])
    image.save(path)
    return path


@pytest.fixture
def window(app, monkeypatch):
    monkeypatch.setattr('app.ui.main_window.stale_temp_candidates', lambda: [])
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: None)
    view = MainWindow()
    view.show()
    yield view
    view.close()
    wait_until(app, lambda: not view._tasks)


def scan(app, window, source):
    window.scan_path(str(source))
    wait_until(app, lambda: window.scan_result is not None and not window._tasks)


def test_real_analysis_math_histogram_progress_and_safe_export(app, window, source, tmp_path, monkeypatch):
    scan(app, window, source)
    progress = []
    original = window._task_progress
    monkeypatch.setattr(window, '_task_progress', lambda *args: (progress.append(args[1:]), original(*args)))
    window.navigation.setCurrentRow(3)
    window.analysis_pane.start_button.click()
    wait_until(app, lambda: window.analysis_result is not None and not window._tasks)
    result = window.analysis_result
    assert result.channel_statistics['R'].mean == 50
    assert result.channel_statistics['G'].mean == 70
    assert result.channel_statistics['B'].standard_deviation == 50
    assert result.channel_statistics['R'].histogram[100] == 1
    assert result.channel_statistics['R'].histogram[0] == 1
    assert progress and progress[-1] == (result.tiles_processed, result.tiles_processed)
    assert window.analysis_pane.statistics.rowCount() == 4
    assert window.analysis_pane.progress.value() == result.tiles_processed
    window.analysis_pane.channel.setCurrentText('Luma')
    assert window.analysis_pane.histogram.channels == ('Luma',)
    assert 'ICC' in window.analysis_pane.details.toPlainText()
    assert window.navigation.count() == 8
    target = tmp_path / 'analysis.json'
    monkeypatch.setattr(QFileDialog, 'getSaveFileName', lambda *args: (str(target), 'JSON'))
    window.export_analysis()
    report = target.read_text(encoding='utf-8')
    json.loads(report)
    assert str(source) not in report
    assert result.source_sha256 not in report


def test_alpha_statistics_and_histogram_view(app, window, tmp_path):
    path = tmp_path / 'alpha.png'
    image = Image.new('RGBA', (2, 1))
    image.putdata([(10, 20, 30, 0), (110, 120, 130, 255)])
    image.save(path)
    scan(app, window, path)
    window.start_analysis()
    wait_until(app, lambda: window.analysis_result is not None and not window._tasks)
    result = window.analysis_result
    assert result.channel_statistics['A'].mean == 127.5
    assert result.channel_statistics['R'].mean == 60
    window.analysis_pane.channel.setCurrentText('A')
    assert window.analysis_pane.histogram.channels == ('A',)
    assert window.analysis_pane.histogram.histograms['A'][0] == 1
    assert window.analysis_pane.histogram.histograms['A'][255] == 1
    assert window.analysis_pane.statistics.rowCount() == 5


def test_grayscale_defaults_visible_channel_and_no_detail_growth(app, window, tmp_path):
    path = tmp_path / 'gray.png'
    Image.new('L', (3, 2), 77).save(path)
    scan(app, window, path)
    window.start_analysis()
    wait_until(app, lambda: window.analysis_result is not None and not window._tasks)
    assert window.analysis_pane.channel.currentText() == 'L'
    assert window.analysis_pane.histogram.histograms['L'][77] == 6
    details = window.analysis_pane.details.toPlainText()
    window.analysis_pane.show_result(window.analysis_result)
    assert window.analysis_pane.details.toPlainText() == details
    assert 'SSIM / PSNR: Unsupported' in details


def test_analysis_cancel_worker_separate_signal():
    task = WorkflowTask(lambda cancelled, progress: (_ for _ in ()).throw(AnalysisCancelled()), progressive=True)
    cancelled = []
    errors = []
    task.signals.cancelled.connect(cancelled.append)
    task.signals.failed.connect(lambda *args: errors.append(args))
    task.run()
    assert cancelled == [task.task_id]
    assert not errors


def test_cancel_active_analysis(app, window, source, monkeypatch):
    scan(app, window, source)
    entered, release = Event(), Event()

    def analyze(*args, cancelled=None, progress=None, **kwargs):
        entered.set()
        assert release.wait(5)
        assert cancelled()
        raise AnalysisCancelled()

    monkeypatch.setattr(window.analysis_engine, 'analyze', analyze)
    window.start_analysis()
    wait_until(app, entered.is_set)
    window.cancel_operation()
    release.set()
    wait_until(app, lambda: not window._tasks)
    assert window.analysis_result is None
    assert 'iptal' in window.analysis_pane.summary.text().lower()
    assert window.analysis_pane.start_button.isEnabled()


def test_latest_pending_selection_only_and_stale_progress(app, window, source, tmp_path, monkeypatch):
    scan(app, window, source)
    result = AnalysisEngine().analyze(source, expected_sha256=window.scan_result.sha256, generation_id=str(window._generation))
    entered, release = Event(), Event()

    def analyze(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr(window.analysis_engine, 'analyze', analyze)
    window.start_analysis()
    wait_until(app, entered.is_set)
    task_id = next(iter(window._tasks))
    second = tmp_path / 'second.png'
    third = tmp_path / 'third.png'
    Image.new('RGB', (3, 2), 'red').save(second)
    Image.new('RGB', (4, 2), 'blue').save(third)
    window.scan_path(str(second))
    window.scan_path(str(third))
    window._task_progress(task_id, 5, 10)
    assert window.analysis_pane.progress.value() == 0
    assert window._pending_path == str(third)
    assert len(window._tasks) == 1
    release.set()
    wait_until(app, lambda: not window._tasks and window.scan_result is not None)
    assert window.scan_result.path == str(third.resolve())
    assert window.analysis_result is None
    assert window.analysis_pane.statistics.rowCount() == 0


def test_same_path_different_hash_invalidates_metadata(app, window, source):
    scan(app, window, source)
    Image.new('RGB', (2, 1), 'white').save(source)
    window.start_analysis()
    wait_until(app, lambda: not window._tasks)
    assert window.scan_result is None
    assert window.analysis_result is None
    assert window.analysis_pane.statistics.rowCount() == 0
    assert not window.analysis_pane.start_button.isEnabled()
    assert not window.clean_button.isEnabled()
    assert 'yeniden' in window.analysis_pane.summary.text().lower()


def test_result_hash_and_generation_guard(app, window, source):
    scan(app, window, source)
    result = AnalysisEngine().analyze(source, generation_id=str(window._generation))
    task = WorkflowTask(lambda: None)
    window._tasks[task.task_id] = task
    window._task_kinds[task.task_id] = 'analyze'
    window._task_generations[task.task_id] = window._generation
    window._task_succeeded(task.task_id, replace(result, source_sha256='0' * 64))
    assert window.analysis_result is None
    window._task_succeeded(task.task_id, replace(result, generation_id='old'))
    assert window.analysis_result is None
    window._task_finished(task.task_id)


def test_close_during_analysis_is_nonblocking(app, window, source, monkeypatch):
    scan(app, window, source)
    entered, release = Event(), Event()

    def analyze(*args, cancelled=None, **kwargs):
        entered.set()
        assert release.wait(5)
        assert cancelled()
        raise AnalysisCancelled()

    monkeypatch.setattr(window.analysis_engine, 'analyze', analyze)
    window.start_analysis()
    wait_until(app, entered.is_set)
    start = time.monotonic()
    window.close()
    assert time.monotonic() - start < .5
    assert window._tasks
    release.set()
    wait_until(app, lambda: not window._tasks and not window.isVisible())
    assert window.analysis_result is None


def test_preview_reserves_before_decode_and_releases_on_error(source, monkeypatch):
    events = []

    class Budget:
        @contextmanager
        def reserve(self, amount, label='', cancelled=None):
            assert amount == 2 * 8 + 32 * 1024 * 1024
            assert label == 'preview'
            events.append('reserve')
            try:
                yield
            finally:
                events.append('release')

    class Reader:
        def __init__(self, path):
            pass

        def setAutoTransform(self, enabled):
            pass

        def size(self):
            from PySide6.QtCore import QSize
            return QSize(2, 1)

        def read(self):
            assert events == ['reserve']
            events.append('decode')
            raise ValueError('decoder failure')

    monkeypatch.setattr('app.ui.image_preview.DEFAULT_BUDGET', Budget())
    monkeypatch.setattr('app.ui.image_preview.QImageReader', Reader)
    task = _PreviewTask(str(source), 1)
    messages = []
    task.signals.ready.connect(lambda generation, image, message: messages.append(message))
    task.run()
    assert events == ['reserve', 'decode', 'release']
    assert messages and 'okunamadı' in messages[-1]
    assert task.completed.is_set()


def test_preview_real_reservation_release_and_cancellation(app, source, monkeypatch):
    from threading import Thread
    amount = 2 * 8 + 32 * 1024 * 1024
    budget = MemoryBudget(amount)
    monkeypatch.setattr('app.ui.image_preview.DEFAULT_BUDGET', budget)
    task = _PreviewTask(str(source), 1)
    with budget.reserve(amount, label='held'):
        thread = Thread(target=task.run)
        thread.start()
        task.cancelled.set()
        thread.join(2)
        assert not thread.is_alive()
        assert task.completed.is_set()
        assert budget.used_bytes == amount
    assert budget.used_bytes == 0
    normal = _PreviewTask(str(source), 2)
    normal.run()
    assert normal.completed.is_set()
    assert budget.used_bytes == 0


def test_preview_budget_failure_controlled(source, monkeypatch):
    class Budget:
        @contextmanager
        def reserve(self, *args, **kwargs):
            raise MemoryBudgetExceeded('test')
            yield

    monkeypatch.setattr('app.ui.image_preview.DEFAULT_BUDGET', Budget())
    task = _PreviewTask(str(source), 1)
    messages = []
    task.signals.ready.connect(lambda generation, image, message: messages.append(message))
    task.run()
    assert messages and 'bütçesine' in messages[-1]
    assert task.completed.is_set()
