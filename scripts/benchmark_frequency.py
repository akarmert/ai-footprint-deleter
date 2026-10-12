"""Offline frequency timings/PSAPI counters on disposable synthetic or local copies."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import statistics
import math
import os
import contextlib
import io
import subprocess
import sys
import tempfile
import time
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from scripts.benchmark import memory
from scripts.benchmark_analysis import fixture


MAX_INPUT_BYTES = 128 * 1024 ** 2


def bounded_transfer(path, destination=None):
    """Bound both initial admission and bytes read if a source grows mid-read."""
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        if os.fstat(stream.fileno()).st_size > MAX_INPUT_BYTES:
            raise ValueError('Input exceeds supported byte limit')
        total = 0
        while True:
            block = stream.read(min(1024 ** 2, MAX_INPUT_BYTES - total + 1))
            if not block:
                break
            total += len(block)
            if total > MAX_INPUT_BYTES:
                raise ValueError('Input exceeds supported byte limit')
            digest.update(block)
            if destination is not None:
                destination.write(block)
    return digest.hexdigest()


def source_digest(path):
    return bounded_transfer(path)


def copy_source(source, target):
    with Path(target).open('xb') as destination:
        return bounded_transfer(source, destination)


def validate_repeats(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 3:
        raise ValueError('At least 3 repeats are required')
    return value


def wait_preview(app, window, timeout):
    deadline = time.perf_counter() + timeout
    while any(getattr(view, '_loading', False) for view in
              (window.analysis_preview, window.before_preview)):
        app.processEvents()
        if time.perf_counter() >= deadline:
            raise RuntimeError('Preview timeout')
        time.sleep(.001)


def run_case(width,height,kind,repeats,input_path=None,timeout=180):
    if input_path is None:
        validate_repeats(repeats)
    import numpy as np
    from PIL import Image
    from modules.analysis.frequency_engine import FrequencyEngine
    from modules.analysis import AnalysisCancelled
    from modules.analysis.spectrum_visualization import display_spectrum
    from PySide6.QtWidgets import QApplication
    from PySide6.QtCore import QTimer,QCoreApplication,QEvent
    from app.ui.main_window import MainWindow
    with tempfile.TemporaryDirectory(prefix='afc-frequency-') as directory:
        path=Path(directory)/('source'+{'jpeg':'.jpg','webp':'.webp'}.get(kind,'.png'))
        if input_path is None:
            fixture(path,width,height,kind)
        else:
            path = Path(directory) / ('source' + Path(input_path).suffix.lower())
            copy_source(input_path, path)
        if kind=='gray':
            image=Image.open(path)
            converted=image.convert('L'); converted.save(path); converted.close(); image.close()
        with path.open('rb') as stream: sha=hashlib.file_digest(stream,'sha256').hexdigest()
        result=None; durations=[]; stages=[]
        for _ in range(repeats):
            started=time.perf_counter(); current=FrequencyEngine().analyze(path,expected_sha256=sha)
            durations.append(time.perf_counter()-started); stages.append(current.timings)
            if result is not None:
                for name in current.channels: np.testing.assert_allclose(current.channels[name]['dct_energy'],result.channels[name]['dct_energy'])
            result=current
        started=time.perf_counter(); display_spectrum(result.channels['Y']['power_preview']); visual=time.perf_counter()-started
        stop=[False]; cancel_started=[0.]
        def progress(*args):stop[0]=True; cancel_started[0]=time.perf_counter()
        try:FrequencyEngine().analyze(path,cancelled=lambda:stop[0],progress=progress); cancelled=False
        except AnalysisCancelled:cancelled=True
        cancel_latency=time.perf_counter()-cancel_started[0]
        app=QApplication.instance() or QApplication([]); window=MainWindow(); window.show()
        scan=window.workflow.scan(path); window.scan_result=scan; window._populate_scan(scan)
        wait_preview(app, window, min(timeout, 30))
        ticks=[]; timer=QTimer(); timer.setInterval(10); timer.timeout.connect(lambda:ticks.append(time.perf_counter())); timer.start()
        started=time.perf_counter(); window.start_frequency(); deadline=started+timeout
        while window._tasks:
            app.processEvents(); time.sleep(.001)
            if time.perf_counter()>deadline:raise RuntimeError('UI timeout')
        ended=time.perf_counter(); timer.stop(); gaps=[b-a for a,b in zip([started]+ticks,ticks+[ended])]
        status=window.frequency_result.status if window.frequency_result else 'Failed'; window.close(); app.processEvents()
        QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
        window.deleteLater(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
        with path.open('rb') as stream:preserved=hashlib.file_digest(stream,'sha256').hexdigest()==sha
        return {'kind':kind,'width':result.width,'height':result.height,'bytes':path.stat().st_size,'numpy':np.__version__,
            'dtype':'float64/complex128','options':result.options,'durations':durations,'mean_seconds':statistics.mean(durations),
            'min_seconds':min(durations),'max_seconds':max(durations),
            'timings':stages,'visualization_seconds':visual,'memory':memory(),'tile_count':result.tiles_processed,
            'cancelled':cancelled,'cancel_latency':cancel_latency,'source_preserved':preserved,
            'ui_status':status,'ui_max_tick_gap_seconds':max(gaps)}


def run_rejection(input_path, budget_mib):
    from modules.analysis import MemoryBudget
    from modules.analysis.exceptions import MemoryBudgetExceeded
    from modules.analysis.frequency_engine import FrequencyEngine
    with tempfile.TemporaryDirectory(prefix='afc-frequency-budget-') as directory:
        path = Path(directory) / ('source' + Path(input_path).suffix.lower())
        copy_source(input_path, path)
        digest = source_digest(path)
        budget = MemoryBudget(budget_mib * 1024 ** 2)
        before = memory()
        started = time.perf_counter()
        try:
            FrequencyEngine(budget=budget).analyze(path, expected_sha256=digest)
            status = 'Completed'
        except MemoryBudgetExceeded:
            status = 'MemoryBudgetExceeded'
        elapsed = time.perf_counter() - started
        return {'status': status, 'duration_seconds': elapsed,
                'budget_bytes': budget.limit_bytes, 'released_bytes': budget.used_bytes,
                'baseline_memory': before, 'memory': memory(),
                'source_preserved': source_digest(path) == digest,
                'scope': 'Engine admission budget; not an OS physical-memory limit'}


def child_record(arguments, timeout):
    try:
        completed = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), *arguments],
            cwd=ROOT, text=True, capture_output=True, timeout=timeout, check=True,
            env={**os.environ, 'QT_QPA_PLATFORM': 'offscreen'})
        return json.loads(completed.stdout)
    except (subprocess.SubprocessError, ValueError):
        raise RuntimeError('Benchmark subprocess failed or timed out; details suppressed for privacy') from None


def real_document(input_path, repeats, timeout, budget_mib=None):
    validate_repeats(repeats)
    digest = source_digest(input_path)
    records = []
    for _ in range(repeats):
        arguments = ['--input', str(input_path), '--worker',
                     '--timeout', str(timeout)]
        if budget_mib is not None:
            arguments += ['--budget-mib', str(budget_mib)]
        records.append(child_record(arguments, timeout))
    durations = [record['duration_seconds'] if budget_mib is not None
                 else record['durations'][0] for record in records]
    return {'platform': platform.platform(), 'processor': platform.processor(),
            'python': platform.python_version(), 'repeats': repeats,
            'fixture': 'real local image; licensing not inferred or verified by this script',
            'mode': 'budget-admission' if budget_mib is not None else 'real-photo',
            'isolation': 'one fresh subprocess per repeat; temporary source copy',
            'durations': durations, 'mean_seconds': statistics.mean(durations),
            'min_seconds': min(durations), 'max_seconds': max(durations),
            'source_preserved': source_digest(input_path) == digest,
            'cases': records}


def main():
    p = argparse.ArgumentParser()
    source = p.add_mutually_exclusive_group()
    source.add_argument('--case', nargs=3)
    source.add_argument('--input', type=Path)
    p.add_argument('--repeats', type=int, default=3)
    p.add_argument('--output', type=Path)
    p.add_argument('--timeout', type=float, default=180)
    p.add_argument('--budget-mib', type=int)
    p.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    args = p.parse_args()
    try:
        validate_repeats(args.repeats)
    except ValueError as exc:
        p.error(str(exc))
    if not math.isfinite(args.timeout) or not 1 <= args.timeout <= 3600:
        p.error('Timeout must be finite and between 1 and 3600 seconds')
    if args.budget_mib is not None and (args.budget_mib < 1 or args.input is None):
        p.error('A positive budget and --input are required for budget mode')
    if args.worker and (args.input is None or args.output is not None):
        p.error('Worker requires input and cannot write output')
    if args.input is not None and (not args.input.is_file() or
            args.input.suffix.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff')):
        p.error('Input must be a local supported image file')
    if args.output is not None and args.output.exists():
        p.error('Output already exists; refusing to overwrite evidence')
    try:
        if args.worker:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                doc = (run_rejection(args.input, args.budget_mib) if args.budget_mib is not None
                       else run_case(0, 0, 'real-photo', 1, args.input, args.timeout))
        elif args.input is not None:
            doc = real_document(args.input, args.repeats, args.timeout, args.budget_mib)
        elif args.case:
            doc = run_case(int(args.case[0]), int(args.case[1]), args.case[2], args.repeats,
                           timeout=args.timeout)
        else:
            cases=[(1920,1080,'uniform'),(3840,2160,'uniform'),(7680,4320,'uniform'),(8000,4999,'uniform'),(1920,1080,'complex'),(1920,1080,'jpeg'),(1920,1080,'webp'),(1920,1080,'alpha'),(1920,1080,'gray')]
            records = [child_record(['--case', str(w), str(h), k, '--repeats', str(args.repeats),
                                     '--timeout', str(args.timeout)], args.timeout) for w,h,k in cases]
            doc={'platform':platform.platform(),'processor':platform.processor(),'python':platform.python_version(),'repeats':args.repeats,'fixture':'synthetic only; no photo corpus','cases':records}
        text = json.dumps(doc, indent=2)
        if args.output:
            with args.output.open('x', encoding='utf-8') as stream:
                stream.write(text)
        print(text)
    except Exception:
        p.exit(1, 'Benchmark failed; source paths and exception details suppressed for privacy\n')


if __name__=='__main__':main()
