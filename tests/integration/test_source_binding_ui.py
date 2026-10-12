import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import time
from PIL import Image, PngImagePlugin
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox
from app.ui.main_window import MainWindow


def test_ui_rejects_changed_source_with_stale_custom_selection(tmp_path,monkeypatch):
    app=QApplication.instance() or QApplication([])
    source=tmp_path/'source.png'
    info=PngImagePlugin.PngInfo(); info.add_text('Author','original')
    Image.new('RGB',(12,12),'red').save(source,pnginfo=info)
    window=MainWindow()
    scan=window.workflow.scan(str(source)); window.scan_result=scan; window._populate_scan(scan)
    window.profile.setCurrentIndex(window.profile.findData('custom'))
    row=next(i for i,f in enumerate(scan.fields) if f.removable)
    window.metadata.item(row,0).setCheckState(Qt.CheckState.Checked)
    replacement=PngImagePlugin.PngInfo(); replacement.add_text('Comment','replacement')
    Image.new('RGB',(12,12),'blue').save(source,pnginfo=replacement)
    expected=source.read_bytes()
    target=tmp_path/'out.png'
    monkeypatch.setattr(QFileDialog,'getSaveFileName',lambda *args:(str(target),'PNG'))
    errors=[]
    monkeypatch.setattr(QMessageBox,'critical',lambda *args:errors.append(args[-1]))
    try:
        window.clean_image()
        deadline=time.monotonic()+10
        while window._tasks:
            assert time.monotonic()<deadline
            app.processEvents(); time.sleep(.002)
        assert any('yeniden analiz' in message for message in errors)
        assert not target.exists()
        assert source.read_bytes()==expected
        assert window.process_result is None
    finally:
        window.close(); app.processEvents()
