import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
from PIL import Image,PngImagePlugin
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication,QMessageBox
from app.ui.main_window import MainWindow


def test_custom_rights_require_consent_and_become_selectable(tmp_path,monkeypatch):
    app=QApplication.instance() or QApplication([])
    monkeypatch.setattr(QMessageBox,'warning',lambda *args:QMessageBox.StandardButton.Yes)
    source=tmp_path/'rights.png'
    info=PngImagePlugin.PngInfo(); info.add_text('Copyright','Authorized fixture rights')
    Image.new('RGB',(16,16)).save(source,pnginfo=info)
    window=MainWindow(); result=window.workflow.scan(str(source)); window.scan_result=result; window._populate_scan(result)
    row=next(i for i,f in enumerate(result.fields) if f.key.startswith('PNG text:'))
    assert not window.metadata.item(row,0).flags() & Qt.ItemFlag.ItemIsUserCheckable
    window.rights_check.setChecked(True)
    assert window.metadata.item(row,0).flags() & Qt.ItemFlag.ItemIsUserCheckable
    window.profile.setCurrentIndex(window.profile.findData('custom'))
    window.metadata.item(row,0).setCheckState(Qt.CheckState.Checked)
    assert result.fields[row].key in window._selected_keys()
    window.rights_check.setChecked(False)
    assert result.fields[row].key not in window._selected_keys()
    window.close(); app.processEvents()
