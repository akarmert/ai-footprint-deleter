import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import pytest
from PIL import Image
from PySide6.QtCore import QCoreApplication,QEvent
from PySide6.QtWidgets import QApplication
from app.models.dashboard import build_dashboard
from app.services.workflow import Workflow
from app.ui.metadata_overview import MetadataOverview


@pytest.mark.parametrize('category',['xmp','iptc'])
def test_unparsed_empty_filter_preserves_unsupported_scope(tmp_path,category):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    view=MetadataOverview()
    try:
        view.show_model(build_dashboard(Workflow().scan(source)))
        view.set_filter(category)
        assert not view.filter_notice.isHidden()
        assert 'semantik' in view.filter_notice.text().lower()
        assert 'desteklenmiyor' in view.filter_notice.text().lower()
        assert 'yokluk' in view.filter_notice.text().lower()
    finally:
        view.close(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
        view.deleteLater(); QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
