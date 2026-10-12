import pytest
from PIL import Image
from modules.analysis import MemoryBudget,MemoryBudgetExceeded
from modules.analysis.frequency_engine import FrequencyEngine


@pytest.mark.parametrize('ram_gb',[8,16,32])
def test_simulated_device_budget_profile_not_physical_device(tmp_path,ram_gb):
    source=tmp_path/'a.png';Image.new('RGB',(16,16)).save(source)
    budget=MemoryBudget(min(ram_gb*1024**3//4,1024**3))
    result=FrequencyEngine(budget).analyze(source)
    assert result.status=='Completed' and budget.used_bytes==0


def test_low_budget_rejects_before_native_decode(tmp_path):
    source=tmp_path/'a.png';Image.new('RGB',(16,16)).save(source)
    budget=MemoryBudget(16*1024**2)
    with pytest.raises(MemoryBudgetExceeded):FrequencyEngine(budget).analyze(source)
    assert budget.used_bytes==0
