import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import time
from PIL import Image,PngImagePlugin
from PySide6.QtWidgets import QApplication,QMessageBox
from PySide6.QtCore import QCoreApplication,QEvent
from app.ui.main_window import MainWindow


def wait(app,predicate):
    deadline=time.monotonic()+10
    while not predicate():
        assert time.monotonic()<deadline
        app.processEvents(); time.sleep(.002)
    app.processEvents()


def test_dashboard_receives_current_real_scan_without_mutation(tmp_path):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'Türkçe.png'; info=PngImagePlugin.PngInfo(); info.add_text('Author','Test author')
    Image.new('RGB',(16,12),'green').save(source,pnginfo=info)
    before=source.read_bytes(); window=MainWindow()
    try:
        window.scan_path(str(source))
        wait(app,lambda:not window._tasks)
        assert window.scan_result is not None
        assert window.navigation.currentRow()==0
        assert window.metadata_overview._model.source_sha256==window.scan_result.sha256
        assert source.read_bytes()==before
    finally:
        window.close(); app.processEvents()
        QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)


def test_scan_failure_clears_dashboard(tmp_path,monkeypatch):
    app=QApplication.instance() or QApplication([])
    monkeypatch.setattr(QMessageBox,'critical',lambda *args:None)
    source=tmp_path/'bad.png'; source.write_bytes(b'broken')
    window=MainWindow()
    try:
        window.scan_path(str(source))
        wait(app,lambda:not window._tasks)
        assert window.scan_result is None
        assert window.metadata_overview._model is None
        assert window.metadata_overview.state=='failed'
    finally:
        window.close(); app.processEvents()
        QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
