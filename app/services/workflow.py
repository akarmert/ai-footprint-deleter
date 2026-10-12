"""Offline orchestration. Originals and pre-existing output files are never overwritten."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import os
from pathlib import Path
import tempfile
import warnings
from typing import Callable

from PIL import Image, ExifTags
from app.models.schema import CleanOptions, MetadataField, ProcessResult, ScanResult
from modules.metadata.containers import inventory, strip, payload_hashes
from modules.c2pa.reader import inspect_c2pa
from app.services.temp_registry import register_temp, unregister_temp, _is_link

FORMATS = {'.jpg': 'JPEG', '.jpeg': 'JPEG', '.png': 'PNG', '.webp': 'WEBP', '.tif': 'TIFF', '.tiff': 'TIFF'}
MAX_BYTES = 128 * 1024 * 1024
MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def digest(data):
    return hashlib.sha256(data).hexdigest()


class OperationCancelled(RuntimeError):
    pass


def checkpoint(cancelled):
    if cancelled is not None and cancelled():
        raise OperationCancelled('İşlem iptal edildi; doğrulanmamış çıktı yayımlanmadı.')


def file_digest(path, cancelled=None):
    result = hashlib.sha256()
    total = 0
    with Path(path).open('rb') as stream:
        while block := stream.read(1024 * 1024):
            checkpoint(cancelled)
            total += len(block)
            if total > MAX_BYTES:
                raise ValueError('Dosya güvenlik sınırını aşıyor.')
            result.update(block)
    return result.hexdigest()


def rights_protected(standard, payload, copyright_exif):
    if standard == 'IPTC':
        return True
    if standard == 'XMP':
        lowered = payload.lower()
        return any(marker in lowered for marker in (b'copyright', b'rights', b'license', b'licence', b'creator', b'owner', b'usage', b'attribution'))
    if standard == 'EXIF':
        return copyright_exif
    if standard == 'PNG text':
        keyword = payload.split(b'\0', 1)[0].lower()
        # Embedded XMP is an opaque provenance container; keep it without parsing
        # compressed XML or risking entity/decompression expansion. Separate consent
        # may remove the entire text group, never individual rights properties.
        return keyword == b'xml:com.adobe.xmp' or any(marker in keyword for marker in (b'copyright', b'rights', b'license', b'licence'))
    return False


def bounded_value(value):
    if isinstance(value, bytes):
        return repr(value[:4096])
    if isinstance(value, str):
        return value[:4096]
    if isinstance(value, (tuple, list, dict)):
        return f'{type(value).__name__}: {len(value)} değer (gösterim sınırlandı)'
    return str(value)[:4096]


def read_image(path, cancelled=None):
    checkpoint(cancelled)
    path = Path(path).resolve(strict=True)
    if not path.is_file() or path.suffix.lower() not in FORMATS:
        raise ValueError('Desteklenen bir JPG, PNG, WebP veya TIFF seçin.')
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Dosya 128 MiB güvenlik sınırını aşıyor.')
    with path.open('rb') as stream:
        data = stream.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Dosya güvenlik sınırını aşıyor.')
    checkpoint(cancelled)
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(BytesIO(data)) as image:
            fmt, size, mode = image.format, image.size, image.mode
            if fmt != FORMATS[path.suffix.lower()]:
                raise ValueError('Uzantı ile gerçek görüntü türü uyuşmuyor.')
            if fmt != 'TIFF':
                for index, _ in enumerate(inventory(data, fmt)):
                    checkpoint(cancelled)
                    if index >= 512:
                        raise ValueError('Metadata alan sayısı güvenlik sınırını aşıyor.')
            if size[0] * size[1] > MAX_PIXELS:
                raise ValueError('Görüntü 40 megapiksel güvenlik sınırını aşıyor.')
            if getattr(image, 'n_frames', 1) != 1:
                raise ValueError('Animasyon/çok sayfalı görüntüler Faz 1 kapsamında desteklenmiyor.')
            image.verify()
        with Image.open(BytesIO(data)) as image:
            image.load()
    return path, data, fmt, size, mode


class Workflow:
    def scan(self, source: str, cancelled: Callable[[], bool] | None = None) -> ScanResult:
        path, data, fmt, size, mode = read_image(source, cancelled)
        with Image.open(BytesIO(data)) as image:
            copyright_exif = 33432 in image.getexif()
        fields = []
        notes = ['Alan bazında düzenleme yerine kapsayıcı grubu silinir; alt alanlar salt okunur gösterilir.']
        if fmt == 'TIFF':
            notes.append('TIFF taranabilir; kayıpsız ve güvenli metadata düzenlemesi Faz 1 içinde desteklenmiyor.')
        for key, standard, payload in inventory(data, fmt):
            category = {'EXIF': 'Kişisel / cihaz', 'IPTC': 'Kişisel / yayın', 'ICC': 'Renk yönetimi', 'C2PA': 'Kaynak doğrulama'}.get(standard, standard)
            value = f'{len(payload)} byte; SHA256 {digest(payload)}'
            if standard in ('XMP', 'PNG text', 'Comment'):
                value += '\n' + payload[:8192].decode('utf-8', errors='replace')
            checkpoint(cancelled)
            removable = standard not in ('ICC', 'APP1', 'APP2', 'APP11') and not rights_protected(standard, payload, copyright_exif)
            fields.append(MetadataField(key, value, standard, removable,
                'Hak/telif grubu korunur; kaldırmak için ayrı açık onay gerekir.' if rights_protected(standard, payload, copyright_exif) else
                'Gruptaki tüm alt alanlar silinir. EXIF yön bilgisi görüntü sunumunu etkileyebilir.' if standard == 'EXIF' else 'Kaynak imzası kaybolur.' if standard == 'C2PA' else 'Renk profili korunur.' if standard == 'ICC' else 'Bu metadata grubu kaldırılır.', category))
        with Image.open(BytesIO(data)) as image:
            exif = image.getexif()
            if len(exif) > 512 or len(image.info) > 512:
                raise ValueError('Metadata alan sayısı güvenlik sınırını aşıyor.')
            for tag, value in exif.items():
                checkpoint(cancelled)
                name = ExifTags.TAGS.get(tag, str(tag))
                fields.append(MetadataField('detail:EXIF:' + str(tag), bounded_value(value), 'EXIF', False, 'Üst EXIF grubu ile birlikte temizlenir.', 'EXIF alt alanı'))
            for ifd_tag in (34665, 34853):
                if ifd_tag in exif:
                    details = exif.get_ifd(ifd_tag)
                    if len(details) > 512:
                        raise ValueError('Metadata alan sayısı güvenlik sınırını aşıyor.')
                    for tag, value in details.items():
                        checkpoint(cancelled)
                        names = ExifTags.GPSTAGS if ifd_tag == 34853 else ExifTags.TAGS
                        fields.append(MetadataField(f'detail:EXIF:{ifd_tag}:{tag}', bounded_value(value), 'EXIF', False, 'Üst EXIF grubu ile birlikte temizlenir.', names.get(tag, str(tag))))
            for key, value in image.info.items():
                if key in ('exif', 'icc_profile'):
                    if key == 'icc_profile' and fmt == 'TIFF':
                        fields.append(MetadataField('detail:ICC', f'{len(value)} byte', 'ICC', False, 'Korunur', 'Renk yönetimi'))
                    continue
                fields.append(MetadataField('detail:' + key, bounded_value(value), 'PNG text' if fmt == 'PNG' else fmt, False, 'İlgili kapsayıcı grubundan yönetilir.', 'Çözümlenmiş bilgi'))
        if len(fields) > 1024:
            raise ValueError('Metadata alan sayısı güvenlik sınırını aşıyor.')
        checkpoint(cancelled)
        c2pa = inspect_c2pa(data, fmt)
        checkpoint(cancelled)
        if c2pa['presence'] == 'unknown':
            notes.append('C2PA durumu doğrulanamadı; değişiklikler güvenlik amacıyla engellenir.')
        return ScanResult(str(path), digest(data), fmt, size[0], size[1], mode, len(data), fields, c2pa, notes)

    def clean(self, source: str, destination: str, options: CleanOptions,
              cancelled: Callable[[], bool] | None = None) -> ProcessResult:
        before = self.scan(source, cancelled)
        if options.expected_source_sha256 is not None and before.sha256 != options.expected_source_sha256:
            raise ValueError('Kaynak önceki analizden sonra değişti; seçimleri uygulamadan önce yeniden analiz edin.')
        source_path = Path(before.path)
        requested_target = Path(destination).absolute()
        for parent in (requested_target.parent, *requested_target.parents):
            if parent.exists() and _is_link(parent):
                raise ValueError('Çıktı klasörü reparse/symlink üzerinden kullanılamaz.')
        target = requested_target.resolve()
        if target == source_path or target.exists():
            raise ValueError('Orijinalin veya mevcut bir dosyanın üzerine yazılmaz; yeni bir dosya adı seçin.')
        if not target.parent.is_dir():
            raise ValueError('Çıktı klasörü bulunamadı.')
        if FORMATS.get(target.suffix.lower()) != before.format:
            raise ValueError('Metadata temizliği format dönüştürmez; kaynak formatını koruyun.')
        if before.format == 'TIFF':
            raise ValueError('TIFF için kayıpsız metadata temizliği henüz desteklenmiyor.')
        if options.mode not in ('privacy', 'custom', 'advanced'):
            raise ValueError('Bilinmeyen temizleme modu.')
        if before.c2pa['presence'] == 'unknown':
            raise ValueError('C2PA varlığı doğrulanamadığı için güvenli temizleme yapılamaz.')
        if before.c2pa['presence'] == 'present' and before.c2pa.get('status') != 'Verified':
            raise ValueError('C2PA doğrulama eksik, geçersiz veya güvenilmeyen; çıktı kaydedilmedi.')
        _, data, fmt, _, _ = read_image(source_path, cancelled)
        if digest(data) != before.sha256:
            raise ValueError('Kaynak tarama sırasında değişti; yeniden deneyin.')
        original = list(inventory(data, fmt))
        allowed = {f.key for f in before.fields if f.removable}
        if options.remove_rights:
            allowed |= {key for key, standard, _ in original if standard in ('EXIF', 'XMP', 'IPTC', 'PNG text')}
        keys = {key for key, standard, _ in original if key in allowed and standard in ('EXIF', 'XMP', 'IPTC', 'Comment', 'PNG text')} if options.mode == 'privacy' else set(options.remove_keys)
        if not keys <= allowed:
            raise ValueError('Silinemeyen veya bulunmayan bir metadata alanı seçildi.')
        signed = before.c2pa['presence'] == 'present' or any(s == 'C2PA' for _, s, _ in original)
        if signed and not options.remove_c2pa and keys:
            raise ValueError('Metadata değişikliği C2PA imzasını geçersiz kılabilir. İmzalı dosya açık kaynak-kaydı kaldırma onayı olmadan değiştirilmez.')
        if options.remove_c2pa:
            if signed and fmt == 'JPEG':
                raise ValueError('JPEG C2PA kaldırma desteklenmiyor: genel JUMBF kayıtlarının korunması için işlem engellendi.')
            keys |= {key for key, standard, _ in original if standard == 'C2PA'}
        elif any(key.startswith('C2PA:') for key in keys):
            raise ValueError('C2PA kaldırma için ayrı açık onay gerekir.')
        with Image.open(BytesIO(data)) as image:
            if any(k.startswith('EXIF:') for k in keys) and image.getexif().get(274, 1) != 1:
                raise ValueError('EXIF yön bilgisi mevcut. Görsel sunumunu korumak için bu dosyada EXIF temizliği engellendi.')
        checkpoint(cancelled)
        input_hashes = payload_hashes(data, fmt)
        output = strip(data, fmt, keys)
        output_hashes = payload_hashes(output, fmt)
        if input_hashes != output_hashes:
            raise ValueError('Sıkıştırılmış görüntü yükü doğrulama başarısız; çıktı kaydedilmedi.')
        checkpoint(cancelled)
        temp_name = None
        journal_entry = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, suffix=target.suffix, prefix='.afc-', delete=False) as stream:
                temp_name = Path(stream.name)
                journal_entry = register_temp(temp_name)
                checkpoint(cancelled)
                stream.write(output)
                stream.flush()
                os.fsync(stream.fileno())
            after = self.scan(str(temp_name), cancelled)
            if after.sha256 != digest(output):
                raise ValueError('Geçici çıktı değişti; çıktı kaydedilmedi.')
            remaining = list(inventory(output, fmt))
            expected = [(s, p) for k, s, p in original if k not in keys]
            checks = {'metadata': 'Verified' if [(s, p) for _, s, p in remaining] == expected else 'Failed',
                      'resolution': 'Verified' if (before.width, before.height) == (after.width, after.height) else 'Failed',
                      'mode_alpha': 'Verified' if before.mode == after.mode else 'Failed',
                       'pixels': 'Not Tested', 'payload': 'Verified', 'c2pa': 'Not Tested', 'watermark': 'Not Supported'}
            with Image.open(BytesIO(data)) as a, Image.open(temp_name) as b:
                checks['pixels'] = 'Verified'
                for top in range(0, before.height, 256):
                    for left in range(0, before.width, 256):
                        checkpoint(cancelled)
                        box = (left, top, min(left + 256, before.width), min(top + 256, before.height))
                        with a.crop(box) as tile_a, b.crop(box) as tile_b:
                            if tile_a.tobytes() != tile_b.tobytes():
                                checks['pixels'] = 'Failed'
                                break
                    if checks['pixels'] == 'Failed':
                        break
                checks['icc'] = 'Verified' if a.info.get('icc_profile') == b.info.get('icc_profile') else 'Failed'
                checks['orientation'] = 'Verified' if a.getexif().get(274, 1) == b.getexif().get(274, 1) else 'Failed'
            if signed:
                checks['c2pa'] = ('Verified' if after.c2pa['presence'] == 'absent' and after.c2pa.get('status') == 'Verified' else 'Failed') if options.remove_c2pa else ('Verified' if after.c2pa['presence'] == 'present' and after.c2pa.get('status') == 'Verified' else 'Failed')
            else:
                checks['c2pa'] = 'Verified' if before.c2pa['presence'] == after.c2pa['presence'] == 'absent' and after.c2pa.get('status') == 'Verified' else 'Failed'
            if 'Failed' in checks.values():
                raise ValueError('Bağımsız doğrulama başarısız; çıktı kaydedilmedi.')
            if file_digest(source_path, cancelled) != before.sha256:
                raise ValueError('Kaynak işlem sırasında değişti; çıktı kaydedilmedi.')
            if file_digest(temp_name, cancelled) != after.sha256:
                raise ValueError('Geçici çıktı işlem sırasında değişti; çıktı kaydedilmedi.')
            checkpoint(cancelled)
            try:
                if os.name == 'nt':
                    os.rename(temp_name, target)
                else:
                    os.link(temp_name, target)
            except FileExistsError:
                raise ValueError('Çıktı adı başka bir işlem tarafından oluşturuldu.') from None
            after.path = str(target)
            notes = ['Piksel verisi birebir eşitliği kontrol edildi; SSIM/PSNR Faz 3 kapsamındadır.', 'Görünmez filigran tespiti veya kaldırılması yapılmadı.']
            return ProcessResult(before, after, sorted(keys), [k for k, _, _ in original if k not in keys], checks,
                                 'Partially Verified' if 'Partially Verified' in checks.values() else 'Verified', notes, datetime.now(timezone.utc).isoformat(),
                                 {'before': input_hashes, 'after': output_hashes})
        finally:
            if temp_name:
                temp_name.unlink(missing_ok=True)
                try:
                    unregister_temp(journal_entry)
                except OSError:
                    warnings.warn('Geçici dosya günlüğü kaydı kaldırılamadı.', RuntimeWarning)
