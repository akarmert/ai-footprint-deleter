import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import time
from PIL import Image
from PySide6.QtWidgets import QApplication,QMessageBox
from PySide6.QtCore import QCoreApplication,QEvent
from app.ui.main_window import MainWindow


def test_frequency_actual_worker_source_binding_and_switch(tmp_path):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'first.png'; Image.new('RGB',(17,19),'green').save(source)
    window=MainWindow()
    try:
        window.scan_result=window.workflow.scan(source)
        window.start_frequency({'tile_size':256,'window':'hann','subtract_mean':True})
        deadline=time.monotonic()+15
        while window._tasks:
            assert time.monotonic()<deadline
            app.processEvents(); time.sleep(.002)
        assert window.frequency_result.status=='Completed'
        assert window.frequency_result.source_sha256==window.scan_result.sha256
        assert window.frequency_pane.progress.value()==window.frequency_pane.progress.maximum()
        newer=tmp_path/'new.png'; Image.new('RGB',(8,8),'red').save(newer)
        window.scan_path(str(newer))
        assert window.frequency_result is None
        deadline=time.monotonic()+15
        while window._tasks:
            assert time.monotonic()<deadline
            app.processEvents(); time.sleep(.002)
        assert window.metadata_overview._model.source_sha256==window.scan_result.sha256
    finally:
        window.close(); app.processEvents(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
        window.deleteLater(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
