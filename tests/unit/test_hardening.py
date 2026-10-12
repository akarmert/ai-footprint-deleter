import hashlib
import json
import struct
import sys
from types import SimpleNamespace
import zlib

import pytest
from PIL import Image, PngImagePlugin

from app.models.schema import CleanOptions
from app.services.workflow import OperationCancelled, Workflow
from modules.c2pa.reader import inspect_c2pa
from modules.metadata.containers import chunks, inventory, payload_hashes, strip


def png_chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)


def image_file(tmp_path, fmt='PNG', **kwargs):
    path = tmp_path / {'PNG': 'a.png', 'JPEG': 'a.jpg', 'WEBP': 'a.webp'}[fmt]
    Image.new('RGB', (24, 16), 'blue').save(path, format=fmt, **kwargs)
    return path


@pytest.mark.parametrize('fmt', ['PNG', 'JPEG', 'WEBP'])
def test_actual_payload_digests(tmp_path, fmt):
    source = image_file(tmp_path, fmt, progressive=fmt == 'JPEG')
    result = Workflow().clean(str(source), str(tmp_path / ('out' + source.suffix)), CleanOptions())
    assert result.checks['payload'] == 'Verified'
    assert result.payload_hashes['before'] == result.payload_hashes['after']
    assert result.payload_hashes['before'] == payload_hashes(source.read_bytes(), fmt)
    if fmt == 'PNG':
        first = next(p for k, p, _ in chunks(source.read_bytes(), fmt) if k == b'IDAT')
        assert result.payload_hashes['before']['IDAT:0'] == hashlib.sha256(first).hexdigest()


def test_unknown_chunk_preserved(tmp_path):
    source = image_file(tmp_path)
    data = source.read_bytes()
    unknown = png_chunk(b'vpAg', b'opaque rights data')
    source.write_bytes(data[:33] + unknown + data[33:])
    target = tmp_path / 'out.png'
    Workflow().clean(str(source), str(target), CleanOptions())
    assert unknown in target.read_bytes()


@pytest.mark.parametrize('kind,payload', [(b'VP8X', b''), (b'VP8X', b'\0' * 9), (b'ANIM', b'\0' * 6), (b'VP8X', b'\x02' + b'\0' * 9)])
def test_webp_invalid_or_animated(kind, payload):
    body = b'WEBP' + kind + struct.pack('<I', len(payload)) + payload + b'\0' * (len(payload) % 2)
    with pytest.raises(ValueError):
        list(chunks(b'RIFF' + struct.pack('<I', len(body)) + body, 'WEBP'))


def test_png_crc_and_animation(tmp_path):
    data = image_file(tmp_path).read_bytes()
    with pytest.raises(ValueError, match='Animasyon'):
        list(chunks(data[:33] + png_chunk(b'acTL', struct.pack('>II', 1, 0)) + data[33:], 'PNG'))
    damaged = bytearray(data)
    damaged[20] ^= 1
    with pytest.raises(ValueError, match='CRC'):
        list(chunks(bytes(damaged), 'PNG'))


def test_copyright_group_and_consent(tmp_path):
    exif = Image.Exif()
    exif[33432] = 'Copyright Alice'
    exif[315] = 'Alice'
    source = image_file(tmp_path, exif=exif)
    target = tmp_path / 'out.png'
    kept = Workflow().clean(str(source), str(target), CleanOptions())
    assert not any(k.startswith('EXIF:') for k in kept.removed)
    with Image.open(target) as image:
        assert image.getexif()[33432] == 'Copyright Alice'
    removed = Workflow().clean(str(source), str(tmp_path / 'consent.png'), CleanOptions(remove_rights=True))
    assert any(k.startswith('EXIF:') for k in removed.removed)


def test_text_rights_but_author_legacy(tmp_path):
    info = PngImagePlugin.PngInfo()
    info.add_text('Copyright', 'Alice')
    info.add_text('License', 'All rights reserved')
    info.add_text('Author', 'Private Author')
    source = image_file(tmp_path, pnginfo=info)
    result = Workflow().clean(str(source), str(tmp_path / 'out.png'), CleanOptions())
    with Image.open(result.after.path) as image:
        assert image.info['Copyright'] == 'Alice'
        assert image.info['License'] == 'All rights reserved'
        assert 'Author' not in image.info


def test_opaque_xmp_default_protected(tmp_path):
    source = image_file(tmp_path, 'WEBP', xmp=b'<x:xmpmeta>Copyright Alice; unknown rights semantics</x:xmpmeta>')
    protected = next(f for f in Workflow().scan(str(source)).fields if f.standard == 'XMP')
    assert not protected.removable
    with pytest.raises(ValueError):
        Workflow().clean(str(source), str(tmp_path / 'custom.webp'), CleanOptions('custom', (protected.key,)))
    result = Workflow().clean(str(source), str(tmp_path / 'out.webp'), CleanOptions())
    from pathlib import Path
    assert any(s == 'XMP' for _, s, _ in inventory(Path(result.after.path).read_bytes(), 'WEBP'))
    removed = Workflow().clean(str(source), str(tmp_path / 'consented.webp'), CleanOptions('custom', (protected.key,), remove_rights=True))
    assert protected.key in removed.removed


def test_cancel_before_publish_cleans_temp(tmp_path, monkeypatch):
    source = image_file(tmp_path)
    target = tmp_path / 'out.png'
    import app.services.workflow as module
    original = module.file_digest
    cancelled = False
    def final_hash(path, callback=None):
        nonlocal cancelled
        result = original(path, callback)
        if str(path).endswith('.png') and str(path) != str(source):
            cancelled = True
        return result
    monkeypatch.setattr(module, 'file_digest', final_hash)
    with pytest.raises(OperationCancelled):
        Workflow().clean(str(source), str(target), CleanOptions(), cancelled=lambda: cancelled)
    assert not target.exists()
    assert not list(tmp_path.glob('.afc-*'))
    with pytest.raises(OperationCancelled):
        Workflow().scan(str(source), cancelled=lambda: True)


