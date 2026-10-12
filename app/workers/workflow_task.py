from __future__ import annotations

from collections.abc import Callable
from threading import Event
from typing import Any
from uuid import uuid4

from PySide6.QtCore import QObject, QRunnable, Signal, Slot

from app.services.workflow import OperationCancelled
from modules.analysis import AnalysisCancelled, SourceChanged


class WorkerSignals(QObject):
    succeeded = Signal(str, object)
    failed = Signal(str, str)
    cancelled = Signal(str)
    finished = Signal(str)
    progress = Signal(str, int, int)
    invalidated = Signal(str, str)


class WorkflowTask(QRunnable):
    def __init__(self, operation: Callable[..., Any], cancellable: bool = False, progressive: bool = False) -> None:
        super().__init__()
        self.task_id = uuid4().hex
        self.signals = WorkerSignals()
        self.operation = operation
        self.cancel_requested = Event()
        self.cancellable = cancellable
        self.progressive = progressive
        self.setAutoDelete(False)

    def cancel(self) -> None:
        self.cancel_requested.set()

    def _progress(self, processed: int, total: int) -> None:
        if not self.cancel_requested.is_set():
            self.signals.progress.emit(self.task_id, processed, total)

    @Slot()
    def run(self) -> None:
        try:
            if self.cancel_requested.is_set():
                raise OperationCancelled()
            if self.progressive:
                result = self.operation(self.cancel_requested.is_set, self._progress)
            else:
                result = self.operation(self.cancel_requested.is_set) if self.cancellable else self.operation()
        except (OperationCancelled, AnalysisCancelled):
            self.signals.cancelled.emit(self.task_id)
        except SourceChanged as exc:
            self.signals.invalidated.emit(self.task_id, str(exc))
        except Exception as exc:
            self.signals.failed.emit(self.task_id, f"{type(exc).__name__}: {exc}")
        else:
            self.signals.succeeded.emit(self.task_id, result)
        finally:
            self.signals.finished.emit(self.task_id)
