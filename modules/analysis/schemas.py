from dataclasses import dataclass, field
from uuid import uuid4


@dataclass(frozen=True)
class SourceIdentity:
    source_identifier: str
    sha256: str
    size_bytes: int
    format: str
    generation_id: str
    snapshot_identity: str
    timestamp: str


@dataclass(frozen=True)
class AnalysisOptions:
    tile_size: int = 512
    halo: int = 0
    expected_sha256: str | None = None
    generation_id: str = ''
    max_source_bytes: int = 128 * 1024 * 1024
    max_pixels: int = 40_000_000
    hash_chunk_size: int = 1024 * 1024

    def __post_init__(self):
        if not 1 <= self.tile_size <= 4096 or not 0 <= self.halo <= 512:
            raise ValueError('Invalid tile_size or halo')
        if not 1 <= self.max_source_bytes <= 128 * 1024 * 1024:
            raise ValueError('Invalid source byte limit')
        if not 1 <= self.max_pixels <= 40_000_000:
            raise ValueError('Invalid pixel limit')
        if not 1 <= self.hash_chunk_size <= 1024 * 1024:
            raise ValueError('Invalid hash chunk size')


@dataclass(frozen=True)
class Tile:
    core: tuple[int, int, int, int]
    processing: tuple[int, int, int, int]
    index: int = 0
    channels: tuple[str, ...] = ()
    status: str = 'Pending'

    @property
    def tile_id(self):
        return self.index

    @property
    def x(self):
        return self.core[0]

    @property
    def y(self):
        return self.core[1]

    @property
    def width(self):
        return self.core[2] - self.x

    @property
    def height(self):
        return self.core[3] - self.y

    @property
    def pixel_count(self):
        return self.width * self.height

    @property
    def processing_order(self):
        return self.index


@dataclass(frozen=True)
class ChannelStatistics:
    count: int
    minimum: int
    maximum: int
    sum: int
    sum_squares: int
    mean: float
    standard_deviation: float
    histogram: tuple[int, ...]


@dataclass(frozen=True)
class AnalysisResult:
    source_identity: SourceIdentity
    source_sha256: str
    generation_id: str
    status: str
    width: int
    height: int
    mode: str
    pixel_count: int
    channel_statistics: dict[str, ChannelStatistics] = field(default_factory=dict)
    luminance: ChannelStatistics | None = None
    tile_size: int = 512
    halo: int = 0
    tiles_processed: int = 0
    estimated_peak_memory: int = 0
    measured_peak_memory: int | None = None
    elapsed_seconds: float = 0.0
    decode_seconds: float = 0.0
    warnings: tuple[str, ...] = ()
    unsupported_reason: str | None = None
    luminance_method: str = 'Pillow convert L: integer BT.601, unmanaged raw samples'

    schema_version: str = '1.0'
    analysis_id: str = field(default_factory=lambda: uuid4().hex)
    completion_status: str = field(init=False)
    image_width: int = field(init=False)
    image_height: int = field(init=False)
    analysis_width: int = field(init=False)
    analysis_height: int = field(init=False)
    analysis_mode: str = field(init=False)
    processing_strategy: str = field(init=False)
    elapsed_time: float = field(init=False)
    memory_estimate: int = field(init=False)
    histogram_data: dict[str, tuple[int, ...]] = field(init=False)
    statistics: dict[str, ChannelStatistics] = field(init=False)

    def __post_init__(self):
        values = {
            'completion_status': self.status, 'image_width': self.width,
            'image_height': self.height, 'analysis_width': self.width,
            'analysis_height': self.height, 'analysis_mode': self.mode,
            'processing_strategy': 'Full-resolution tiled aggregation' if self.status == 'Complete' else 'Not analyzed',
            'elapsed_time': self.elapsed_seconds, 'memory_estimate': self.estimated_peak_memory,
            'histogram_data': {name: stats.histogram for name, stats in self.channel_statistics.items()},
            'statistics': dict(self.channel_statistics),
        }
        for name, value in values.items():
            object.__setattr__(self, name, value)

    @property
    def histograms(self):
        return {name: stats.histogram for name, stats in self.channel_statistics.items()}
