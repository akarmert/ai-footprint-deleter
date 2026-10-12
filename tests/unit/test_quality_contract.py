import pytest
from modules.quality.contracts import ImageDescriptor,QualityComparison,QualityResult


def descriptor(**kwargs):
    values=dict(source_sha256='identity',color_space='raw',width=10,height=8,channel_layout=('R','G','B'),bit_depth=8,alpha_policy='all',data_range=255)
    values.update(kwargs)
    return ImageDescriptor(**values)


def test_quality_contract_no_uncomputed_score():
    QualityComparison(descriptor(),descriptor(source_sha256='target')).validate()
    assert QualityResult('SSIM').status=='Unsupported'
    assert QualityResult('PSNR').score is None


@pytest.mark.parametrize('kwargs',[{'data_range':0},{'data_range':float('nan')},{'data_range':float('inf')},{'region':(9,0,2,2)},{'width':0},{'channel_layout':()}])
def test_quality_contract_rejects_invalid_data(kwargs):
    with pytest.raises(ValueError):
        QualityComparison(descriptor(**kwargs),descriptor()).validate()
