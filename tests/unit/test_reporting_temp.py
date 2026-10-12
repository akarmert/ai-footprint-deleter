import json
from pathlib import Path
import pytest
from app.models.schema import MetadataField, ScanResult, ProcessResult
from modules.reporting.exporter import report_dict, export_report
from app.services import temp_registry


def sample():
    return ScanResult('C:/private/secret.png','secret-hash','PNG',32,32,'RGBA',100,
        [MetadataField('GPS:private','GPS: 41.0 prompt: secret Alice','EXIF',True,'impact','private')],
        {'status':'Partially Verified','presence':'present','manifest':{'secret':'Alice'},'trust':{'secret':'Alice'}})


def test_safe_report_redacts_raw_data(tmp_path):
    scan = sample()
    result = ProcessResult(scan,scan,['secret-key'],['private-id'],{'pixels':'Verified'},'Verified',['secret-warning'],'private-date')
    text = json.dumps(report_dict(result))
    for value in ('Alice','secret','private','41.0','GPS','prompt'):
        assert value not in text
    standard = json.dumps(report_dict(result, privacy_safe=False))
    assert 'Alice' in standard and 'secret-hash' in standard
    destination = tmp_path/'safe.json'
    export_report(destination, result)
    with pytest.raises(FileExistsError):
        export_report(destination, result, False)
    assert 'Alice' not in destination.read_text(encoding='utf-8')


def test_stale_candidates_warn_only_and_bounded(tmp_path, monkeypatch):
    monkeypatch.setattr(temp_registry, '_journal_root', lambda: tmp_path/'journal')
    candidate = tmp_path/'.afc-sensitive.png'
    candidate.write_bytes(b'private')
    entry = temp_registry.register_temp(candidate)
    assert temp_registry.stale_temp_candidates() == [str(candidate)]
    assert candidate.read_bytes() == b'private'
    temp_registry.unregister_temp(entry)
    assert temp_registry.stale_temp_candidates() == []
    assert candidate.exists()


def test_bad_journal_never_deletes_user_files(tmp_path, monkeypatch):
    root = tmp_path/'journal'
    root.mkdir()
    monkeypatch.setattr(temp_registry, '_journal_root', lambda: root)
    victim = tmp_path/'user.png'
    victim.write_bytes(b'user')
    (root/'bad.json').write_text(json.dumps({'version':1,'path':str(victim)}))
    (root/'broken.json').write_text('{')
    assert temp_registry.stale_temp_candidates() == []
    assert victim.read_bytes() == b'user'
