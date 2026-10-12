"""Lossless container metadata editing; compressed image payloads are never re-encoded."""
import hashlib
import struct
import zlib


def chunks(data: bytes, fmt: str):
    if fmt == 'PNG':
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError('Geçersiz PNG imzası')
        pos = 8
        seen_header = False
        seen_image = False
        ended_image = False
        while pos < len(data):
            if pos + 12 > len(data):
                raise ValueError('Eksik PNG chunk')
            length = int.from_bytes(data[pos:pos+4], 'big')
            end = pos + length + 12
            if end > len(data):
                raise ValueError('Geçersiz PNG chunk uzunluğu')
            kind, payload = data[pos+4:pos+8], data[pos+8:end-4]
            if zlib.crc32(kind + payload) & 0xffffffff != int.from_bytes(data[end-4:end], 'big'):
                raise ValueError('PNG CRC doğrulaması başarısız')
            if not all(65 <= c <= 90 or 97 <= c <= 122 for c in kind) or kind[2] & 32:
                raise ValueError('Geçersiz PNG chunk türü')
            if not seen_header and (kind != b'IHDR' or length != 13):
                raise ValueError('PNG IHDR bulunamadı')
            if kind == b'IHDR':
                if seen_header or length != 13:
                    raise ValueError('Geçersiz PNG IHDR')
                seen_header = True
            if kind in (b'acTL', b'fcTL', b'fdAT'):
                raise ValueError('Animasyon desteklenmiyor')
            if kind == b'IDAT':
                if ended_image:
                    raise ValueError('PNG IDAT sırası geçersiz')
                seen_image = True
            elif seen_image:
                ended_image = True
            if kind == b'IEND' and (length or not seen_image):
                raise ValueError('Geçersiz PNG IEND')
            yield kind, payload, data[pos:end]
            pos = end
            if kind == b'IEND':
                if pos != len(data):
                    raise ValueError('PNG sonunda desteklenmeyen ek veri')
                return
        raise ValueError('PNG IEND bulunamadı')
    elif fmt == 'JPEG':
        if data[:2] != b'\xff\xd8':
            raise ValueError('Geçersiz JPEG')
        pos = 2
        seen_scan = False
        seen_frame = False
        while pos < len(data):
            start = pos
            if data[pos] != 255:
                raise ValueError('Geçersiz JPEG segmenti')
            while pos < len(data) and data[pos] == 255:
                pos += 1
            if pos >= len(data):
                raise ValueError('Eksik JPEG marker')
            marker = data[pos]
            pos += 1
            if marker == 0xD9:
                if not seen_scan or not seen_frame:
                    raise ValueError('JPEG görüntü verisi yok')
                if pos != len(data):
                    raise ValueError('JPEG sonunda desteklenmeyen ek veri')
                yield b'IMAGE', data[start:pos], data[start:pos]
                return
            if marker in (0, 0xD8) or 0xD0 <= marker <= 0xD7:
                raise ValueError('Geçersiz JPEG marker sırası')
            if marker == 1:
                yield bytes([marker]), b'', data[start:pos]
                continue
            if pos + 2 > len(data):
                raise ValueError('Eksik JPEG uzunluğu')
            length = int.from_bytes(data[pos:pos+2], 'big')
            end = pos + length
            if length < 2 or end > len(data):
                raise ValueError('Geçersiz JPEG uzunluğu')
            if marker in (0xC0, 0xC1, 0xC2):
                if seen_frame or length < 11 or length != 8 + 3 * data[pos+7]:
                    raise ValueError('Geçersiz JPEG frame')
                seen_frame = True
            elif 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                raise ValueError('Desteklenmeyen JPEG kodlama yapısı')
            if marker == 0xDA:
                if not seen_frame or length < 8 or length != 6 + 2 * data[pos+2]:
                    raise ValueError('Geçersiz JPEG scan')
                seen_scan = True
                cursor = end
                while cursor < len(data):
                    if data[cursor] != 255:
                        cursor += 1
                        continue
                    marker_start = cursor
                    while cursor < len(data) and data[cursor] == 255:
                        cursor += 1
                    if cursor >= len(data):
                        raise ValueError('Eksik JPEG tarama sonu')
                    if data[cursor] == 0 or 0xD0 <= data[cursor] <= 0xD7:
                        cursor += 1
                        continue
                    yield b'IMAGE', data[start:marker_start], data[start:marker_start]
                    pos = marker_start
                    break
                else:
                    raise ValueError('JPEG EOI bulunamadı')
                continue
            yield bytes([marker]), data[pos+2:end], data[start:end]
            pos = end
        raise ValueError('JPEG görüntü verisi yok')
    elif fmt == 'WEBP':
        if len(data) < 12 or data[:4] != b'RIFF' or data[8:12] != b'WEBP' or int.from_bytes(data[4:8], 'little') + 8 != len(data):
            raise ValueError('Geçersiz WEBP kapsayıcısı')
        pos = 12
        webp_kinds = []
        vp8x_flags = None
        while pos < len(data):
            if pos + 8 > len(data):
                raise ValueError('Eksik WebP chunk')
            length = int.from_bytes(data[pos+4:pos+8], 'little')
            end = pos + 8 + length + (length % 2)
            if end > len(data):
                raise ValueError('Geçersiz WebP uzunluğu')
            kind = data[pos:pos+4]
            payload = data[pos+8:pos+8+length]
            if kind == b'VP8X':
                if length != 10:
                    raise ValueError('Geçersiz WebP VP8X uzunluğu')
                if webp_kinds or payload[0] & 0xC1 or payload[1:4] != b'\0\0\0':
                    raise ValueError('Geçersiz WebP VP8X bayrakları/sırası')
                vp8x_flags = payload[0]
            if kind in (b'VP8X', b'VP8 ', b'VP8L', b'EXIF', b'XMP ', b'ICCP', b'ALPH') and kind in webp_kinds:
                raise ValueError('Yinelenen WebP chunk')
            webp_kinds.append(kind)
            if kind in (b'ANIM', b'ANMF') or kind == b'VP8X' and payload[0] & 2:
                raise ValueError('Animasyon desteklenmiyor')
            if length % 2 and data[end-1] != 0:
                raise ValueError('Geçersiz WebP padding')
            yield kind, payload, data[pos:end]
            pos = end
        if sum(k in (b'VP8 ', b'VP8L') for k in webp_kinds) != 1:
            raise ValueError('WebP görüntü chunk sayısı geçersiz')
        if vp8x_flags is not None:
            for flag, kind in ((0x20,b'ICCP'),(0x08,b'EXIF'),(0x04,b'XMP ')):
                if bool(vp8x_flags & flag) != (kind in webp_kinds):
                    raise ValueError('WebP VP8X metadata bayrağı uyuşmuyor')
        elif any(k in webp_kinds for k in (b'ICCP',b'EXIF',b'XMP ',b'ALPH')):
            raise ValueError('WebP extended chunk için VP8X gerekli')


