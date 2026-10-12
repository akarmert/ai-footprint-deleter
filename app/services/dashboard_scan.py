"""Worker-side read-only dashboard preparation; no GUI or mutation of scan results."""
from dataclasses import dataclass
from app.models.schema import ScanResult
from app.models.dashboard import DashboardModel, build_dashboard
import hashlib
from pathlib import Path
from app.services.workflow import Workflow, checkpoint as check_cancelled, MAX_BYTES
from modules.analysis.exceptions import SourceChanged


@dataclass(frozen=True)
class DashboardScan:
    scan: ScanResult
    dashboard: DashboardModel


def scan_dashboard(path, cancelled=None, progress=None, workflow=None):
    scan = (workflow or Workflow()).scan(path, cancelled=cancelled)
    check_cancelled(cancelled)
    model = build_dashboard(scan)
    if progress:
        progress(1, 2)
    digest = hashlib.sha256()
    count = 0
    try:
        with Path(scan.path).open('rb') as stream:
            while True:
                check_cancelled(cancelled)
                block = stream.read(1024 * 1024)
                if not block:
                    break
                count += len(block)
                if count > MAX_BYTES:
                    raise SourceChanged('Kaynak boyutu değişti; yeniden tarama gerekli.')
                digest.update(block)
    except OSError as error:
        raise SourceChanged('Kaynak erişilemiyor; yeniden tarama gerekli.') from error
    if count != scan.size_bytes or digest.hexdigest() != scan.sha256:
        raise SourceChanged('Kaynak tarama sırasında değişti; yeniden tarama gerekli.')
    check_cancelled(cancelled)
    if progress:
        progress(2, 2)
    return DashboardScan(scan, model)
