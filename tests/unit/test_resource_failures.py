import struct
import pytest
from PIL import Image
from app.models.schema import CleanOptions
from app.services.workflow import Workflow
from modules.c2pa.reader import inspect_c2pa


def test_file_size_limit_and_invalid_path(tmp_path,monkeypatch):
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    monkeypatch.setattr('app.services.workflow.MAX_BYTES',10)
    with pytest.raises(ValueError,match='sınır'):
        Workflow().scan(str(source))
    with pytest.raises((FileNotFoundError,ValueError)):
        Workflow().scan(str(tmp_path/'missing.png'))


def test_decompression_bomb_warning_is_error(tmp_path,monkeypatch):
    source=tmp_path/'a.png'; Image.new('RGB',(10,10)).save(source)
    monkeypatch.setattr(Image,'MAX_IMAGE_PIXELS',60)
    with pytest.raises(Image.DecompressionBombWarning):
        Workflow().scan(str(source))


def test_disk_flush_failure_no_output_and_temp_cleanup(tmp_path,monkeypatch):
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    target=tmp_path/'out.png'
    monkeypatch.setattr('app.services.workflow.register_temp',lambda path:None)
    def full_disk(fd):
        raise OSError('simulated disk full')
    monkeypatch.setattr('app.services.workflow.os.fsync',full_disk)
    with pytest.raises(OSError,match='disk full'):
        Workflow().clean(str(source),str(target),CleanOptions())
    assert not target.exists()
    assert not list(tmp_path.glob('.afc-*'))


@pytest.mark.parametrize('fmt',['JPEG','WEBP'])
def test_native_corrupt_c2pa_never_cleaned(tmp_path,fmt):
    source=tmp_path/('a.jpg' if fmt=='JPEG' else 'a.webp')
    Image.new('RGB',(16,16)).save(source)
    data=source.read_bytes()
    if fmt=='JPEG':
        payload=b'JP\0\x01\0\0\0\x01jumb c2pa corrupt'
        segment=b'\xff\xeb'+struct.pack('>H',len(payload)+2)+payload
        data=data[:2]+segment+data[2:]
    else:
        payload=b'corrupt c2pa'
        segment=b'C2PA'+struct.pack('<I',len(payload))+payload+b'\0'*(len(payload)%2)
        body=data[8:]+segment
        data=b'RIFF'+struct.pack('<I',len(body))+body
    source.write_bytes(data)
    result=inspect_c2pa(data,fmt)
    assert result['status']=='Failed'
    target=tmp_path/('out'+source.suffix)
    with pytest.raises(ValueError,match='C2PA'):
        Workflow().clean(str(source),str(target),CleanOptions(remove_c2pa=True))
    assert not target.exists()