def classify(kind: bytes, payload: bytes, fmt: str):
    if fmt == 'PNG':
        return {b'eXIf': 'EXIF', b'tEXt': 'PNG text', b'zTXt': 'PNG text', b'iTXt': 'PNG text', b'iCCP': 'ICC', b'caBX': 'C2PA'}.get(kind)
    if fmt == 'WEBP':
        return {b'EXIF': 'EXIF', b'XMP ': 'XMP', b'ICCP': 'ICC', b'C2PA': 'C2PA'}.get(kind)
    if fmt == 'JPEG':
        if kind == b'\xe1':
            if payload.startswith(b'Exif\0\0'):
                return 'EXIF'
            if payload.startswith((b'http://ns.adobe.com/xap/1.0/\0', b'http://ns.adobe.com/xmp/extension/\0')):
                return 'XMP'
            return 'APP1'
        return {b'\xed': 'IPTC', b'\xfe': 'Comment', b'\xeb': 'APP11', b'\xe2': 'ICC' if payload.startswith(b'ICC_PROFILE') else 'APP2'}.get(kind)
    return None


def inventory(data: bytes, fmt: str):
    for index, (kind, payload, raw) in enumerate(chunks(data, fmt)):
        standard = classify(kind, payload, fmt)
        if standard:
            yield f'{standard}:{index}', standard, payload


def payload_hashes(data: bytes, fmt: str):
    result = {}
    counts = {}
    for kind, payload, raw in chunks(data, fmt):
        selected = fmt == 'PNG' and kind == b'IDAT'
        selected |= fmt == 'WEBP' and kind in (b'VP8 ', b'VP8L', b'ALPH')
        selected |= fmt == 'JPEG' and classify(kind, payload, fmt) not in ('EXIF', 'XMP', 'IPTC', 'Comment')
        if selected:
            label = kind.hex() if len(kind) == 1 else kind.decode('ascii')
            index = counts.get(label, 0)
            counts[label] = index + 1
            result[f'{label}:{index}'] = hashlib.sha256(raw if fmt == 'JPEG' else payload).hexdigest()
    if not result:
        raise ValueError('Sıkıştırılmış görüntü yükü bulunamadı')
    return result


def strip(data: bytes, fmt: str, keys: set[str]):
    parts = []
    removed_webp = set()
    for index, (kind, payload, raw) in enumerate(chunks(data, fmt)):
        standard = classify(kind, payload, fmt)
        if standard and f'{standard}:{index}' in keys:
            if standard in ('ICC', 'APP1', 'APP2', 'APP11'):
                raise ValueError('Korunan kapsayıcı grubu kaldırılamaz')
            removed_webp.add(kind)
            continue
        parts.append((kind, raw))
    if fmt == 'PNG':
        return data[:8] + b''.join(raw for _, raw in parts)
    if fmt == 'JPEG':
        return data[:2] + b''.join(raw for _, raw in parts)
    if fmt == 'WEBP':
        fixed = []
        for kind, raw in parts:
            if kind == b'VP8X':
                chunk = bytearray(raw)
                if b'EXIF' in removed_webp:
                    chunk[8] &= ~8
                if b'XMP ' in removed_webp:
                    chunk[8] &= ~4
                raw = bytes(chunk)
            fixed.append(raw)
        body = b'WEBP' + b''.join(fixed)
        return b'RIFF' + struct.pack('<I', len(body)) + body
    raise ValueError('Bu format için kayıpsız temizleme desteklenmiyor')
