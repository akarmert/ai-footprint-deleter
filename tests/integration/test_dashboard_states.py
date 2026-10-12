import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from dataclasses import replace
import time
from PIL import Image
from PySide6.QtCore import QCoreApplication,QEvent
from PySide6.QtWidgets import QApplication,QLabel,QMessageBox
from app.models.dashboard import build_dashboard
from app.services.workflow import Workflow
from app.ui.main_window import MainWindow
from app.ui.metadata_overview import MetadataOverview


def test_unknown_claims_and_busy_states_are_truthful(tmp_path):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    scan=Workflow().scan(source)
    scan.c2pa={'presence':'unknown','status':'Not Tested'}
    view=MetadataOverview()
    try:
        view.show_model(build_dashboard(scan))
        texts='\n'.join(label.text() for label in view.findChildren(QLabel))
        assert 'Kontrol edilemedi' in texts
        assert view.filter_buttons['all'].text().endswith('0')
        for state,title in [('scanning','Metadata taranıyor'),('verifying','Kaynak kimliği doğrulanıyor'),('failed','Tarama hatası')]:
            view.set_state(state,'test')
            assert view.headline.text()==title
    finally:
        view.close(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)


def test_twenty_dashboard_scan_resets_preserve_latest_generation(tmp_path):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'same.png'; Image.new('RGB',(8,8),'blue').save(source)
    window=MainWindow()
    try:
        for _ in range(20):
            window.scan_path(str(source))
            app.processEvents()
        deadline=time.monotonic()+15
        while window._tasks or window._pending_path:
            assert time.monotonic()<deadline
            app.processEvents(); time.sleep(.002)
        assert window.scan_result is not None
        assert window.metadata_overview._model.source_sha256==window.scan_result.sha256
        assert window.metadata_overview.state=='ready'
    finally:
        window.close(); app.processEvents(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
