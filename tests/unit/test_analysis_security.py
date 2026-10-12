import hashlib
import socket
import pytest
from PIL import Image
from modules.analysis import AnalysisEngine, MemoryBudget, SourceChanged


def test_analysis_never_uses_python_network_and_preserves_original(tmp_path,monkeypatch):
    source=tmp_path/'offline.png'
    Image.new('RGBA',(20,13),(5,15,25,0)).save(source)
    before=source.read_bytes()
    def deny(*args,**kwargs):
        pytest.fail('analysis attempted Python network')
    monkeypatch.setattr(socket,'create_connection',deny)
    monkeypatch.setattr(socket.socket,'connect',deny)
    budget=MemoryBudget(64*1024*1024)
    result=AnalysisEngine(budget).analyze(source,expected_sha256=hashlib.sha256(before).hexdigest(),generation_id='offline')
    assert result.pixel_count==260
    assert source.read_bytes()==before
    assert budget.used_bytes==0


def test_same_path_replacement_with_stale_hash_is_rejected(tmp_path):
    source=tmp_path/'same.png'
    Image.new('RGB',(8,8),'red').save(source)
    oldhash=hashlib.sha256(source.read_bytes()).hexdigest()
    Image.new('RGB',(8,8),'blue').save(source)
    replacement=source.read_bytes()
    with pytest.raises(SourceChanged):
        AnalysisEngine().analyze(source,expected_sha256=oldhash,generation_id='old')
    assert source.read_bytes()==replacement
