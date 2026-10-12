import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

import time

from PIL import Image, PngImagePlugin
from PySide6.QtWidgets import QApplication, QMessageBox

from app.ui.main_window import MainWindow
from modules.analysis import AnalysisEngine, AnalysisOptions


def wait_until(app, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while not predicate():
        assert time.monotonic() < deadline, 'Qt worker timeout'
        app.processEvents()
        time.sleep(0.002)
    app.processEvents()


def test_source_deleted_after_first_tile_invalidates_until_metadata_rescan(tmp_path, monkeypatch):
    app = QApplication.instance() or QApplication([])
    monkeypatch.setattr('app.ui.main_window.stale_temp_candidates', lambda: [])
    errors = []
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: errors.append(args))
    source = tmp_path / 'removed-during-analysis.png'
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('parameters', 'local-test-metadata')
    Image.new('RGB', (3, 3), (30, 60, 90)).save(source, pnginfo=metadata)
    original_bytes = source.read_bytes()
    window = MainWindow()
    window.analysis_engine = AnalysisEngine(options=AnalysisOptions(tile_size=1))
    window.show()
    progress_events = []
    invalidations = []
    original_invalidated = window._task_invalidated
    original_analyze = window.analysis_engine.analyze

    def invalidated(task_id, message):
        invalidations.append((task_id, message))
        original_invalidated(task_id, message)

    def analyze(*args, progress=None, **kwargs):
        def remove_after_first_tile(processed, total):
            progress_events.append((processed, total))
            if processed == 1:
                source.unlink()
            if progress is not None:
                progress(processed, total)
        return original_analyze(*args, progress=remove_after_first_tile, **kwargs)

    monkeypatch.setattr(window, '_task_invalidated', invalidated)
    monkeypatch.setattr(window.analysis_engine, 'analyze', analyze)
    try:
        window.scan_path(str(source))
        wait_until(app, lambda: window.scan_result is not None and not window._tasks)
        wait_until(app, lambda: not window.analysis_preview._loading and not window.before_preview._loading)
        assert window.metadata.rowCount() > 0
        assert window.analysis_preview._has_image
        assert window.before_preview._has_image
        assert window.clean_button.isEnabled()
        assert window.analysis_pane.start_button.isEnabled()
        window.start_analysis()
        wait_until(app, lambda: not window._tasks)
        assert progress_events[0] == (1, 9)
        assert not source.exists()
        assert len(invalidations) == 1
        assert not errors
        assert window.scan_result is None
        assert window.process_result is None
        assert window.analysis_result is None
        assert window.analysis_pane.result is None
        assert window.metadata.rowCount() == 0
        assert window.analysis_pane.statistics.rowCount() == 0
        assert window.analysis_pane.histogram.histograms == {}
        for preview in (window.analysis_preview, window.before_preview, window.after_preview):
            assert not preview._has_image
            assert not preview._loading
        assert not window.clean_button.isEnabled()
        assert not window.analysis_pane.start_button.isEnabled()
        assert not window.analysis_pane.export_button.isEnabled()
        assert 'yeniden' in window.scan_summary.text().lower()
        assert 'yeniden' in window.analysis_pane.summary.text().lower()
        window.start_analysis()
        assert not window._tasks
        source.write_bytes(original_bytes)
        assert not window.analysis_pane.start_button.isEnabled()
        window.scan_path(str(source))
        wait_until(app, lambda: window.scan_result is not None and not window._tasks)
        assert window.metadata.rowCount() > 0
        assert window.clean_button.isEnabled()
        assert window.analysis_pane.start_button.isEnabled()
    finally:
        window.close()
        wait_until(app, lambda: not window._tasks)
        app.processEvents()
