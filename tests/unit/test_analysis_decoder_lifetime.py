import weakref
from contextlib import contextmanager

import pytest
from PIL import Image, WebPImagePlugin

from modules.analysis import AnalysisEngine, AnalysisOptions, MemoryBudget


class OwnerCheckingBudget(MemoryBudget):
    def __init__(self, owners):
        super().__init__(64 * 1024 * 1024)
        self.owners = owners
        self.checked = []

    @contextmanager
    def reserve(self, amount, label='', cancelled=None):
        with super().reserve(amount, label, cancelled):
            try:
                yield
            finally:
                if label in ('Header and encoded buffers', 'Full image decode and tiles'):
                    assert self.used_bytes == amount
                    assert self.owners
                    assert all(owner() is None for owner in self.owners)
                    self.checked.append(label)


@pytest.mark.parametrize('failure', [None, 'header', 'progress'])
def test_analysis_webp_owner_destroyed_before_budget_release(tmp_path, monkeypatch, failure):
    path = tmp_path / 'owner.webp'
    image = Image.new('RGB', (3, 2), (20, 40, 60))
    image.save(path, lossless=True)
    image.close()
    owners = []
    real_open = Image.open

    def tracked_open(*args, **kwargs):
        owner = real_open(*args, **kwargs)
        owners.append(weakref.ref(owner))
        return owner

    monkeypatch.setattr(Image, 'open', tracked_open)
    budget = OwnerCheckingBudget(owners)
    engine = AnalysisEngine(budget, AnalysisOptions(tile_size=1))

    class InjectedFailure(RuntimeError):
        pass

    def fail(*args):
        raise InjectedFailure('retained traceback')

    if failure == 'header':
        monkeypatch.setattr('modules.analysis.engine.validate_container', fail)
    if failure is None:
        assert engine.analyze(path).status == 'Complete'
    else:
        with pytest.raises(InjectedFailure) as captured:
            engine.analyze(path, progress=fail if failure == 'progress' else None)
        assert captured.value.__traceback__ is not None
        assert all(owner() is None for owner in owners)
    expected = ['Header and encoded buffers']
    if failure != 'header':
        expected.append('Full image decode and tiles')
    assert budget.checked == expected
    assert len(owners) == len(expected)
    assert budget.used_bytes == 0


@pytest.mark.parametrize('failure', ['open', 'second_open', 'load', 'chained_load'])
def test_analysis_decoder_exception_frames_release_owner(tmp_path, monkeypatch, failure):
    path = tmp_path / 'decoder-failure.webp'
    image = Image.new('RGB', (3, 2), (20, 40, 60))
    image.save(path, lossless=True)
    image.close()
    owners = []
    real_open = WebPImagePlugin.WebPImageFile._open
    budget = OwnerCheckingBudget(owners)

    def failed_open(self):
        real_open(self)
        owners.append(weakref.ref(self))
        if failure == 'open' or failure == 'second_open' and len(owners) == 2:
            raise RuntimeError('decoder open failure')

    def failed_load(self):
        if failure == 'chained_load':
            try:
                raise LookupError('decoder cause')
            except LookupError as cause:
                raise EOFError('decoder load failure') from cause
        raise EOFError('decoder load failure')

    monkeypatch.setattr(WebPImagePlugin.WebPImageFile, '_open', failed_open)
    if failure in ('load', 'chained_load'):
        monkeypatch.setattr(WebPImagePlugin.WebPImageFile, 'load', failed_load)
    expected_message = 'decoder open failure' if failure in ('open', 'second_open') else 'decoder load failure'
    expected_error = RuntimeError if failure in ('open', 'second_open') else EOFError
    with pytest.raises(expected_error, match=expected_message) as captured:
        AnalysisEngine(budget).analyze(path)
    assert captured.value.__traceback__ is not None
    if failure == 'chained_load':
        assert isinstance(captured.value.__cause__, LookupError)
        assert str(captured.value.__cause__) == 'decoder cause'
    assert all(owner() is None for owner in owners)
    expected = ['Header and encoded buffers']
    if failure != 'open':
        expected.append('Full image decode and tiles')
    assert budget.checked == expected
    assert budget.used_bytes == 0
