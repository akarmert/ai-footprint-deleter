from dataclasses import asdict
import pytest
import json
from PIL import Image
from modules.reporting.exporter import report_dict
from modules.analysis import AnalysisEngine


def test_analysis_safe_report_does_not_export_source_identity(tmp_path):
    source=tmp_path/'private-location.png'
    Image.new('RGBA',(12,9),(30,60,90,0)).save(source)
    result=AnalysisEngine().analyze(str(source),generation_id='private-generation')
    safe=report_dict(result)
    text=json.dumps(safe)
    assert result.source_sha256 not in text
    assert 'private-generation' not in text
    assert 'private-location' not in text
    assert 'source_identity' not in text
    assert safe['data']['statistics']['R']['mean']==30
    assert sum(safe['data']['statistics']['R']['histogram'])==108
    standard=json.dumps(report_dict(result,privacy_safe=False))
    assert result.source_sha256 in standard
    assert 'private-generation' in standard


def test_unsupported_safe_report_has_no_full_analysis_claim(tmp_path):
    source=tmp_path/'palette.png'
    Image.new('P',(4,4)).save(source)
    result=AnalysisEngine().analyze(source)
    data=report_dict(result)['data']
    assert data['completion_status']=='Unsupported'
    assert data['processing_strategy']=='Not analyzed'
    assert not data['statistics']
