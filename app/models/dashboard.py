from dataclasses import dataclass
from pathlib import PureWindowsPath
import re

from PIL import ExifTags

from app.models.schema import ScanResult


MAX_FIELDS = 1024
MAX_ROWS = 500
MAX_SECTION_ROWS = 200
MAX_TEXT = 2048
MAX_ASSERTIONS = 64
MAX_ACTIONS = 128


@dataclass(frozen=True)
class Row:
    key: str
    label: str
    value: str
    detail: str = ''


@dataclass(frozen=True)
class Section:
    key: str
    title: str
    description: str
    rows: tuple[Row, ...]
    field_count: int | None
    container_count: int = 0
    limitation: str = ''


@dataclass(frozen=True)
class DashboardModel:
    source_sha256: str
    path: str
    file_name: str
    format: str
    width: int
    height: int
    size: int
    status_title: str
    status_detail: str
    status_flags: tuple[str, ...]
    generator: str | None
    ai_claim: bool
    watermark_claim: str | None
    sections: tuple[Section, ...]
    metadata_field_count: int
    container_count: int
    category_count: int
    missing_summary: tuple[str, ...]
    warnings: tuple[str, ...]


STATES = {
    'Verified': 'Doğrulandı', 'Failed': 'Başarısız / doğrulanamadı',
    'Not Tested': 'Test edilmedi', 'Not Applicable': 'Uygulanamaz',
    'Not Supported': 'Desteklenmiyor', 'Partially Verified': 'Kısmen doğrulandı',
    'Unknown': 'Bilinmiyor', 'Untrusted': 'Güvenilmiyor', 'NotApplicable': 'Uygulanamaz',
}
GROUPS = {
    'EXIF': ('exif', 'EXIF', 'Çözümlenmiş kamera ve cihaz alanları.'),
    'XMP': ('xmp', 'XMP', 'Gömülü XMP kapsayıcıları.'),
    'IPTC': ('iptc', 'IPTC', 'Yayın ve hak bilgisi kapsayıcıları.'),
    'PNG text': ('png_text', 'PNG metin alanları', 'Çözümlenmiş metin alanları ve ham kapsayıcılar.'),
    'ICC': ('icc', 'Renk profili (ICC)', 'Gömülü renk yönetimi profili.'),
    'Comment': ('comment', 'Yorumlar', 'Dosyada kayıtlı yorum kapsayıcıları.'),
}
GENERATION_KEYS = frozenset(('parameters', 'prompt', 'negative_prompt', 'negative prompt',
                            'seed', 'steps', 'sampler', 'cfg_scale', 'cfg scale', 'model',
                            'model hash'))
PRIVACY_TAGS = frozenset((271, 272, 306, 315, 33432, 34853, 36867, 36868, 42032, 42033, 42035, 42036, 42037))
AI_SOURCE_TYPES = frozenset(
    scheme + '://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
    for scheme in ('http', 'https')
)


def _text(value):
    if isinstance(value, str):
        return value[:MAX_TEXT] + (' … [kısaltıldı]' if len(value) > MAX_TEXT else '')
    if value is None:
        return 'Bilinmiyor'
    if isinstance(value, (bool, int, float)):
        return str(value)[:MAX_TEXT]
    if isinstance(value, (dict, list, tuple, bytes)):
        return f'{type(value).__name__}: {len(value)} öğe (ayrıntı gösterilmedi)'
    return 'Desteklenmeyen değer'


def _exif_label(key):
    parts = key.split(':')
    try:
        tag = int(parts[-1])
    except ValueError:
        return _text(key)
    names = ExifTags.GPSTAGS if len(parts) == 4 and parts[2] == '34853' else ExifTags.TAGS
    return names.get(tag, str(tag))


def _fingerprint(value):
    budget = [64, 8192]
    active = set()

    def visit(item, depth):
        budget[0] -= 1
        if budget[0] < 0 or depth > 4:
            raise ValueError
        if item is None or isinstance(item, (bool, int, float)):
            return (type(item).__name__, item)
        if isinstance(item, str):
            budget[1] -= len(item)
            if budget[1] < 0:
                raise ValueError
            return ('str', item)
        if not isinstance(item, (dict, list, tuple)) or id(item) in active or len(item) > 32:
            raise ValueError
        active.add(id(item))
        try:
            if isinstance(item, dict):
                if not all(isinstance(key, str) for key in item):
                    raise ValueError
                return ('dict', tuple((visit(key, depth + 1), visit(item[key], depth + 1))
                                      for key in sorted(item)))
            return (type(item).__name__, tuple(visit(child, depth + 1) for child in item))
        finally:
            active.remove(id(item))

    try:
        return visit(value, 0)
    except ValueError:
        return None


