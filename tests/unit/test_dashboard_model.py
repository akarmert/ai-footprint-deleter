from dataclasses import FrozenInstanceError, asdict

import pytest

from app.models.dashboard import MAX_ROWS, MAX_SECTION_ROWS, MAX_TEXT, build_dashboard
from app.models.schema import MetadataField, ScanResult


URI = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'


def field(key, value='değer', standard='EXIF'):
    return MetadataField(key, value, standard, False, 'Salt okunur', 'Kategori')


def scan(fields=(), c2pa=None, path=r'C:\özel\görsel.png'):
    return ScanResult(path, 'a' * 64, 'PNG', 123, 456, 'RGBA', 1024,
                      list(fields), c2pa or {'presence': 'absent', 'status': 'Verified'})


def manifest(actions=(), trust='Verified', generator='Example SDK/1.0'):
    return {'presence': 'present', 'readability': 'Verified', 'signature': 'Verified',
            'content_hash': 'Verified', 'trust': trust,
            'manifest': {'active_manifest': 'active', 'manifests': {
                'active': {'claim_generator': generator,
                           'assertions': [{'label': 'c2pa.actions', 'data': {'actions': list(actions)}}]},
                'inactive': {'assertions': [{'label': 'c2pa.actions', 'data': {
                    'actions': [{'digitalSourceType': URI}]}}]},
            }}}


def section(model, key):
    return next(item for item in model.sections if item.key == key)


@pytest.mark.parametrize('trust', ['Verified', 'Failed', 'surprise', None])
def test_ai_claim_is_recorded_claim_not_trust(trust):
    model = build_dashboard(scan(c2pa=manifest([{'digitalSourceType': URI}], trust)))
    assert model.ai_claim
    assert ('c2pa_untrusted' in model.status_flags) == (trust != 'Verified')
    rows = {row.key: row.value for row in section(model, 'c2pa').rows}
    assert rows['signature'] == 'Doğrulandı'
    assert rows['trust'] != 'Doğrulandı' if trust != 'Verified' else rows['trust'] == 'Doğrulandı'
    assert 'tespiti değildir' in model.status_detail


@pytest.mark.parametrize('value', ['trainedAlgorithmicMedia', URI + '/fake',
                                  'x' + URI, URI.upper(), {'uri': URI}])
def test_only_exact_active_sdk_digital_source_type_is_ai_claim(value):
    model = build_dashboard(scan(c2pa=manifest([{'digitalSourceType': value}]), path=URI + '.png'))
    assert not model.ai_claim


def test_inactive_and_arbitrary_manifest_text_are_not_ai_claims():
    data = manifest([{'description': URI, 'softwareAgent': URI}])
    data['manifest']['manifests']['active']['title'] = URI
    assert not build_dashboard(scan(c2pa=data)).ai_claim
    data['manifest']['active_manifest'] = 'missing'
    assert not build_dashboard(scan(c2pa=data)).ai_claim
    assert build_dashboard(scan(c2pa=data)).generator is None


def test_action_description_synthid_is_explicit_statement_not_detector():
    description = 'Bu görsel SynthID ile işaretlendi.'
    model = build_dashboard(scan(c2pa=manifest([{'description': description}])))
    assert model.watermark_claim == description
    assert 'watermark_mention' in model.status_flags
    assert 'dedektörü çalıştırılmaz' in section(model, 'c2pa').limitation
    assert not build_dashboard(scan(c2pa=manifest([{'softwareAgent': 'SynthID'}]))).watermark_claim
    assert not build_dashboard(scan(c2pa=manifest([{'description': 'notSynthIDfake'}]))).watermark_claim


def test_generator_is_software_and_never_guessed_generation_model():
    data = manifest([])
    data['manifest']['manifests']['active']['claim_generator_info'] = [{'name': 'c2pa-rs', 'version': '1'}]
    model = build_dashboard(scan([field('detail:model', 'Dream Model', 'PNG text')], data))
    assert model.generator == 'c2pa-rs'
    assert section(model, 'production').rows[0].value == 'Dream Model'
    assert 'kütüphanedir' in next(row.detail for row in section(model, 'c2pa').rows if row.key.endswith(':claim_generator'))


