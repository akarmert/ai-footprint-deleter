"""Extension contract for authorized, independently validated detectors only."""
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class DetectionResult:
    technology: str
    status: str
    detected: bool | None
    evidence: str


class Detector(Protocol):
    technology: str

    def analyze(self, path: str) -> DetectionResult: ...


class DetectorRegistry:
    def __init__(self):
        self._adapters: dict[str, Detector] = {}

    def register(self, adapter: Detector):
        if adapter.technology in self._adapters:
            raise ValueError('Dedektör zaten kayıtlı')
        self._adapters[adapter.technology] = adapter

    def analyze(self, technology: str, path: str) -> DetectionResult:
        adapter = self._adapters.get(technology)
        if adapter is None:
            return DetectionResult(technology, 'Not Supported', None,
                                   'Bu filigran türü için doğrulama desteklenmiyor; yetkili dedektör kurulu değil.')
        return adapter.analyze(path)
