import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import pytest
from PIL import Image
from PySide6.QtWidgets import QApplication
from app.ui.analysis_pane import AnalysisPane
from modules.analysis import AnalysisEngine


@pytest.mark.parametrize('mode,selection',[('L','L'),('RGBA','A')])
def test_histogram_selection_resets_when_next_image_lacks_channel(tmp_path,mode,selection):
    app=QApplication.instance() or QApplication([])
    first=tmp_path/'first.png'; second=tmp_path/'second.png'
    Image.new(mode,(4,4)).save(first); Image.new('RGB',(4,4),'red').save(second)
    pane=AnalysisPane(); pane.show_result(AnalysisEngine().analyze(first))
    pane.channel.setCurrentText(selection)
    pane.show_result(AnalysisEngine().analyze(second))
    assert pane.channel.currentText()=='RGB'
    assert pane.histogram.channels==('R','G','B')
    pane.show(); app.processEvents()
    assert pane.summary.height() >= pane.summary.fontMetrics().lineSpacing()*3
    pane.close()