def test_counts_deduplicate_stable_keys_and_separate_containers_and_logical_rows():
    fields = [field('EXIF:0'), field('detail:EXIF:271', 'Camera'), field('detail:EXIF:271', 'duplicate'),
              field('PNG text:0', 'raw parameters\0Steps: 12', 'PNG text'),
              field('detail:parameters', 'Steps: 12', 'PNG text'),
              field('XMP:0', '<xmp/>', 'XMP'), field('IPTC:0', 'opaque', 'IPTC')]
    model = build_dashboard(scan(fields))
    assert model.metadata_field_count == 2
    assert model.container_count == 4
    assert model.category_count == 4
    assert section(model, 'exif').field_count == 1
    assert section(model, 'png_text').field_count == 1
    assert section(model, 'xmp').field_count is None
    assert section(model, 'iptc').field_count is None
    assert section(model, 'xmp').limitation
    assert section(model, 'privacy').field_count == 1
    assert section(model, 'production').field_count == 1
    assert section(model, 'file').field_count == 0


def test_exif_labels_use_existing_decoded_values_and_gps_mapping():
    model = build_dashboard(scan([field('detail:EXIF:271', 'Kamera üreticisi'),
                                  field('detail:EXIF:34853:1', 'N')]))
    rows = section(model, 'exif').rows
    assert rows[0].label == 'Make'
    assert rows[0].value == 'Kamera üreticisi'
    assert rows[1].label == 'GPSLatitudeRef'


def test_png_only_recognized_decoded_generation_keys_not_text_guessing():
    model = build_dashboard(scan([field('detail:Comment', 'prompt model seed', 'PNG text'),
                                  field('detail:parameters', 'Steps: 12', 'PNG text'),
                                  field('PNG text:0', 'raw prompt', 'PNG text')]))
    assert [row.key for row in section(model, 'production').rows] == ['detail:parameters']
    assert model.generator is None
    assert not model.ai_claim


def test_immutable_detached_model_preserves_source_and_plain_turkish_html_values():
    source = scan([field('detail:parameters', '<b>İstanbul & üretim</b>', 'PNG text')],
                  manifest([{'description': '<script>Türkçe</script>'}]))
    before = asdict(source)
    model = build_dashboard(source)
    assert asdict(source) == before
    assert section(model, 'production').rows[0].value == '<b>İstanbul & üretim</b>'
    assert model.file_name == 'görsel.png'
    assert all('C:\\özel' not in row.value for row in section(model, 'file').rows)
    with pytest.raises(FrozenInstanceError):
        model.file_name = 'change'
    with pytest.raises(FrozenInstanceError):
        section(model, 'file').rows[0].value = 'change'
    source.fields[0].value = 'changed'
    assert section(model, 'production').rows[0].value != 'changed'


def test_large_and_deep_manifest_bounded_without_recursive_json_serialization():
    cycle = {}
    cycle['cycle'] = cycle
    actions = [{'description': 'x' * 20000, 'softwareAgent': cycle}] * 10000
    data = manifest(actions)
    data['manifest']['manifests']['active']['assertions'] *= 10000
    source = scan([field(f'detail:{i}', 'z' * 20000, 'PNG text') for i in range(2000)], data)
    model = build_dashboard(source)
    assert model.metadata_field_count == 1282
    assert sum(len(item.rows) for item in model.sections) <= MAX_ROWS
    assert all(len(item.rows) <= MAX_SECTION_ROWS for item in model.sections)
    assert all(len(row.value) <= MAX_TEXT + 32 for item in model.sections for row in item.rows)
    assert any('sınırlandı' in warning for warning in model.warnings)


