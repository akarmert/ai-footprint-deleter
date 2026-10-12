"""Python network guard coverage only; native SDK sockets require OS-level tracing."""
import socket
from PIL import Image
from app.services.workflow import Workflow


def test_local_scan_clean_without_python_network(tmp_path, monkeypatch):
    from app.models.schema import CleanOptions
    attempts=[]
    def denied(*args,**kwargs):
        attempts.append((args,kwargs))
        raise AssertionError('Unexpected Python network attempt')
    monkeypatch.setattr(socket,'create_connection',denied)
    monkeypatch.setattr(socket.socket,'connect',denied)
    source=tmp_path/'local.png'
    Image.new('RGBA',(24,16)).save(source)
    result=Workflow().clean(str(source),str(tmp_path/'clean.png'),CleanOptions())
    assert result.checks['pixels'] == 'Verified'
    assert attempts == []