def _provenance(c2pa):
    presence = c2pa.get('presence')
    presence_label = 'Mevcut' if presence == 'present' else 'Bulunamadı' if presence == 'absent' else 'Bilinmiyor'
    rows = [Row('presence', 'Manifest varlığı', presence_label)]
    for key, title in (('readability', 'Okunabilirlik'), ('signature', 'İmza'),
                       ('content_hash', 'İçerik hash eşleşmesi'), ('trust', 'Sertifika güveni')):
        state = c2pa.get(key)
        rows.append(Row(key, title, STATES.get(state, 'Bilinmiyor / test edilmedi')
                        if isinstance(state, str) else 'Bilinmiyor / test edilmedi'))
    rows.append(Row('network', 'Ağ kapsamı', 'Yerel SDK; çevrimiçi iptal kontrolü yapılmadı.',
                    'Native ağ izolasyonu runtime testi değildir.'))
    if c2pa.get('detail'):
        rows.append(Row('detail', 'Doğrulama kapsamı', _text(c2pa['detail'])))
    manifest = c2pa.get('manifest')
    record = None
    if presence == 'present' and isinstance(manifest, dict):
        active, manifests = manifest.get('active_manifest'), manifest.get('manifests')
        if isinstance(active, str) and isinstance(manifests, dict):
            record = manifests.get(active)
    generator, ai_claim, watermark = None, False, None
    limited = False
    source_keys = set()

    def add_source(key, label, value, detail='Dosyadaki kayıt; bağımsız doğrulama sonucu değildir.'):
        nonlocal limited
        fingerprint = _fingerprint(value)
        if fingerprint is None:
            limited = True
            identity = (key, 'distinct-bounded-position', len(source_keys))
        else:
            identity = (key, fingerprint)
        if identity in source_keys:
            return
        source_keys.add(identity)
        if len(rows) < MAX_SECTION_ROWS:
            rows.append(Row(f'source:{len(source_keys)}:{key}', label, _text(value), detail))
        else:
            limited = True
    if isinstance(record, dict):
        info = record.get('claim_generator_info')
        if isinstance(info, list):
            for item in info[:8]:
                if isinstance(item, dict) and isinstance(item.get('name'), str):
                    generator = _text(item['name'])
                    break
        if generator is None and isinstance(record.get('claim_generator'), str):
            generator = _text(record['claim_generator'])
        if generator:
            add_source('claim_generator', 'Manifest üretici yazılımı', generator,
                       'Manifesti yazan araç/kütüphanedir; görüntü üretim modeli olduğu anlamına gelmez.')
        if 'title' in record:
            add_source('manifest_title', 'Manifest başlığı', record['title'])
        ingredients = record.get('ingredients')
        if isinstance(ingredients, list):
            limited |= len(ingredients) > 32
            for ingredient in ingredients[:32]:
                if isinstance(ingredient, dict):
                    for key in ('title', 'format', 'relationship', 'document_id', 'instance_id'):
                        if key in ingredient:
                            add_source('ingredient:' + key, 'Kaynak zinciri · ' + key, ingredient[key])
        assertions = record.get('assertions')
        action_count = 0
        if isinstance(assertions, list):
            limited |= len(assertions) > MAX_ASSERTIONS
            for index, assertion in enumerate(assertions[:MAX_ASSERTIONS]):
                if not isinstance(assertion, dict):
                    continue
                label, data = assertion.get('label'), assertion.get('data')
                if isinstance(label, str):
                    add_source('assertion_label', 'Kayıtlı assertion türü', label)
                if label not in ('c2pa.actions', 'c2pa.actions.v2') or not isinstance(data, dict):
                    continue
                actions = data.get('actions')
                if not isinstance(actions, list):
                    continue
                remaining = MAX_ACTIONS - action_count
                limited |= len(actions) > remaining
                for offset, action in enumerate(actions[:remaining]):
                    action_count += 1
                    if not isinstance(action, dict):
                        continue
                    source_type = action.get('digitalSourceType')
                    ai_claim |= isinstance(source_type, str) and source_type in AI_SOURCE_TYPES
                    description = action.get('description')
                    if isinstance(description, str) and re.search(r'\bSynthID\b', description[:MAX_TEXT], re.IGNORECASE):
                        watermark = _text(description)
                    for key, title in (('action', 'Kayıtlı işlem'), ('digitalSourceType', 'Dijital kaynak türü'),
                                       ('description', 'İşlem açıklaması'), ('softwareAgent', 'İşlem yazılımı')):
                        if key in action:
                            add_source('action:' + key, title, action[key],
                                       'Dosyadaki kaynak beyanı; bağımsız piksel/filigran tespiti değildir.')
                if action_count >= MAX_ACTIONS:
                    limited |= index + 1 < len(assertions)
                    break
    return rows, generator, ai_claim, watermark, limited, len(source_keys), isinstance(record, dict)


