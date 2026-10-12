from dataclasses import asdict, dataclass, field


@dataclass
class MetadataField:
    key: str
    value: str
    standard: str
    removable: bool
    impact: str
    category: str


@dataclass
class ScanResult:
    path: str
    sha256: str
    format: str
    width: int
    height: int
    mode: str
    size_bytes: int
    fields: list[MetadataField]
    c2pa: dict
    warnings: list[str] = field(default_factory=list)


@dataclass
class CleanOptions:
    mode: str = 'privacy'
    remove_keys: tuple[str, ...] = ()
    remove_c2pa: bool = False
    remove_rights: bool = False
    expected_source_sha256: str | None = None


@dataclass
class ProcessResult:
    before: ScanResult
    after: ScanResult
    removed: list[str]
    preserved: list[str]
    checks: dict[str, str]
    status: str
    warnings: list[str]
    created_at: str
    payload_hashes: dict = field(default_factory=dict)

    def to_dict(self):
        return asdict(self)