def test_payload_mutation_not_published(tmp_path, monkeypatch):
    source = image_file(tmp_path)
    import app.services.workflow as module
    def altered(data, fmt, keys):
        output = bytearray(data)
        index = output.index(b'IDAT')
        length = int.from_bytes(output[index-4:index], 'big')
        output[index+4] ^= 1
        output[index+4+length:index+8+length] = struct.pack('>I', zlib.crc32(output[index:index+4+length]) & 0xffffffff)
        return bytes(output)
    monkeypatch.setattr(module, 'strip', altered)
    with pytest.raises(ValueError, match='yükü'):
        Workflow().clean(str(source), str(tmp_path / 'out.png'), CleanOptions())
    assert not (tmp_path / 'out.png').exists()


def test_after_c2pa_error_not_published(tmp_path, monkeypatch):
    source = image_file(tmp_path)
    calls = 0
    def inspect(data, fmt):
        nonlocal calls
        calls += 1
        return {'presence': 'absent', 'status': 'Verified'} if calls == 1 else {'presence': 'unknown', 'status': 'Failed'}
    monkeypatch.setattr('app.services.workflow.inspect_c2pa', inspect)
    with pytest.raises(ValueError, match='doğrulama'):
        Workflow().clean(str(source), str(tmp_path / 'out.png'), CleanOptions())
    assert not (tmp_path / 'out.png').exists()


def sdk_mock(monkeypatch, manifest=None, error=None):
    settings_calls = []
    class NotFound(Exception):
        pass
    class Context:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def set(self, key, value):
            settings_calls.append((key, value))
    class Reader(Context):
        def __enter__(self):
            if error == 'missing':
                raise NotFound()
            if error:
                raise RuntimeError('broken SDK')
            return self
        def json(self):
            return json.dumps(manifest)
    monkeypatch.setitem(sys.modules, 'c2pa', SimpleNamespace(Settings=Context, Context=Context, Reader=Reader,
                                                         C2paError=SimpleNamespace(ManifestNotFound=NotFound)))
    return settings_calls


def valid_manifest():
    return {'active_manifest': 'test', 'manifests': {'test': {}}, 'validation_state': 'Trusted',
            'validation_results': {'activeManifest': {'success': [{'code': code} for code in
                ('claimSignature.validated', 'assertion.dataHash.match', 'signingCredential.trusted')], 'failure': []}}}


@pytest.mark.parametrize('condition', ['valid', 'untrusted', 'invalid', 'incomplete', 'malformed', 'error'])
def test_sdk_validation_separation(tmp_path, monkeypatch, condition):
    data = image_file(tmp_path).read_bytes()
    manifest = valid_manifest()
    if condition == 'untrusted':
        manifest['validation_state'] = 'Valid'
        manifest['validation_results']['activeManifest']['success'].pop()
    elif condition == 'invalid':
        manifest['validation_results']['activeManifest']['failure'] = [{'code': 'assertion.dataHash.mismatch'}]
    elif condition == 'incomplete':
        manifest['validation_results'] = {}
    elif condition == 'malformed':
        manifest = []
    calls = sdk_mock(monkeypatch, manifest, 'error' if condition == 'error' else None)
    result = inspect_c2pa(data, 'PNG')
    assert result['status'] == ('Verified' if condition == 'valid' else 'Failed')
    assert result['validations']['readability'] == ('Failed' if condition in ('malformed', 'error') else 'Verified')
    assert ('core.allowed_network_hosts', '[]') in calls
    assert ('verify.remote_manifest_fetch', 'false') in calls
    assert ('verify.ocsp_fetch', 'false') in calls


def test_embedded_corrupt_manifest_not_absent(tmp_path, monkeypatch):
    source = image_file(tmp_path)
    data = source.read_bytes()
    source.write_bytes(data[:33] + png_chunk(b'caBX', b'invalid manifest') + data[33:])
    sdk_mock(monkeypatch, error='missing')
    result = inspect_c2pa(source.read_bytes(), 'PNG')
    assert result['presence'] == 'present'
    assert result['status'] == 'Failed'
    with pytest.raises(ValueError, match='C2PA'):
        Workflow().clean(str(source), str(tmp_path / 'out.png'), CleanOptions(remove_c2pa=True))


def test_jumbf_never_removed(tmp_path):
    source = image_file(tmp_path, 'JPEG')
    data = source.read_bytes()
    payload = b'generic JUMBF protected'
    app11 = b'\xff\xeb' + struct.pack('>H', len(payload) + 2) + payload
    data = data[:2] + app11 + data[2:]
    key = next(k for k, s, _ in inventory(data, 'JPEG') if s == 'APP11')
    with pytest.raises(ValueError):
        strip(data, 'JPEG', {key})


def test_snapshot_change_not_published(tmp_path, monkeypatch):
    source = image_file(tmp_path)
    import app.services.workflow as module
    original = module.strip
    def change(data, fmt, keys):
        result = original(data, fmt, keys)
        source.write_bytes(source.read_bytes() + b'changed')
        return result
    monkeypatch.setattr(module, 'strip', change)
    with pytest.raises(ValueError, match='Kaynak'):
        Workflow().clean(str(source), str(tmp_path / 'out.png'), CleanOptions())
    assert not (tmp_path / 'out.png').exists()
