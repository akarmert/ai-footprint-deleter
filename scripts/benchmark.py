"""Opt-in Windows benchmark; disposable fixtures, real process working-set counters."""
import argparse
import ctypes
import gc
import json
import platform
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class Memory(ctypes.Structure):
    _fields_ = [('cb',ctypes.c_ulong),('PageFaultCount',ctypes.c_ulong),
                ('PeakWorkingSetSize',ctypes.c_size_t),('WorkingSetSize',ctypes.c_size_t),
                ('QuotaPeakPagedPoolUsage',ctypes.c_size_t),('QuotaPagedPoolUsage',ctypes.c_size_t),
                ('QuotaPeakNonPagedPoolUsage',ctypes.c_size_t),('QuotaNonPagedPoolUsage',ctypes.c_size_t),
                ('PagefileUsage',ctypes.c_size_t),('PeakPagefileUsage',ctypes.c_size_t)]


def memory():
    if sys.platform != 'win32':
        return {'status':'Not Tested'}
    counters = Memory()
    counters.cb = ctypes.sizeof(counters)
    ctypes.windll.kernel32.GetCurrentProcess.restype = ctypes.c_void_p
    handle = ctypes.windll.kernel32.GetCurrentProcess()
    function = ctypes.windll.psapi.GetProcessMemoryInfo
    function.argtypes = [ctypes.c_void_p,ctypes.POINTER(Memory),ctypes.c_ulong]
    if not function(handle, ctypes.byref(counters), counters.cb):
        raise ctypes.WinError()
    return {'peak_working_set_bytes':counters.PeakWorkingSetSize,'working_set_bytes':counters.WorkingSetSize}


def case(width,height,repeats):
    from PIL import Image,PngImagePlugin
    from app.services.workflow import Workflow
    from app.models.schema import CleanOptions
    from PySide6.QtWidgets import QApplication
    from PySide6.QtCore import QTimer
    from app.ui.main_window import MainWindow
    app = QApplication.instance() or QApplication([])
    with tempfile.TemporaryDirectory(prefix='afc-benchmark-') as directory:
        source = Path(directory)/'fixture.png'
        info = PngImagePlugin.PngInfo()
        info.add_text('parameters','benchmark fixture prompt')
        image = Image.new('RGBA',(width,height),(40,90,150,190))
        image.save(source,pnginfo=info)
        del image
        gc.collect()
        baseline = memory()
        workflow = Workflow()
        started=time.perf_counter(); scan=workflow.scan(str(source)); scan_seconds=time.perf_counter()-started
        started=time.perf_counter(); result=workflow.clean(str(source),str(Path(directory)/'clean.png'),CleanOptions()); clean_seconds=time.perf_counter()-started
        # Independent verification timing includes reopen/decode/full scanner, separate from end-to-end clean.
        started=time.perf_counter(); workflow.scan(result.after.path); verification_seconds=time.perf_counter()-started
        for _ in range(repeats):
            workflow.scan(str(source))
        gc.collect()
        after_repeated=memory()
        window=MainWindow()
        ticks=[]
        timer=QTimer(); timer.setInterval(10); timer.timeout.connect(lambda:ticks.append(time.perf_counter())); timer.start()
        window.show(); start=time.perf_counter(); window.scan_path(str(source))
        deadline=start+120
        while window._tasks or any(getattr(view, '_loading', False) for view in (window.analysis_preview,window.before_preview,window.after_preview)):
            app.processEvents()
            if time.perf_counter()>deadline:
                raise RuntimeError('UI benchmark timeout')
            time.sleep(.001)
        end=time.perf_counter(); timer.stop()
        gaps=[b-a for a,b in zip([start]+ticks,ticks+[end])]
        window.close(); window.deleteLater(); app.processEvents(); gc.collect()
        return {'width':width,'height':height,'file_bytes':source.stat().st_size,
                'scan_seconds':scan_seconds,'clean_verify_seconds':clean_seconds,
                'independent_rescan_seconds':verification_seconds,'repeat_scan_count':repeats,
                'baseline_memory':baseline,'after_repeated_memory':after_repeated,'final_memory':memory(),
                'ui_scan_seconds':end-start,'ui_timer_ticks':len(ticks),'ui_max_tick_gap_seconds':max(gaps),
                'checks':result.checks}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--case',nargs=2,type=int)
    parser.add_argument('--repeats',type=int,default=20)
    parser.add_argument('--output')
    args=parser.parse_args()
    if args.case:
        print(json.dumps(case(args.case[0],args.case[1],args.repeats)))
        return
    cases=[]
    for size in [(1920,1080),(3840,2160),(7680,4320),(8000,4999)]:
        output=subprocess.check_output([sys.executable,__file__,'--case',*map(str,size),'--repeats',str(args.repeats)],cwd=ROOT,text=True)
        cases.append(json.loads(output))
    result={'platform':platform.platform(),'processor':platform.processor(),'python':platform.python_version(),
            'fixture':'uniform RGBA PNG locally generated; decode workload not representative of all real images',
            'cases':cases}
    payload=json.dumps(result,indent=2)
    if args.output:
        with Path(args.output).open('x',encoding='utf-8') as stream:
            stream.write(payload)
    print(payload)


if __name__ == '__main__':
    main()
