"""Explicit, disposable runtime diagnostic for source and frozen Windows builds."""
import json
from pathlib import Path
from PySide6.QtCore import QTimer
from PIL import Image, PngImagePlugin
from app.models.schema import CleanOptions
from modules.reporting.exporter import export_report


def run_smoke(application, window, directory):
    directory = Path(directory).resolve(strict=True)
    source = directory / 'Türkçe_fixture.png'
    target = directory / 'Türkçe_clean.png'
    report = directory / 'privacy-safe.json'
    evidence = directory / 'smoke-result.json'
    if any(p.exists() for p in (source,target,report,evidence)):
        raise ValueError('Smoke test yalnız boş çıktı adlarıyla çalışır.')
    info = PngImagePlugin.PngInfo()
    info.add_text('parameters', 'disposable smoke fixture')
    Image.new('RGBA',(160,120),(40,80,140,180)).save(source,pnginfo=info)
    window.show()
    window.scan_path(str(source))
    phase = ['scan']
    deadline = __import__('time').monotonic() + 60
    timer = QTimer(window)
    timer.setInterval(20)

    def advance():
        if __import__('time').monotonic() > deadline:
            timer.stop(); application.exit(2); return
        if window._tasks or any(getattr(view, '_loading', False) for view in (window.analysis_preview, window.before_preview, window.after_preview)):
            return
        try:
            if phase[0] == 'scan':
                if window.scan_result is None:
                    raise RuntimeError('Smoke scan failed')
                model=window.metadata_overview._model
                if model is None or model.source_sha256 != window.scan_result.sha256:
                    raise RuntimeError('Dashboard source binding failed')
                window.metadata_overview.set_expanded(True)
                window.grab().save(str(directory/'dashboard-window.png'))
                phase[0] = 'clean'
                window._submit('clean',lambda:window.workflow.clean(str(source),str(target),CleanOptions()))
            elif phase[0] == 'clean':
                if window.process_result is None:
                    raise RuntimeError('Smoke clean failed')
                phase[0] = 'analyze'
                window.navigation.setCurrentRow(3)
                window.start_analysis()
            elif phase[0] == 'analyze':
                phase[0] = 'frequency'
                window.start_frequency()
            else:
                if window.frequency_result is None or window.frequency_result.status != 'Completed':
                    raise RuntimeError('Smoke frequency failed')
                export_report(directory/'frequency-safe.json',window.frequency_result,True)
                if window.process_result is None:
                    raise RuntimeError('Smoke clean failed')
                result=window.process_result
                analysis=window.analysis_result
                if analysis is None or analysis.status != 'Complete' or analysis.pixel_count != 160*120:
                    raise RuntimeError('Smoke analysis failed')
                export_report(directory/'analysis-safe.json',analysis,True)
                export_report(report,result,True)
                data={'checks':result.checks,'status':result.status,'qt_platform':application.platformName(),
                      'frequency_status':window.frequency_result.status,'frequency_channels':list(window.frequency_result.channels),
                      'frequency_source_bound':window.frequency_result.source_sha256==result.before.sha256,
                      'analysis_status':analysis.status,'analysis_pixel_count':analysis.pixel_count,'analysis_tiles':analysis.tiles_processed,
                      'analysis_source_bound':analysis.source_sha256==result.before.sha256,
                      'dashboard_source_bound':window.metadata_overview._model.source_sha256==result.before.sha256,
                      'dashboard_field_count':window.metadata_overview._model.metadata_field_count,
                      'dashboard_container_count':window.metadata_overview._model.container_count,
                      'c2pa':result.before.c2pa,'source_preserved':window.workflow.scan(str(source)).sha256 == result.before.sha256}
                with evidence.open('x',encoding='utf-8') as stream:
                    json.dump(data,stream,ensure_ascii=False,indent=2)
                window.grab().save(str(directory/'smoke-window.png'))
                timer.stop(); application.exit(0)
        except Exception as exc:
            print(str(exc),flush=True)
            timer.stop(); application.exit(3)
    timer.timeout.connect(advance)
    timer.start()
    return timer
