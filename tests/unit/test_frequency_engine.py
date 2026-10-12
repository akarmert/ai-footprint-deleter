import hashlib
import json
import numpy as np
import pytest
from PIL import Image
from modules.analysis.frequency_engine import FrequencyEngine,FrequencyOptions
from modules.analysis import MemoryBudget,SourceChanged,AnalysisCancelled
from modules.reporting.exporter import report_dict


def test_frequency_readonly_all_channels_and_safe_report(tmp_path):
    path=tmp_path/'private.png'; Image.new('RGBA',(19,17),(25,75,125,0)).save(path)
    original=path.read_bytes(); digest=hashlib.sha256(original).hexdigest()
    budget=MemoryBudget(256*1024**2)
    result=FrequencyEngine(budget,FrequencyOptions(tile_size=256)).analyze(path,expected_sha256=digest,generation_id='secret')
    assert result.status=='Completed'
    assert set(result.channels)=={'Y','Cb','Cr'}
    assert all(channel['dct_blocks']==9 and channel['padded_blocks']==5 for channel in result.channels.values())
    assert path.read_bytes()==original and budget.used_bytes==0
    safe=json.dumps(report_dict(result))
    assert digest not in safe and 'secret' not in safe and 'private' not in safe


def test_frequency_dct_tile_size_independence(tmp_path):
    path=tmp_path/'a.png'
    random=np.random.default_rng(12).integers(0,256,(273,281,3),dtype=np.uint8)
    Image.fromarray(random).save(path)
    results=[FrequencyEngine(frequency_options=FrequencyOptions(tile_size=size)).analyze(path) for size in (256,512)]
    for channel in ('Y','Cb','Cr'):
        np.testing.assert_allclose(results[0].channels[channel]['dct_energy'],results[1].channels[channel]['dct_energy'],rtol=1e-12,atol=1e-9)
        assert results[0].channels[channel]['dct_blocks']==results[1].channels[channel]['dct_blocks']


def test_frequency_source_change_and_cancel_release(tmp_path):
    path=tmp_path/'a.png'; Image.new('RGB',(20,20),'red').save(path)
    budget=MemoryBudget(256*1024**2)
    def changed(done,total):Image.new('RGB',(20,20),'blue').save(path)
    with pytest.raises(SourceChanged):FrequencyEngine(budget).analyze(path,progress=changed)
    assert budget.used_bytes==0
    stop=[False]
    with pytest.raises(AnalysisCancelled):
        FrequencyEngine(budget).analyze(path,cancelled=lambda:stop[0],progress=lambda *args:stop.__setitem__(0,True))
    assert budget.used_bytes==0
