"""Opt-in Phase2A analysis benchmark: real PSAPI counters, disposable fixtures."""
import argparse
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.benchmark import memory


def fixture(path,width,height,kind):
    from PIL import Image
    if kind=='uniform':
        image=Image.new('RGB',(width,height),(35,90,145))
    elif kind=='alpha':
        image=Image.new('RGBA',(width,height),(35,90,145,100))
    else:
        # Deterministic varied RGB tile; repeated spatial structure is synthetic,
        # not a substitute for a licensed real-photo corpus.
        tile=Image.frombytes('RGB',(256,256),bytes((i*73+(i//7)*19)%256 for i in range(256*256*3)))
        image=Image.new('RGB',(width,height))
        for y in range(0,height,256):
            for x in range(0,width,256):
                image.paste(tile,(x,y))
        tile.close()
    image.save(path)
    image.close()


def run_case(width,height,kind,repeats):
    from modules.analysis.engine import AnalysisEngine
    from modules.analysis.exceptions import AnalysisCancelled
    from modules.analysis import DEFAULT_BUDGET
    from PIL import Image
    suffix={'jpeg':'.jpg','webp':'.webp'}.get(kind,'.png')
    with tempfile.TemporaryDirectory(prefix='afc-analysis-bench-') as directory:
        path=Path(directory)/('fixture'+suffix)
        fixture(path,width,height,kind)
        with path.open('rb') as stream:
            sha=hashlib.file_digest(stream,'sha256').hexdigest()
        image=Image.open(path)
        try:
            started=time.perf_counter(); image.load(); decode=time.perf_counter()-started
        finally:
            image.close()
        engine=AnalysisEngine()
        results=[]; durations=[]
        for index in range(repeats):
            started=time.perf_counter()
            result=engine.analyze(str(path),expected_sha256=sha,generation_id=str(index))
            durations.append(time.perf_counter()-started); results.append(result)
        result=results[-1]
        reference=asdict(results[0])
        consistent=all(r.statistics==results[0].statistics and r.histogram_data==results[0].histogram_data for r in results)
        progress=[]
        try:
            engine.analyze(str(path),expected_sha256=sha,generation_id='cancel',cancelled=lambda:bool(progress),progress=lambda done,total:progress.append((done,total)))
            cancelled=False
        except AnalysisCancelled:
            cancelled=True
        # UI run is measured separately; includes metadata scan only for setup.
        from PySide6.QtWidgets import QApplication
        from PySide6.QtCore import QTimer
        from app.ui.main_window import MainWindow
        app=QApplication.instance() or QApplication([])
        window=MainWindow(); window.show()
        scan=window.workflow.scan(str(path)); window.scan_result=scan; window._populate_scan(scan)
        while any(getattr(view,'_loading',False) for view in (window.analysis_preview,window.before_preview)):
            app.processEvents(); time.sleep(.001)
        ticks=[]; timer=QTimer(); timer.setInterval(10); timer.timeout.connect(lambda:ticks.append(time.perf_counter())); timer.start()
        started=time.perf_counter(); window.start_analysis()
        deadline=started+180
        while window._tasks:
            app.processEvents(); time.sleep(.001)
            if time.perf_counter()>deadline:
                raise RuntimeError('analysis UI timeout')
        ended=time.perf_counter(); timer.stop()
        gaps=[b-a for a,b in zip([started]+ticks,ticks+[ended])]
        ui_result=window.analysis_result
        window.close(); window.deleteLater(); app.processEvents()
        with path.open('rb') as stream:
            preserved=hashlib.file_digest(stream,'sha256').hexdigest()==sha
        return {'kind':kind,'width':width,'height':height,'file_bytes':path.stat().st_size,'decode_seconds':decode,
                'analysis_seconds':durations,'analysis_min':min(durations),'analysis_max':max(durations),'analysis_mean':statistics.mean(durations),
                'tiles_processed':result.tiles_processed,'status':result.completion_status,'memory_estimate':result.memory_estimate,
                'memory':memory(),'results_consistent':consistent,'source_preserved':preserved,
                'cancelled_at_checkpoint':cancelled,'ui_seconds':ended-started,'ui_timer_ticks':len(ticks),'ui_max_tick_gap_seconds':max(gaps),
                'ui_status':ui_result.completion_status if ui_result else 'Failed'}


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--case',nargs=3); parser.add_argument('--repeats',type=int,default=3); parser.add_argument('--output')
    args=parser.parse_args()
    if args.repeats<1:
        parser.error('repeats >= 1')
    if args.case:
        print(json.dumps(run_case(int(args.case[0]),int(args.case[1]),args.case[2],args.repeats)))
        return
    cases=[(1920,1080,'uniform'),(3840,2160,'uniform'),(7680,4320,'uniform'),(8000,4999,'uniform'),
           (1920,1080,'complex'),(1920,1080,'jpeg'),(1920,1080,'webp'),(1920,1080,'alpha')]
    measurements=[]
    for width,height,kind in cases:
        output=subprocess.check_output([sys.executable,__file__,'--case',str(width),str(height),kind,'--repeats',str(args.repeats)],text=True,cwd=ROOT)
        measurements.append(json.loads(output))
    document={'platform':platform.platform(),'processor':platform.processor(),'python':platform.python_version(),
              'repeats':args.repeats,'method':'separate process per case; process peak includes fixture/decode/engine/UI setup; synthetic only; no p95 from three samples',
              'cases':measurements}
    payload=json.dumps(document,indent=2)
    if args.output:
        with Path(args.output).open('x',encoding='utf-8') as stream:
            stream.write(payload)
    print(payload)


if __name__=='__main__':
    main()
