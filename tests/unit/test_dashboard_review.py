from copy import deepcopy

from PIL import Image
from PIL.PngImagePlugin import PngInfo
import pytest

from app.models.dashboard import build_dashboard
from app.models.schema import MetadataField, ScanResult
from app.services.workflow import Workflow


URI = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'


def model_for(record):
    c2pa = {'presence': 'present', 'readability': 'Verified', 'signature': 'Verified',
            'content_hash': 'Verified', 'trust': 'Verified',
            'manifest': {'active_manifest': 'active', 'manifests': {'active': record}}}
    return build_dashboard(ScanResult('test.png', 'a' * 64, 'PNG', 1, 1, 'RGB', 100, [], c2pa))


def get_section(model, key):
    return next(section for section in model.sections if section.key == key)


@pytest.mark.parametrize('fmt,extension', [('JPEG', 'jpg'), ('WEBP', 'webp')])
def test_real_pillow_xmp_reflection_is_not_decoded_leaf(tmp_path, fmt, extension):
    path = tmp_path / ('image.' + extension)
    Image.new('RGB', (2, 2)).save(path, format=fmt, xmp=b'<x:xmpmeta xmlns:x="adobe:ns:meta/">opaque</x:xmpmeta>')
    source = Workflow().scan(str(path))
    assert any(field.standard == 'XMP' for field in source.fields)
    model = build_dashboard(source)
    assert get_section(model, 'xmp').field_count is None
    assert not any(row.key == 'detail:xmp' for section in model.sections for row in section.rows)
    assert model.container_count == sum(not field.key.startswith('detail:') for field in source.fields)


def test_real_png_xml_xmp_is_opaque_not_text_leaf(tmp_path):
    path = tmp_path / 'image.png'
    info = PngInfo()
    info.add_itxt('XML:com.adobe.xmp', '<x:xmpmeta xmlns:x="adobe:ns:meta/">opaque</x:xmpmeta>')
    Image.new('RGB', (2, 2)).save(path, pnginfo=info)
    source = Workflow().scan(str(path))
    model = build_dashboard(source)
    assert model.metadata_field_count == 0
    assert model.container_count == 1
    assert get_section(model, 'xmp').field_count is None
    assert not any(row.key == 'detail:XML:com.adobe.xmp' for section in model.sections for row in section.rows)


def test_real_exif_gps_and_exif_ifd_pointers_not_leaf_counts(tmp_path):
    path = tmp_path / 'gps.jpg'
    exif = Image.Exif()
    exif[271] = 'Camera'
    exif[34853] = {1: 'N', 2: (40.0, 0.0, 0.0)}
    exif[34665] = {36867: '2026:10:11 12:00:00'}
    Image.new('RGB', (2, 2)).save(path, exif=exif)
    source = Workflow().scan(str(path))
    assert any(field.key == 'detail:EXIF:34853' for field in source.fields)
    model = build_dashboard(source)
    other_decoded = sum(field.key.startswith('detail:') and field.standard != 'EXIF' for field in source.fields)
    assert model.metadata_field_count == 4 + other_decoded
    assert get_section(model, 'exif').field_count == 4
    assert not any(row.key in ('detail:EXIF:34853', 'detail:EXIF:34665')
                   for row in get_section(model, 'exif').rows)


def test_raw_reflections_without_inventory_do_not_invent_containers():
    fields = [MetadataField('detail:xmp', 'raw', 'WEBP', False, '', ''),
              MetadataField('detail:icc_profile', 'raw', 'WEBP', False, '', '')]
    source = ScanResult('a.webp', '', 'WEBP', 1, 1, 'RGB', 1, fields, {'presence': 'absent'})
    model = build_dashboard(source)
    assert model.metadata_field_count == 0
    assert model.container_count == 0
    assert get_section(model, 'xmp').field_count is None
    assert get_section(model, 'icc').field_count is None


def test_distinct_small_structures_and_long_same_prefix_are_not_collapsed():
    actions = [{'softwareAgent': {'name': 'one'}}, {'softwareAgent': {'name': 'two'}},
               {'description': 'x' * 3000 + 'one'}, {'description': 'x' * 3000 + 'two'}]
    record = {'assertions': [{'label': 'c2pa.actions', 'data': {'actions': actions}}]}
    model = model_for(record)
    assert get_section(model, 'c2pa').field_count == 5
    assert model.metadata_field_count == 5


def test_lossless_small_exact_deepcopies_deduplicated():
    assertion = {'label': 'c2pa.actions', 'data': {'actions': [{'softwareAgent': {'name': 'one', 'version': '1'}}]}}
    model = model_for({'assertions': [assertion, deepcopy(assertion)]})
    assert get_section(model, 'c2pa').field_count == 2


def test_cycles_and_oversize_values_conservatively_distinct_and_warn():
    cycle = {}
    cycle['self'] = cycle
    model = model_for({'assertions': [{'label': 'c2pa.actions', 'data': {'actions': [
        {'softwareAgent': cycle}, {'softwareAgent': cycle},
        {'description': 'x' * 10000}, {'description': 'x' * 10000 + 'different'},
    ]}}]})
    assert get_section(model, 'c2pa').field_count == 5
    assert any('sınırlandı' in warning for warning in model.warnings)


def test_ingredient_limit_survives_empty_assertions():
    model = model_for({'ingredients': [{'title': str(i)} for i in range(33)], 'assertions': []})
    assert get_section(model, 'c2pa').field_count == 32
    assert any('sınırlandı' in warning for warning in model.warnings)
    assert any('incelenmeyen' in value for value in model.missing_summary)


def test_action_limit_with_unvisited_later_assertion_does_not_claim_absence():
    model = model_for({'assertions': [
        {'label': 'c2pa.actions', 'data': {'actions': [{'action': 'c2pa.created'}] * 128}},
        {'label': 'c2pa.actions', 'data': {'actions': [{'digitalSourceType': URI, 'description': 'SynthID applied'}]}},
    ]})
    assert not model.ai_claim
    assert model.watermark_claim is None
    assert any('sınırlandı' in warning for warning in model.warnings)
    assert any('kalan kayıtların durumu bilinmiyor' in value for value in model.missing_summary)
    assert not any('AI üretim beyanı bulunamadı' in value for value in model.missing_summary)