def build_dashboard(scan: ScanResult) -> DashboardModel:
    c2pa = scan.c2pa if isinstance(scan.c2pa, dict) else {}
    provenance, generator, ai_claim, watermark, manifest_limited, source_count, parsed = _provenance(c2pa)
    warnings = [_text(value) for value in scan.warnings[:32]]
    if len(scan.warnings) > 32:
        warnings.append('Tarama uyarılarının gösterimi sınırlandı.')
    if manifest_limited:
        warnings.append('C2PA işlem/manifest gösterimi sınırlandı; görülmeyen kayıtlarda ek beyanlar olabilir.')
    groups = {}
    seen = set()
    leaf_count, container_count = source_count, 0
    privacy, production = [], []
    decoded = {}
    privacy_labels = {271: 'Kamera üreticisi', 272: 'Kamera modeli', 306: 'Değişiklik tarihi',
                      315: 'Oluşturan kişi', 33432: 'Telif hakkı', 34853: 'GPS konum grubu',
                      36867: 'Çekim tarihi', 36868: 'Sayısallaştırma tarihi',
                      42032: 'Kamera sahibi', 42033: 'Gövde seri numarası',
                      42035: 'Lens üreticisi', 42036: 'Lens modeli', 42037: 'Lens seri numarası'}
    inspected_fields = scan.fields[:MAX_FIELDS]
    reflected_standards = {'xmp': 'XMP', 'xml:com.adobe.xmp': 'XMP', 'icc_profile': 'ICC', 'exif': 'EXIF'}
    raw_standards = {field.standard for field in inspected_fields if not field.key.startswith('detail:')}
    for field in inspected_fields:
        key = field.key
        if not isinstance(key, str) or key in seen:
            continue
        seen.add(key)
        reflected = reflected_standards.get(key.removeprefix('detail:').lower()) if key.startswith('detail:') else None
        pointer = key in ('detail:EXIF:34665', 'detail:EXIF:34853', 'detail:EXIF:40965')
        if pointer or reflected and (reflected in raw_standards or
                                    key.lower() == 'detail:xml:com.adobe.xmp' and 'PNG text' in raw_standards):
            if reflected == 'XMP':
                groups.setdefault('XMP', {'rows': [], 'leaves': 0, 'containers': 0, 'opaque': True})
            continue
        standard = reflected or (field.standard if field.standard in GROUPS or field.standard == 'C2PA' else 'Diğer')
        group = groups.setdefault(standard, {'rows': [], 'leaves': 0, 'containers': 0})
        if reflected:
            group['opaque'] = True
        leaf = key.startswith('detail:') and reflected is None
        if leaf:
            decoded[key] = _text(field.value)
        leaf_count += int(leaf)
        container_count += int(not leaf and reflected is None)
        if leaf:
            group['leaves'] += 1
        elif reflected is None:
            group['containers'] += 1
        label = _exif_label(key) if key.startswith('detail:EXIF:') else _text(key.removeprefix('detail:'))
        row = Row(_text(key), label, _text(field.value), _text(field.impact))
        if len(group['rows']) < MAX_SECTION_ROWS:
            group['rows'].append(row)
        if key.startswith('detail:EXIF:'):
            try:
                private = int(key.split(':')[2]) in PRIVACY_TAGS
            except ValueError:
                private = False
            if private and len(privacy) < 64:
                tag = int(key.split(':')[2])
                privacy.append(Row(row.key, privacy_labels.get(tag, row.label), row.value, row.detail))
        if standard == 'PNG text' and leaf and key.removeprefix('detail:').lower() in GENERATION_KEYS and len(production) < 64:
            production.append(row)
    if len(scan.fields) > MAX_FIELDS:
        warnings.append('Metadata alan incelemesi ilk 1024 kayıtla sınırlandı; sayılar bu kapsam içindir.')
    c2pa_containers = groups.get('C2PA', {}).get('containers', 0)
    sections = [Section('c2pa', 'İçerik Kaynağı (C2PA)',
                        'Kaynak beyanları ve birbirinden bağımsız doğrulama durumları.',
                        tuple(provenance), source_count if parsed else 0 if c2pa.get('presence') == 'absent' else None, c2pa_containers,
                        'Sayı yalnız incelenen aktif kaydın kaynak değerlerini içerir; doğrulama satırları dahil değildir. '
                        'Tam eşitliği 64 düğüm/8192 karakter/4 derinlik içinde kanıtlanan tekrarlar tekilleştirilir; '
                        'sınırı aşan veya döngülü değerler ayrı konumlar sayılır. '
                        'Genel APP11 kapsayıcıları Diğer grubunda kalabilir. Filigran dedektörü çalıştırılmaz.')]
    sections.append(Section('file', 'Dosya Bilgileri', 'Metadata sayımlarına dahil değildir.', (
        Row('file_name', 'Dosya adı', _text(PureWindowsPath(scan.path).name)),
        Row('format', 'Format', _text(scan.format)),
        Row('dimensions', 'Çözünürlük', f'{scan.width} × {scan.height}'),
        Row('mode', 'Renk modu', _text(scan.mode)),
        Row('size', 'Dosya boyutu', f'{scan.size_bytes:,} bayt'),
        Row('channels', 'Kanal sayısı', str({'1': 1, 'L': 1, 'P': 1, 'LA': 2, 'RGB': 3, 'RGBA': 4,
                                          'CMYK': 4, 'I': 1, 'F': 1, 'I;16': 1}.get(scan.mode, 'Bilinmiyor'))),
        Row('alpha', 'Alfa kanalı / saydamlık', 'Mevcut' if scan.mode in ('RGBA', 'LA', 'PA') or
            'detail:transparency' in decoded else 'Bilinmiyor' if scan.mode == 'P' else
            'Yok' if scan.mode in ('1', 'L', 'RGB', 'CMYK', 'I', 'F', 'I;16') else 'Bilinmiyor'),
        Row('icc', 'ICC profili', 'Mevcut' if 'ICC' in groups else 'Tarayıcı kapsamında bulunamadı'),
        Row('orientation', 'EXIF yön bilgisi', decoded.get('detail:EXIF:274', 'Çözümlenmiş alanlarda bulunamadı')),
    ), 0))
    row_budget = MAX_ROWS - sum(len(section.rows) for section in sections)
    for standard, group in groups.items():
        if standard == 'C2PA':
            continue
        key, title, description = GROUPS.get(standard, ('other', 'Diğer metadata', 'Diğer kayıtlı alanlar.'))
        opaque = group.get('opaque', False) or bool(group['containers']) and not group['leaves']
        limitation = 'Kapsayıcı alt alanları çözümlenmedi; alan sayısı bilinmiyor.' if opaque else ''
        if standard in ('XMP', 'IPTC') and group['containers']:
            opaque = True
            limitation = 'XMP/IPTC kapsayıcıları semantik olarak çözümlenmedi; toplam alan sayısı bilinmiyor.'
        rows = tuple(group['rows'][:max(0, row_budget)])
        row_budget -= len(rows)
        if len(rows) < group['leaves'] + group['containers']:
            limitation += ' Satır gösterimi sınırlandı.'
        sections.append(Section(key, title, description, rows,
                                None if opaque else group['leaves'], group['containers'], limitation))
    for key, title, rows in (('privacy', 'Kişisel / cihaz bilgileri', privacy),
                             ('production', 'Üretim bilgileri', production)):
        if rows:
            visible = tuple(rows[:max(0, row_budget)])
            row_budget -= len(visible)
            sections.append(Section(key, title, 'Mevcut çözümlenmiş alanların mantıksal görünümüdür.',
                                    visible, len(rows), 0, 'Global alan sayımına yeniden eklenmez.'))
    if watermark:
        warnings.append('SynthID geçen işlem açıklaması aynen aktarılır; olumlu/olumsuz ifade yorumlanmadı, filigran tespiti yapılmadı.')
    if warnings:
        rows = tuple(Row(f'warning:{i}', 'Tarama uyarısı', value) for i, value in enumerate(warnings[:max(0, row_budget)]))
        sections.append(Section('warnings', 'Tarama uyarıları', 'Tarayıcının raporladığı kapsam ve sınırlar.', rows, None))
    presence = c2pa.get('presence')
    flags = []
    if presence == 'present':
        flags.append('c2pa_present')
    if presence == 'present' and c2pa.get('trust') != 'Verified':
        flags.append('c2pa_untrusted')
    if ai_claim:
        flags.append('ai_claim')
    if groups or parsed:
        flags.append('metadata_present')
    else:
        flags.append('metadata_not_observed')
    incomplete = presence not in ('present', 'absent') or presence == 'present' and (
        not parsed or any(c2pa.get(key) not in ('Verified', 'Failed', 'Untrusted', 'Not Applicable', 'NotApplicable')
                          for key in ('readability', 'signature', 'content_hash', 'trust')))
    if incomplete:
        flags.append('verification_incomplete')
    title = ('Doğrulama eksik / C2PA durumu bilinmiyor' if incomplete else
             'Dosyada AI üretim beyanı bulundu' if ai_claim else
             'Metadata bulundu' if groups or parsed else 'Tarayıcı kapsamında metadata bulunamadı')
    detail = 'Dosyadaki metadata ve kaynak beyanları gösterilir; AI veya görünmez filigran tespiti değildir.'
    missing = []
    if incomplete and not parsed:
        missing.append('Aktif C2PA kaydı çözümlenemedi; AI, üretici yazılımı ve SynthID beyanlarının varlığı bilinmiyor.')
    else:
        if manifest_limited:
            missing.append('C2PA inceleme kapsamı sınırlı; incelenmeyen kaynak kayıtlarında AI/SynthID beyanı varlığı bilinmiyor.')
        if not ai_claim:
            missing.append('Yalnız incelenen sınırlı kayıtlarda AI üretim beyanı görülmedi; kalan kayıtların durumu bilinmiyor.'
                           if manifest_limited else 'İncelenen kayıtta AI üretim beyanı bulunamadı; bu, AI kullanılmadığını kanıtlamaz.')
        if not watermark:
            missing.append('Yalnız incelenen sınırlı açıklamalarda SynthID görülmedi; kalan kayıtların durumu bilinmiyor, filigran test edilmedi.'
                           if manifest_limited else 'İncelenen işlem açıklamalarında SynthID geçen kayıt bulunamadı; filigran varlığı test edilmedi.')
        if not generator:
            missing.append('İncelenen kayıtta manifest üretici yazılımı bilgisi bulunamadı.')
    if watermark:
        flags.append('watermark_mention')
    bounded = len(scan.fields) > MAX_FIELDS
    scope = 'İlk 1024 kaydın incelenen kapsamında' if bounded else 'Tarayıcının incelediği alanlarda'
    for standard in ('EXIF', 'PNG text'):
        if standard not in groups:
            missing.append(f'{scope} {standard} bulunamadı.')
        elif not groups[standard]['leaves']:
            missing.append(f'{standard} kapsayıcısı mevcut; çözümlenmiş alt alan yok, yokluk sonucu çıkarılamaz.')
    if not any(key == 'detail:EXIF:34853' or key.startswith('detail:EXIF:34853:') for key in decoded):
        missing.append(f'{scope} çözümlenmiş GPS alanı bulunamadı; opak EXIF içinde konum bilgisi olabilir.')
    for standard in ('XMP', 'IPTC'):
        missing.append(f'{standard}: semantik çözümleme desteklenmiyor (hata/yokluk sonucu değildir); '
                       + ('kapsayıcı mevcut.' if standard in groups else 'incelenen kapsayıcı envanterinde bulunamadı.'))
    return DashboardModel(scan.sha256, scan.path, _text(PureWindowsPath(scan.path).name),
                          _text(scan.format), scan.width, scan.height, scan.size_bytes,
                          title, detail, tuple(flags), generator, ai_claim, watermark,
                          tuple(sections), leaf_count, container_count,
                          len(groups) + int(parsed and 'C2PA' not in groups),
                          tuple(missing), tuple(warnings))