def test_unknown_validation_labels_never_coerced_verified():
    data = manifest([])
    for key in ('readability', 'signature', 'content_hash', 'trust'):
        data[key] = {'status': 'Verified'}
    model = build_dashboard(scan(c2pa=data))
    assert all(row.value != 'Doğrulandı' for row in section(model, 'c2pa').rows)


def test_no_claim_is_not_negative_ai_or_watermark_detection():
    model = build_dashboard(scan())
    assert not model.ai_claim
    assert model.watermark_claim is None
    assert any('kanıtlamaz' in value for value in model.missing_summary)
    assert any('test edilmedi' in value for value in model.missing_summary)


def test_independent_explicit_validation_states():
    data = manifest([])
    data.update(readability='Unknown', signature='NotApplicable', trust='Untrusted')
    rows = {row.key: row.value for row in section(build_dashboard(scan(c2pa=data)), 'c2pa').rows}
    assert rows['readability'] == 'Bilinmiyor'
    assert rows['signature'] == 'Uygulanamaz'
    assert rows['trust'] == 'Güvenilmiyor'


def test_opaque_metadata_is_found_and_missing_semantics_are_not_errors():
    model = build_dashboard(scan([field('XMP:0', '<xml/>', 'XMP')]))
    assert model.status_title == 'Metadata bulundu'
    assert model.metadata_field_count == 0
    assert model.container_count == 1
    assert any('semantik çözümleme desteklenmiyor' in value for value in model.missing_summary)
    assert any('GPS' in value for value in model.missing_summary)
    raw = build_dashboard(scan([field('EXIF:0')]))
    assert any('yokluk sonucu çıkarılamaz' in value for value in raw.missing_summary)
    unknown = build_dashboard(scan(c2pa={'presence': 'unknown'}))
    assert 'eksik' in unknown.status_title
    assert 'varlığı bilinmiyor' in unknown.missing_summary[0]
    assert not any('AI üretim beyanı bulunamadı' in value for value in unknown.missing_summary)


def test_file_information_is_derived_without_opening_image():
    source = scan([field('detail:EXIF:274', '6'), field('ICC:1', 'profile', 'ICC')])
    rows = {row.key: row.value for row in section(build_dashboard(source), 'file').rows}
    assert rows['channels'] == '4'
    assert rows['alpha'] == 'Mevcut'
    assert rows['icc'] == 'Mevcut'
    assert rows['orientation'] == '6'


def test_generic_software_is_not_generation_metadata():
    model = build_dashboard(scan([field('detail:Software', 'Photoshop', 'PNG text')]))
    assert not any(item.key == 'production' for item in model.sections)
    assert model.generator is None
    assert model.metadata_field_count == 1


def test_negative_synthid_description_is_only_original_mention():
    model = build_dashboard(scan(c2pa=manifest([{'description': 'No SynthID applied'}])))
    assert model.watermark_claim == 'No SynthID applied'
    assert 'watermark_mention' in model.status_flags
    assert 'watermark_claim' not in model.status_flags
    assert any('yorumlanmadı' in value and 'tespiti yapılmadı' in value for value in model.warnings)


def test_c2pa_source_counts_deduplicate_and_exclude_validation_derived_rows():
    data = manifest([{'action': 'c2pa.created', 'digitalSourceType': URI}])
    active = data['manifest']['manifests']['active']
    active['title'] = 'Kaynak'
    active['ingredients'] = [{'title': 'Önceki kaynak', 'relationship': 'parentOf'}] * 3
    active['assertions'] *= 3
    source = scan([field('C2PA:0', 'raw', 'C2PA'), field('detail:EXIF:271', 'Camera')], data)
    before = asdict(source)
    model = build_dashboard(source)
    assert section(model, 'c2pa').field_count == 7
    assert model.metadata_field_count == 8
    assert model.container_count == 1
    assert model.category_count == 2
    assert len([row for row in section(model, 'c2pa').rows if row.key.startswith('source:')]) == 7
    assert any('Kaynak zinciri' in row.label for row in section(model, 'c2pa').rows)
    assert asdict(source) == before
