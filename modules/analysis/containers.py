import struct
import zlib

from .exceptions import AnalysisError, check_cancelled


def _read(stream, count):
    data = stream.read(count)
    if len(data) != count:
        raise AnalysisError('Truncated image container')
    return data


def validate_container(stream, fmt, size, cancelled=None):
    stream.seek(0)
    if fmt == 'PNG':
        if _read(stream, 8) != b'\x89PNG\r\n\x1a\n':
            raise AnalysisError('Invalid PNG signature')
        seen_header = seen_image = ended_image = False
        while stream.tell() < size:
            check_cancelled(cancelled)
            length, kind = struct.unpack('>I4s', _read(stream, 8))
            if length > size - stream.tell() - 4:
                raise AnalysisError('Invalid PNG chunk length')
            if not all(65 <= c <= 90 or 97 <= c <= 122 for c in kind) or kind[2] & 32:
                raise AnalysisError('Invalid PNG chunk type')
            if not seen_header and (kind != b'IHDR' or length != 13):
                raise AnalysisError('Missing PNG header')
            if kind == b'IHDR':
                if seen_header or length != 13:
                    raise AnalysisError('Invalid PNG header')
                seen_header = True
            if kind in (b'acTL', b'fcTL', b'fdAT'):
                return 'Animated PNG is unsupported'
            if kind == b'IDAT':
                if ended_image:
                    raise AnalysisError('Invalid PNG image chunk order')
                seen_image = True
            elif seen_image:
                ended_image = True
            crc = zlib.crc32(kind)
            remaining = length
            while remaining:
                check_cancelled(cancelled)
                data = _read(stream, min(remaining, 1024 * 1024))
                remaining -= len(data)
                crc = zlib.crc32(data, crc)
            if crc & 0xffffffff != struct.unpack('>I', _read(stream, 4))[0]:
                raise AnalysisError('PNG CRC verification failed')
            if kind == b'IEND':
                if length or not seen_image or stream.tell() != size:
                    raise AnalysisError('Invalid PNG end or trailing data')
                return None
        raise AnalysisError('Missing PNG end')
    if fmt == 'WEBP':
        header = _read(stream, 12)
        if header[:4] != b'RIFF' or header[8:] != b'WEBP' or int.from_bytes(header[4:8], 'little') + 8 != size:
            raise AnalysisError('Invalid WebP header')
        kinds = set()
        flags = None
        images = 0
        while stream.tell() < size:
            check_cancelled(cancelled)
            kind, length = struct.unpack('<4sI', _read(stream, 8))
            if length + length % 2 > size - stream.tell():
                raise AnalysisError('Invalid WebP chunk length')
            if kind in (b'VP8X', b'VP8 ', b'VP8L', b'EXIF', b'XMP ', b'ICCP', b'ALPH') and kind in kinds:
                raise AnalysisError('Duplicate WebP chunk')
            if kind == b'VP8X':
                if length != 10 or kinds:
                    raise AnalysisError('Invalid WebP extended header')
                payload = _read(stream, 10)
                flags = payload[0]
                if flags & 0xC1 or payload[1:4] != b'\0\0\0':
                    raise AnalysisError('Invalid WebP flags')
                if flags & 2:
                    return 'Animated WebP is unsupported'
            else:
                stream.seek(length, 1)
            if kind in (b'ANIM', b'ANMF'):
                return 'Animated WebP is unsupported'
            images += kind in (b'VP8 ', b'VP8L')
            kinds.add(kind)
            if length % 2 and _read(stream, 1) != b'\0':
                raise AnalysisError('Invalid WebP padding')
        if images != 1:
            raise AnalysisError('Invalid WebP image count')
        if flags is None and kinds & {b'ICCP', b'EXIF', b'XMP ', b'ALPH'}:
            raise AnalysisError('Missing WebP extended header')
        if flags is not None:
            for flag, kind in ((0x20, b'ICCP'), (0x08, b'EXIF'), (0x04, b'XMP ')):
                if bool(flags & flag) != (kind in kinds):
                    raise AnalysisError('WebP metadata flag mismatch')
    return None
