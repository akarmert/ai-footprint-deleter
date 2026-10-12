"""Future quality comparisons: contracts only, no uncomputed scores."""
from dataclasses import dataclass
import math
from typing import Protocol


@dataclass(frozen=True)
class ImageDescriptor:
    source_sha256: str
    color_space: str
    width: int
    height: int
    channel_layout: tuple[str, ...]
    bit_depth: int
    alpha_policy: str
    data_range: float
    region: tuple[int, int, int, int] | None = None


@dataclass(frozen=True)
class QualityComparison:
    source: ImageDescriptor
    target: ImageDescriptor

    def validate(self):
        for descriptor in (self.source, self.target):
            if descriptor.width <= 0 or descriptor.height <= 0 or descriptor.bit_depth <= 0 or not math.isfinite(descriptor.data_range) or descriptor.data_range <= 0:
                raise ValueError('Geçersiz görüntü kalite sözleşmesi')
            if not descriptor.channel_layout:
                raise ValueError('Kanal düzeni gereklidir')
            if descriptor.region is not None:
                x,y,w,h=descriptor.region
                if min(x,y) < 0 or min(w,h) <= 0 or x+w > descriptor.width or y+h > descriptor.height:
                    raise ValueError('Kalite bölgesi görüntü dışında')
        if (self.source.width,self.source.height,self.source.channel_layout,self.source.bit_depth,self.source.color_space,self.source.alpha_policy,self.source.data_range,self.source.region) != (self.target.width,self.target.height,self.target.channel_layout,self.target.bit_depth,self.target.color_space,self.target.alpha_policy,self.target.data_range,self.target.region):
            raise ValueError('Karşılaştırma için açık uyumlu görüntü sözleşmeleri gerekir')


@dataclass(frozen=True)
class QualityResult:
    metric: str
    status: str = 'Unsupported'
    score: float | None = None
    reason: str = 'Bu fazda kalite metriği hesaplanmadı.'


class QualityMetric(Protocol):
    def compare(self, comparison: QualityComparison) -> QualityResult: ...
