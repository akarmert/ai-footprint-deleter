from __future__ import annotations

from threading import Event
from uuid import uuid4

from PySide6.QtCore import QObject, QRunnable, QThreadPool, QTimer, Qt, QSize, Signal, Slot
from PySide6.QtGui import QImage, QImageReader, QPainter, QPixmap, QWheelEvent
from PySide6.QtWidgets import QGraphicsScene, QGraphicsView

from modules.analysis import DEFAULT_BUDGET, AnalysisCancelled, MemoryBudgetExceeded


class _PreviewSignals(QObject):
    ready = Signal(int, QImage, str)


class _PreviewTask(QRunnable):
    def __init__(self, path: str, generation: int) -> None:
        super().__init__()
        self.key = uuid4().hex
        self.path = path
        self.generation = generation
        self.cancelled = Event()
        self.completed = Event()
        self.signals = _PreviewSignals()
        self.setAutoDelete(False)

    @Slot()
    def run(self) -> None:
        try:
            if self.cancelled.is_set():
                return
            reader = QImageReader(self.path)
            reader.setAutoTransform(True)
            size = reader.size()
            if not size.isValid():
                self.signals.ready.emit(self.generation, QImage(), reader.errorString() or "Görsel boyutu okunamadı")
                return
            if size.width() * size.height() > 40_000_000:
                self.signals.ready.emit(self.generation, QImage(), "Önizleme güvenlik sınırı: en fazla 40 megapiksel")
                return
            if max(size.width(), size.height()) > 1600:
                reader.setScaledSize(size.scaled(QSize(1600, 1600), Qt.AspectRatioMode.KeepAspectRatio))
            if self.cancelled.is_set():
                return
            estimate = size.width() * size.height() * 8 + 32 * 1024 * 1024
            with DEFAULT_BUDGET.reserve(estimate, label="preview", cancelled=self.cancelled.is_set):
                image = reader.read()
                if self.cancelled.is_set():
                    return
                if not image.isNull() and max(image.width(), image.height()) > 1600:
                    image = image.scaled(QSize(1600, 1600), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
            message = (reader.errorString() or "Bu biçim için önizleme kullanılamıyor") if image.isNull() else ""
            self.signals.ready.emit(self.generation, image, message)
        except AnalysisCancelled:
            if not self.cancelled.is_set():
                self.signals.ready.emit(self.generation, QImage(), "Önizleme iptal edildi")
        except MemoryBudgetExceeded:
            if not self.cancelled.is_set():
                self.signals.ready.emit(self.generation, QImage(), "Önizleme bellek bütçesine sığmıyor")
        except Exception:
            if not self.cancelled.is_set():
                self.signals.ready.emit(self.generation, QImage(), "Görsel önizlemesi okunamadı")
        finally:
            self.completed.set()


class _PreviewJobs(QObject):
    def __init__(self) -> None:
        super().__init__()
        self.tasks: dict[str, _PreviewTask] = {}
        self.pending: list[_PreviewTask] = []
        self.running: set[str] = set()
        self.timer = QTimer(self)
        self.timer.setInterval(20)
        self.timer.timeout.connect(self.collect)

    def start(self, task: _PreviewTask) -> None:
        self.tasks[task.key] = task
        self.pending.append(task)
        self.timer.start()
        self._dispatch()

    def _dispatch(self) -> None:
        while self.pending and sum(not self.tasks[key].completed.is_set() for key in self.running) < 2:
            task = self.pending.pop(0)
            if task.cancelled.is_set():
                self.tasks.pop(task.key)
                task.signals.deleteLater()
                continue
            self.running.add(task.key)
            QThreadPool.globalInstance().start(task)

    @Slot()
    def collect(self) -> None:
        if QThreadPool.globalInstance().activeThreadCount() == 0:
            for key in list(self.running):
                task = self.tasks[key]
                if task.completed.is_set():
                    self.running.remove(key)
                    self.tasks.pop(key)
                    task.signals.deleteLater()
        self._dispatch()
        if not self.tasks:
            self.timer.stop()


_jobs: _PreviewJobs | None = None


def _preview_jobs() -> _PreviewJobs:
    global _jobs
    if _jobs is None:
        _jobs = _PreviewJobs()
    return _jobs


class ImagePreview(QGraphicsView):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setScene(QGraphicsScene(self))
        self.setRenderHints(QPainter.RenderHint.Antialiasing | QPainter.RenderHint.SmoothPixmapTransform)
        self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.setMinimumHeight(220)
        self.setAccessibleName("Görsel önizleme; tekerlekle yakınlaştırın, sürükleyerek kaydırın")
        self._has_image = False
        self._generation = 0
        self._cancel = Event()
        self._lifetime_cancel = [self._cancel]
        lifetime_cancel = self._lifetime_cancel
        self.destroyed.connect(lambda *_: lifetime_cancel[0].set())
        self.auto_fit = True
        self.clear_preview("Görsel seçilmedi")

    def clear_preview(self, message: str = "Önizleme yok") -> None:
        self._generation += 1
        self._cancel.set()
        self._loading = False
        self.scene().clear()
        self.resetTransform()
        self.scene().addText(message).setDefaultTextColor(Qt.GlobalColor.lightGray)
        self._has_image = False

    def load_path(self, path: str) -> str | None:
        self.clear_preview("Önizleme yükleniyor…")
        self._loading = True
        task = _PreviewTask(path, self._generation)
        self._cancel = task.cancelled
        self._lifetime_cancel[0] = task.cancelled
        task.signals.ready.connect(self._image_ready, Qt.ConnectionType.QueuedConnection)
        _preview_jobs().start(task)
        return None

    @Slot(int, QImage, str)
    def _image_ready(self, generation: int, image: QImage, message: str) -> None:
        if generation != self._generation or self._cancel.is_set():
            return
        if image.isNull():
            self.clear_preview(message)
            return
        self._loading = False
        self.scene().clear()
        self.resetTransform()
        self.scene().addPixmap(QPixmap.fromImage(image))
        self.scene().setSceneRect(self.scene().itemsBoundingRect())
        self._has_image = True
        self.fit_image()

    def closeEvent(self, event) -> None:
        self._loading = False
        self._generation += 1
        self._cancel.set()
        super().closeEvent(event)

    def fit_image(self) -> None:
        if self._has_image:
            self.fitInView(self.sceneRect(), Qt.AspectRatioMode.KeepAspectRatio)

    def wheelEvent(self, event: QWheelEvent) -> None:
        if not self._has_image:
            event.ignore()
            return
        factor = 1.2 if event.angleDelta().y() > 0 else 1 / 1.2
        current = self.transform().m11()
        if 0.02 <= current * factor <= 32:
            self.scale(factor, factor)
        event.accept()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if self.auto_fit:
            self.fit_image()
