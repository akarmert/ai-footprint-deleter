"""Fixtures are generated locally; no real personal image data is used."""
import os
from pathlib import Path
import pytest
from PIL import Image, PngImagePlugin
from app.services.workflow import Workflow
from app.models.schema import CleanOptions
from modules.metadata.containers import inventory, strip


@pytest.fixture
def workflow():
    return Workflow()


@pytest.mark.parametrize('fmt,ext', [('PNG','.png'), ('JPEG','.jpg'), ('WEBP','.webp')])
def test_lossless_privacy(tmp_path, workflow, fmt, ext):
    source, target = tmp_path / ('source'+ext), tmp_path / ('clean'+ext)
    image = Image.new('RGBA' if fmt == 'PNG' else 'RGB', (48, 32), (30, 80, 120, 100) if fmt == 'PNG' else (30, 80, 120))
    exif = Image.Exif()
    exif[315] = 'Private Author'
    kwargs = {'exif': exif, 'icc_profile': b'fixture-profile'}
    if fmt == 'PNG':
        info = PngImagePlugin.PngInfo()
        info.add_text('parameters', 'prompt: sample, seed: 42')
        kwargs['pnginfo'] = info
    image.save(source, **kwargs)
    original = source.read_bytes()
    result = workflow.clean(str(source), str(target), CleanOptions())
    assert source.read_bytes() == original
    assert result.status == 'Verified'
    assert result.removed
    assert result.checks['pixels'] == result.checks['icc'] == 'Verified'
    assert not any(s in ('EXIF', 'PNG text') for _, s, _ in inventory(target.read_bytes(), fmt))


def test_empty_and_custom(tmp_path, workflow):
    source = tmp_path / 'a.png'
    info = PngImagePlugin.PngInfo()
    info.add_text('Author', 'Alice')
    info.add_text('Comment', 'keep')
    Image.new('RGB', (16, 16)).save(source, pnginfo=info)
    fields = [f for f in workflow.scan(str(source)).fields if f.removable]
    result = workflow.clean(str(source), str(tmp_path/'b.png'), CleanOptions('custom', (fields[0].key,)))
    with Image.open(result.after.path) as im:
        assert 'Author' not in im.info
        assert im.info['Comment'] == 'keep'
    empty = tmp_path/'empty.png'
    Image.new('RGB', (2, 2)).save(empty)
    assert workflow.scan(str(empty)).fields == []


def test_overwrite_and_wrong_extension(tmp_path, workflow):
    source = tmp_path/'a.png'
    Image.new('RGB', (8, 8)).save(source)
    with pytest.raises(ValueError, match='üzerine'):
        workflow.clean(str(source), str(source), CleanOptions())
    other = tmp_path/'other.png'
    other.write_bytes(b'keep')
    with pytest.raises(ValueError):
        workflow.clean(str(source), str(other), CleanOptions())
    assert other.read_bytes() == b'keep'
    bad = tmp_path/'bad.jpg'
    bad.write_bytes(source.read_bytes())
    with pytest.raises(ValueError, match='uyuşmuyor'):
        workflow.scan(str(bad))


def test_corrupt_large_animation_and_tiff(tmp_path, workflow, monkeypatch):
    corrupt = tmp_path/'bad.png'
    corrupt.write_bytes(b'broken')
    with pytest.raises(Exception):
        workflow.scan(str(corrupt))
    image = tmp_path/'big.png'
    Image.new('RGB', (16,16)).save(image)
    monkeypatch.setattr('app.services.workflow.MAX_PIXELS', 100)
    with pytest.raises(ValueError, match='megapiksel'):
        workflow.scan(str(image))
    monkeypatch.setattr('app.services.workflow.MAX_PIXELS', 40_000_000)
    tiff = tmp_path/'a.tiff'
    Image.new('RGB', (8,8)).save(tiff)
    assert workflow.scan(str(tiff)).format == 'TIFF'
    with pytest.raises(ValueError, match='TIFF'):
        workflow.clean(str(tiff), str(tmp_path/'out.tiff'), CleanOptions())
    animated = tmp_path/'animated.png'
    Image.new('RGB',(8,8),'red').save(animated, save_all=True, append_images=[Image.new('RGB',(8,8),'blue')])
    with pytest.raises(ValueError, match='Animasyon'):
        workflow.scan(str(animated))


def test_orientation_guard(tmp_path, workflow):
    source = tmp_path/'a.jpg'
    exif = Image.Exif()
    exif[274] = 6
    Image.new('RGB',(16,8)).save(source, exif=exif)
    with pytest.raises(ValueError, match='yön'):
        workflow.clean(str(source), str(tmp_path/'out.jpg'), CleanOptions())
    assert not (tmp_path/'out.jpg').exists()


