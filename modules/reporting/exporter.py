"""Explicit report privacy boundary; safe reports use a structural allowlist."""
from collections import Counter
from dataclasses import asdict
import json
from pathlib import Path


SAFE_STATES = ('Verified', 'Partially Verified', 'Failed', 'Not Supported', 'Not Tested',
               'present', 'absent', 'unknown', 'readable', 'unreadable', 'valid', 'invalid',
               'trusted', 'untrusted', 'Unknown', 'Valid', 'Invalid', 'Not Applicable', 'Static Configuration Verified')


def _safe_scan(scan):
    return {
        'format': scan.format, 'width': scan.width, 'height': scan.height,
        'mode': scan.mode, 'size_bytes': scan.size_bytes,
        'metadata_count': len(scan.fields),
        'metadata_standards': dict(Counter(f.standard if f.standard in ('EXIF', 'XMP', 'IPTC', 'PNG text', 'ICC', 'C2PA', 'APP1', 'APP2', 'APP11', 'Comment', 'PNG', 'JPEG', 'WEBP', 'TIFF') else 'Other' for f in scan.fields)),
        'c2pa': {key: scan.c2pa[key] for key in ('status', 'presence', 'readability', 'signature', 'content_hash', 'trust', 'network') if key in scan.c2pa and scan.c2pa[key] in SAFE_STATES},
    }


def report_dict(result, privacy_safe=True):
    if hasattr(result, 'channels') and hasattr(result, 'timings'):
        data = {'schema_version': result.schema_version, 'status': result.status,
                'width': result.width, 'height': result.height, 'mode': result.mode,
                'options': dict(result.options), 'tiles_processed': result.tiles_processed,
                'elapsed_seconds': result.elapsed_seconds, 'memory_estimate': result.memory_estimate,
                'measured_peak_memory': result.measured_peak_memory, 'timings': dict(result.timings),
                'method': {'aggregation': 'valid-pixel-weighted tiled spectra; not global image FFT',
                           'padding': 'edge', 'color': 'decoded RGB to full-range BT.601 YCbCr 4:4:4; ICC unmanaged',
                           'alpha': 'all stored RGB samples including fully transparent pixels',
                           'dct': 'decoded pixel orthonormal 8x8 DCT-II; not native quantized JPEG coefficients',
                           'grid_origin': [0,0], 'mean_subtraction': result.options.get('subtract_mean', True)},
                'channels': {name: {key: (value.tolist() if hasattr(value, 'tolist') else value)
                             for key,value in channel.items() if key not in ('power_preview','magnitude_preview','dct_region_map')}
                             for name,channel in result.channels.items() if name in ('Y','Cb','Cr')},
                'interpretation': 'Spektral istatistik; AI/filigran tespiti değildir. Çıktılar görüntü içeriği hakkında bilgi taşıyabilir.'}
        if not privacy_safe:
            data['source_identity'] = asdict(result.source_identity)
        return {'report_type': 'Privacy-Safe Report' if privacy_safe else 'Standard Report',
                'privacy_notice': 'Spektral dağılımlar içerik hakkında bilgi taşır; paylaşmadan inceleyin.', 'data': data}
    if not privacy_safe:
        return {'report_type': 'Standard Report', 'privacy_notice': 'Ham metadata, dosya yolları, GPS ve prompt/kişisel bilgiler içerebilir.', 'data': asdict(result)}
    if hasattr(result, 'channel_statistics'):
        def safe_channel(channel):
            return {name: getattr(channel, name) for name in ('count', 'minimum', 'maximum', 'mean', 'standard_deviation', 'histogram')}
        data = {
            'schema_version': result.schema_version,
            'completion_status': result.status,
            'source_format': result.source_identity.format,
            'image_width': result.width, 'image_height': result.height,
            'analysis_width': result.width, 'analysis_height': result.height,
            'analysis_mode': result.mode, 'processing_strategy': 'Full-resolution tiled aggregation' if result.status == 'Complete' else 'Not analyzed',
            'tile_size': result.tile_size, 'tiles_processed': result.tiles_processed,
            'elapsed_time': result.elapsed_seconds,
            'memory_estimate': result.estimated_peak_memory,
            'measured_peak_memory': result.measured_peak_memory,
            'statistics': {name:safe_channel(channel) for name,channel in result.channel_statistics.items() if name in ('R','G','B','A','L')},
            'luminance': safe_channel(result.luminance) if result.luminance else None,
            'interpretation': 'Ham 8-bit kanal istatistikleri; AI kökeni veya algısal ICC renk doğruluğu kanıtı değildir.'
        }
    elif hasattr(result, 'before'):
        data = {'before': _safe_scan(result.before), 'after': _safe_scan(result.after),
                'removed_count': len(result.removed), 'preserved_count': len(result.preserved),
                'checks': {key:value for key,value in result.checks.items() if key in ('metadata','resolution','mode_alpha','pixels','c2pa','watermark','icc','orientation','payload') and value in SAFE_STATES}, 'status': result.status if result.status in SAFE_STATES else 'Not Tested'}
    else:
        data = _safe_scan(result)
    return {'report_type': 'Privacy-Safe Report',
            'privacy_notice': 'Ham metadata, manifestler, yollar, dosya hashleri ve işlem zamanı dışa aktarılmaz. Görsel boyutları ve sayımlar kalır.', 'data': data}


def export_report(path, result, privacy_safe=True):
    target = Path(path)
    if target.suffix.lower() != '.json':
        raise ValueError('Rapor uzantısı .json olmalıdır.')
    payload = json.dumps(report_dict(result, privacy_safe), ensure_ascii=False, indent=2)
    # No overwrite, including symlink/hardlink destinations and image paths.
    with target.open('x', encoding='utf-8') as stream:
        stream.write(payload)
