import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
import time
from pathlib import Path
from PIL import Image, PngImagePlugin
from PySide6.QtWidgets import QApplication
from app.ui.main_window import MainWindow
from app.models.schema import CleanOptions


def wait_until(app, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError('Qt worker timeout')
        app.processEvents()
        time.sleep(0.005)
    app.processEvents()


def test_native_window_scan_clean(tmp_path):
    app = QApplication.instance() or QApplication([])
    window = MainWindow()
    window.show()
    assert window.navigation.count() == 8
    source = tmp_path/'source.png'
    info = PngImagePlugin.PngInfo()
    info.add_text('parameters', 'seed: 42, prompt: fixture')
    Image.new('RGBA', (64,48), (25,80,125,180)).save(source, pnginfo=info)
    window.scan_path(str(source))
    wait_until(app, lambda: window.scan_result is not None and not window._tasks)
    assert window.scan_result.sha256
    assert window.metadata.rowCount() > 0
    window._submit('clean', lambda: window.workflow.clean(str(source), str(tmp_path/'after.png'), CleanOptions()))
    wait_until(app, lambda: window.process_result is not None and not window._tasks)
    assert window.process_result.checks['pixels'] == 'Verified'
    window.close()
    app.processEvents()
