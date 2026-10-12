"""Official SDK with offline configuration; native network runtime coverage is separate."""
import json
from io import BytesIO

from modules.metadata.containers import chunks


def inspect_c2pa(data, fmt):
    validations = dict.fromkeys(('readability', 'signature', 'content_hash', 'trust'), 'Not Tested')
    embedded = False
    try:
        if fmt != 'TIFF':
            embedded = any(kind in (b'caBX', b'C2PA') or kind == b'\xeb' and b'c2pa' in payload.lower()
                           for kind, payload, _ in chunks(data, fmt))
    except ValueError as exc:
        return {'status': 'Failed', 'presence': 'unknown', 'validations': validations, **validations, 'network': 'Not Tested', 'detail': str(exc)}
    try:
        import c2pa
    except ImportError:
        return {'status': 'Not Supported', 'presence': 'present' if embedded else 'unknown',
                'validations': validations, **validations, 'network': 'Static Configuration Verified', 'detail': 'c2pa-python kurulu değil'}
    try:
        with c2pa.Settings() as settings:
            settings.set('core.allowed_network_hosts', '[]')
            settings.set('verify.remote_manifest_fetch', 'false')
            settings.set('verify.ocsp_fetch', 'false')
            with c2pa.Context(settings=settings) as context:
                mime = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp', 'TIFF': 'image/tiff'}[fmt]
                with c2pa.Reader(mime, BytesIO(data), context=context) as reader:
                    document = reader.json()
                    if len(document) > 8 * 1024 * 1024:
                        raise ValueError('C2PA manifest gösterim sınırını aşıyor')
                    manifest = json.loads(document)
                    active = manifest.get('active_manifest')
                    manifests = manifest.get('manifests')
                    if not isinstance(active, str) or not isinstance(manifests, dict) or not isinstance(manifests.get(active), dict):
                        raise ValueError('C2PA aktif manifest eksik veya okunamıyor')
                    results = manifest.get('validation_results', {}).get('activeManifest', {})
                    success = results.get('success', [])
                    failures = results.get('failure', [])
                    informational = results.get('informational', [])
                    if not all(isinstance(items, list) for items in (success, failures, informational)):
                        raise ValueError('C2PA doğrulama yapısı geçersiz')
                    entries = success + failures + informational
                    if not all(isinstance(item, dict) and isinstance(item.get('code'), str) for item in entries):
                        raise ValueError('C2PA doğrulama kodları geçersiz')
                    codes = {item['code'] for item in success}
                    validations['readability'] = 'Verified'
                    validations['signature'] = 'Verified' if 'claimSignature.validated' in codes else 'Failed'
                    validations['content_hash'] = 'Verified' if codes & {'assertion.dataHash.match', 'assertion.bmffHash.match', 'assertion.boxesHash.match'} else 'Failed'
                    validations['trust'] = 'Verified' if 'signingCredential.trusted' in codes else 'Failed'
                    state = manifest.get('validation_state')
                    failed = bool(failures or manifest.get('validation_status')) or state != 'Trusted' or 'Failed' in validations.values()
                    return {'status': 'Failed' if failed else 'Verified', 'presence': 'present',
                            'validations': validations, **validations, 'network': 'Static Configuration Verified', 'manifest': manifest,
                            'detail': 'Yerel SDK doğrulaması; çevrimiçi iptal kontrolü yapılmadı.'}
    except c2pa.C2paError.ManifestNotFound:
        if embedded:
            validations['readability'] = 'Failed'
            return {'status': 'Failed', 'presence': 'present', 'validations': validations, **validations, 'network': 'Static Configuration Verified',
                    'detail': 'Gömülü C2PA grubu var ancak SDK manifesti okuyamadı.'}
        return {'status': 'Verified', 'presence': 'absent', 'network': 'Static Configuration Verified',
                **dict.fromkeys(validations, 'Not Applicable'),
                'validations': dict.fromkeys(validations, 'Not Applicable'),
                'detail': 'SDK gömülü manifest bulamadı; bu AI kökeni hakkında kanıt değildir.'}
    except Exception as exc:
        validations['readability'] = 'Failed'
        return {'status': 'Failed', 'presence': 'present' if embedded else 'unknown',
                'validations': validations, **validations, 'network': 'Static Configuration Verified', 'detail': str(exc)[:1024]}
