from pathlib import Path
import pytest
from PIL import Image
from app.services.dashboard_scan import scan_dashboard
from app.services.workflow import Workflow, OperationCancelled
from modules.analysis.exceptions import SourceChanged


def test_readonly_dashboard_preparation_matches_source(tmp_path):
    source=tmp_path/'Türkçe.png'; Image.new('RGB',(16,12)).save(source)
    original=source.read_bytes(); progress=[]
    result=scan_dashboard(source,progress=lambda done,total:progress.append((done,total)))
    assert result.scan.sha256==result.dashboard.source_sha256
    assert source.read_bytes()==original
    assert progress==[(1,2),(2,2)]


def test_dashboard_final_hash_rejects_replacement(tmp_path):
    source=tmp_path/'same.png'; Image.new('RGB',(8,8),'red').save(source)
    def progress(done,total):
        if done==1:
            Image.new('RGB',(8,8),'blue').save(source)
    with pytest.raises(SourceChanged):
        scan_dashboard(source,progress=progress)


def test_dashboard_cancel_before_publication(tmp_path):
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    cancelled=[False]
    def progress(done,total):
        cancelled[0]=True
    with pytest.raises(OperationCancelled):
        scan_dashboard(source,cancelled=lambda:cancelled[0],progress=progress)
