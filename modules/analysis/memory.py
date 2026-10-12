import ctypes
import os
import threading
from collections import deque
from contextlib import contextmanager

from .exceptions import MemoryBudgetExceeded, check_cancelled


def default_limit():
    if os.name == 'nt':
        class MemoryStatus(ctypes.Structure):
            _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong) for name in (
                    'total', 'available', 'page_total', 'page_available',
                    'virtual_total', 'virtual_available', 'extended')]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return max(32 * 1024 * 1024, min(1024 * 1024 * 1024, status.available // 4))
    return 256 * 1024 * 1024


class MemoryBudget:
    def __init__(self, limit_bytes=None):
        self.limit_bytes = default_limit() if limit_bytes is None else limit_bytes
        if not isinstance(self.limit_bytes, int) or self.limit_bytes <= 0:
            raise ValueError('Memory limit must be a positive integer')
        self._condition = threading.Condition()
        self._queue = deque()
        self._used = 0

    @property
    def used_bytes(self):
        with self._condition:
            return self._used

    @contextmanager
    def reserve(self, amount, label='', cancelled=None):
        if not isinstance(amount, int) or amount < 0:
            raise ValueError('Reservation must be a nonnegative integer')
        if amount > self.limit_bytes:
            raise MemoryBudgetExceeded(f'{label or "Operation"}: requires {amount} bytes; budget {self.limit_bytes}')
        ticket = object()
        acquired = False
        with self._condition:
            self._queue.append(ticket)
            try:
                while True:
                    check_cancelled(cancelled)
                    if self._queue[0] is ticket and self._used + amount <= self.limit_bytes:
                        self._queue.popleft()
                        self._used += amount
                        acquired = True
                        self._condition.notify_all()
                        break
                    self._condition.wait(0.05)
            finally:
                if not acquired:
                    self._queue.remove(ticket)
                    self._condition.notify_all()
        try:
            yield
        finally:
            with self._condition:
                self._used -= amount
                self._condition.notify_all()


DEFAULT_BUDGET = MemoryBudget()
ANALYSIS_SCHEDULER = MemoryBudget(1)
