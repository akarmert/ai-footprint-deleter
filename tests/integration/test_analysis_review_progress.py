import os
os.environ.setdefault('QT_QPA_PLATFORM','offscreen')
import pytest
from PIL import Image
from PySide6.QtWidgets import QApplication
from app.ui.analysis_pane import AnalysisPane
from modules.analysis import AnalysisEngine, AnalysisOptions, SourceChanged


def test_progress_reaches_completion_only_after_source_validation(tmp_path):
    source=tmp_path/'source.png'
    Image.new('RGB',(3,3),'red').save(source)
    app=QApplication.instance() or QApplication([])
    pane=AnalysisPane()
    observations=[]
    def progress(done,total):
        pane.set_progress(done,total)
        observations.append((done,total,pane.progress.value(),pane.progress.maximum()))
    result=AnalysisEngine(options=AnalysisOptions(tile_size=1)).analyze(source,progress=progress)
    assert observations
    assert observations[-1][2] < observations[-1][3]
    pane.show_result(result)
    assert pane.progress.value()==pane.progress.maximum()
    pane.close()


def test_failed_final_validation_never_displays_completed_progress(tmp_path):
    source=tmp_path/'changed.png'
    Image.new('RGB',(3,3),'red').save(source)
    app=QApplication.instance() or QApplication([])
    pane=AnalysisPane()
    def progress(done,total):
        pane.set_progress(done,total)
        if done==total:
            Image.new('RGB',(3,3),'blue').save(source)
    with pytest.raises(SourceChanged):
        AnalysisEngine(options=AnalysisOptions(tile_size=1)).analyze(source,progress=progress)
    assert pane.progress.value() < pane.progress.maximum()
    assert 'Kaynak doğrulanıyor' in pane.progress.format()
    pane.clear('Kaynak değişti')
    assert pane.progress.value()==0
    assert pane.progress.format()=='%p%'
    pane.close()
