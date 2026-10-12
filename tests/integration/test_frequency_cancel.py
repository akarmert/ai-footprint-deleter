import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import threading
import time
from PIL import Image
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QCoreApplication,QEvent
from app.ui.main_window import MainWindow
from modules.analysis.frequency_engine import FrequencyEngine


def test_pane_cancel_controls_follow_real_worker_lifecycle(tmp_path,monkeypatch):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'a.png'; Image.new('RGB',(12,12)).save(source)
    window=MainWindow(); started=threading.Event(); release=threading.Event()
    original=FrequencyEngine.analyze
    def held(self,*args,**kwargs):
        started.set(); assert release.wait(10)
        return original(self,*args,**kwargs)
    monkeypatch.setattr(FrequencyEngine,'analyze',held)
    try:
        window.scan_result=window.workflow.scan(source)
        window.start_frequency()
        assert started.wait(5)
        assert window.frequency_pane.cancel_button.isEnabled()
        assert not window.frequency_pane.window.isEnabled()
        window.frequency_pane.cancel_button.click()
        assert all(task.cancel_requested.is_set() for task in window._tasks.values())
        release.set(); deadline=time.monotonic()+10
        while window._tasks:
            assert time.monotonic()<deadline
            app.processEvents(); time.sleep(.002)
        assert window.frequency_result is None
        assert window.frequency_pane.start_button.isEnabled()
    finally:
        release.set(); window.close(); app.processEvents()
        QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
        window.deleteLater(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