def test_c2pa_consent_gate(tmp_path, workflow, monkeypatch):
    source = tmp_path/'a.png'
    info = PngImagePlugin.PngInfo()
    info.add_text('Author', 'Alice')
    Image.new('RGB',(8,8)).save(source, pnginfo=info)
    monkeypatch.setattr('app.services.workflow.inspect_c2pa', lambda data, fmt: {'presence':'present','status':'Partially Verified'})
    with pytest.raises(ValueError, match='C2PA'):
        workflow.clean(str(source), str(tmp_path/'out.png'), CleanOptions())
    assert not (tmp_path/'out.png').exists()


def test_crc_rejected(tmp_path, workflow):
    source = tmp_path/'a.png'
    info = PngImagePlugin.PngInfo()
    info.add_text('Author', 'Alice')
    Image.new('RGB',(8,8)).save(source, pnginfo=info)
    data = bytearray(source.read_bytes())
    index = data.index(b'Alice')
    data[index] ^= 1
    with pytest.raises(ValueError):
        list(inventory(bytes(data), 'PNG'))


def test_progressive_jpeg_and_post_scan_metadata(tmp_path, workflow):
    source = tmp_path/'progressive.jpg'
    Image.new('RGB', (24, 24), 'blue').save(source, progressive=True)
    data = source.read_bytes()
    payload = b'Private comment'
    segment = b'\xff\xfe' + (len(payload)+2).to_bytes(2, 'big') + payload
    source.write_bytes(data[:-2] + segment + data[-2:])
    assert any(s == 'Comment' for _, s, _ in inventory(source.read_bytes(), 'JPEG'))
    result = workflow.clean(str(source), str(tmp_path/'out.jpg'), CleanOptions())
    assert result.checks['pixels'] == 'Verified'
    assert not any(s == 'Comment' for _, s, _ in inventory(Path(result.after.path).read_bytes(), 'JPEG'))


def test_xmp_orientation_change_not_published(tmp_path, workflow):
    source, target = tmp_path/'a.webp', tmp_path/'out.webp'
    xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:tiff="http://ns.adobe.com/tiff/1.0/" tiff:Orientation="6"/></rdf:RDF></x:xmpmeta>'
    Image.new('RGB', (12,8)).save(source, xmp=xmp)
    with Image.open(source) as im:
        assert im.getexif().get(274) == 6
    with pytest.raises(ValueError, match='doğrulama'):
        workflow.clean(str(source), str(target), CleanOptions())
    assert not target.exists()


def test_non_c2pa_jumbf_is_protected():
    from modules.metadata.containers import classify
    assert classify(b'\xeb', b'generic jumb not c2pa', 'JPEG') == 'APP11'


def test_jpeg_trailing_private_data_rejected(tmp_path, workflow):
    source = tmp_path/'a.jpg'
    Image.new('RGB', (8,8)).save(source)
    source.write_bytes(source.read_bytes() + b'private trailing GPS')
    with pytest.raises(ValueError, match='ek veri'):
        workflow.scan(str(source))


def test_publish_race_preserves_other_file(tmp_path, workflow, monkeypatch):
    source, target = tmp_path/'a.png', tmp_path/'out.png'
    Image.new('RGB', (8,8)).save(source)
    def race(temp, dest):
        target.write_bytes(b'other owner')
        raise PermissionError('sharing violation')
    monkeypatch.setattr('app.services.workflow.os.rename', race)
    with pytest.raises(PermissionError):
        workflow.clean(str(source), str(target), CleanOptions())
    assert target.read_bytes() == b'other owner'
    assert not list(tmp_path.glob('.afc-*'))


def test_failed_c2pa_removal_not_published(tmp_path, workflow, monkeypatch):
    source, target = tmp_path/'a.png', tmp_path/'out.png'
    Image.new('RGB', (8,8)).save(source)
    monkeypatch.setattr('app.services.workflow.inspect_c2pa', lambda data, fmt: {'presence':'present','status':'Partially Verified'})
    with pytest.raises(ValueError, match='doğrulama'):
        workflow.clean(str(source), str(target), CleanOptions(remove_c2pa=True))
    assert not target.exists()


def test_xmp_privacy(tmp_path, workflow):
    source = tmp_path/'a.webp'
    Image.new('RGB', (8,8)).save(source, xmp=b'<x:xmpmeta>GPS: private</x:xmpmeta>')
    result = workflow.clean(str(source), str(tmp_path/'out.webp'), CleanOptions())
    assert any(k.startswith('XMP:') for k in result.removed)
    assert not any(s == 'XMP' for _,s,_ in inventory(Path(result.after.path).read_bytes(), 'WEBP'))


def test_unknown_c2pa_blocks(tmp_path, workflow, monkeypatch):
    source = tmp_path/'a.png'
    Image.new('RGB',(8,8)).save(source)
    monkeypatch.setattr('app.services.workflow.inspect_c2pa', lambda data, fmt: {'presence':'unknown','status':'Not Tested'})
    with pytest.raises(ValueError, match='C2PA'):
        workflow.clean(str(source), str(tmp_path/'out.png'), CleanOptions())
