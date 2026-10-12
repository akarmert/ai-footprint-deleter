from contextlib import contextmanager
import weakref

import numpy as np
import pytest
from PIL import Image, WebPImagePlugin

from modules.analysis import MemoryBudget
from modules.analysis.color_channels import color_channels
from modules.analysis.exceptions import AnalysisCancelled
from modules.analysis.frequency_engine import FrequencyEngine, FrequencyOptions
from modules.analysis.fft_analyzer import fft_analyze


@pytest.mark.parametrize('mode', ['RGB', 'RGBA', 'L'])
@pytest.mark.parametrize('remainder', [1, 7, 8])
def test_raw_color_tiles_accept_small_remainders(mode, remainder):
    shape = (remainder, 1) + (() if mode == 'L' else (4 if mode == 'RGBA' else 3,))
    channels = color_channels(np.full(shape, 40, dtype=np.uint8))
    np.testing.assert_allclose(channels['Y'], 40)
    np.testing.assert_allclose(channels['Cb'], 128)
    np.testing.assert_allclose(channels['Cr'], 128)
    with pytest.raises(ValueError):
        fft_analyze(channels['Y'])


@pytest.mark.parametrize('tile,remainder,mode', [(256, 1, 'RGB'), (512, 7, 'RGBA'), (1024, 8, 'L')])
def test_engine_remainder_tiles_complete(tmp_path, tile, remainder, mode):
    path = tmp_path / 'remainder.png'
    image = Image.new(mode, (tile + remainder, remainder), 40 if mode == 'L' else (40, 40, 40, 0) if mode == 'RGBA' else (40, 40, 40))
    image.save(path)
    image.close()
    result = FrequencyEngine(MemoryBudget(512 * 1024 ** 2), FrequencyOptions(tile_size=tile)).analyze(path)
    assert result.status == 'Completed'
    assert result.tiles_processed == 2
    assert set(result.channels) == {'Y', 'Cb', 'Cr'}
    assert all(channel['power_preview'].shape == (256, 256) for channel in result.channels.values())


@pytest.mark.parametrize('size', [512, 1024])
@pytest.mark.parametrize('offset', [0, 1, 3])
def test_preview_block_sum_preserves_offset_sine_peaks_and_dc(size, offset):
    from modules.analysis.frequency_engine import spectrum_preview
    samples = np.broadcast_to(np.sin(2 * np.pi * (17 + offset) * np.arange(size) / size), (size, size))
    power = fft_analyze(samples, 'none').power
    preview = spectrum_preview(power)
    factor = size // 256
    expected = np.array([[power[y:y + factor, x:x + factor].sum()
                          for x in range(0, size, factor)] for y in range(0, size, factor)])
    np.testing.assert_allclose(preview, expected, atol=1e-18)
    assert preview.sum() == pytest.approx(power.sum())
    assert preview[128, (size // 2 + 17 + offset) // factor] > .24
    dc = np.zeros((size, size))
    dc[size // 2, size // 2] = 9
    pooled = spectrum_preview(dc)
    assert pooled[128, 128] == 9
    assert pooled.sum() == 9
    magnitude = np.sqrt(power)
    np.testing.assert_allclose(spectrum_preview(magnitude, mode='magnitude'), np.sqrt(expected / factor ** 2), atol=1e-15)


@pytest.mark.parametrize('subtract_mean', [True, False])
def test_normalization_metadata_matches_actual_transform(tmp_path, subtract_mean):
    path = tmp_path / 'constant.png'
    with Image.new('L', (8, 8), 40) as image:
        image.save(path)
    result = FrequencyEngine(MemoryBudget(512 * 1024 ** 2), FrequencyOptions(tile_size=256, window='none', subtract_mean=subtract_mean)).analyze(path)
    channel = result.channels['Y']
    assert ('samples-mean' in channel['normalization']) is subtract_mean
    assert channel['power_preview'].sum() == pytest.approx(0 if subtract_mean else 1600)
    assert channel['preview_power_method'] == 'block sum; total power preserved'
    assert channel['preview_magnitude_method'] == 'block RMS of tile-averaged magnitude'
    assert channel['preview_pool_factor'] == 1
    assert channel['preview_dc_index'] == [128, 128]


@pytest.mark.parametrize('kwargs', [{'subtract_mean': 1}, {'radial_bins': 4.5}, {'radial_bins': True}, {'tile_size': 256.0}])
def test_frequency_options_validate_types(kwargs):
    with pytest.raises(ValueError):
        FrequencyOptions(**kwargs)


class FrequencyOwnerCheckingBudget(MemoryBudget):
    def __init__(self, owners):
        super().__init__(512 * 1024 ** 2)
        self.owners = owners
        self.checked = []

    @contextmanager
    def reserve(self, amount, label='', cancelled=None):
        with super().reserve(amount, label, cancelled):
            try:
                yield
            finally:
                if label in ('Frequency header', 'FFT DCT decode and buffers'):
                    assert self.used_bytes == amount
                    assert self.owners
                    assert all(owner() is None for owner in self.owners)
                    self.checked.append(label)


@pytest.mark.parametrize('failure', [None, 'open', 'second_open', 'load', 'chained_load', 'progress', 'cancel'])
def test_frequency_webp_decoder_owner_released_before_budget(tmp_path, monkeypatch, failure):
    path = tmp_path / 'owner.webp'
    with Image.new('RGB', (8, 8), (20, 40, 60)) as image:
        image.save(path, lossless=True)
    del image
    owners = []
    real_open = WebPImagePlugin.WebPImageFile._open

    def tracked_open(self):
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

    monkeypatch.setattr(WebPImagePlugin.WebPImageFile, '_open', tracked_open)
    if failure in ('load', 'chained_load'):
        monkeypatch.setattr(WebPImagePlugin.WebPImageFile, 'load', failed_load)
    cancelled = False

    def progress(done, total):
        nonlocal cancelled
        if failure == 'progress':
            raise RuntimeError('retained progress traceback')
        if failure == 'cancel':
            cancelled = True

    budget = FrequencyOwnerCheckingBudget(owners)
    engine = FrequencyEngine(budget, FrequencyOptions(tile_size=256))
    if failure is None:
        assert engine.analyze(path, progress=progress).status == 'Completed'
    else:
        error = AnalysisCancelled if failure == 'cancel' else EOFError if failure in ('load', 'chained_load') else RuntimeError
        with pytest.raises(error) as captured:
            engine.analyze(path, progress=progress, cancelled=lambda: cancelled)
        assert captured.value.__traceback__ is not None
        if failure == 'chained_load':
            assert isinstance(captured.value.__cause__, LookupError)
        assert all(owner() is None for owner in owners)
    assert budget.checked == ['Frequency header'] + ([] if failure == 'open' else ['FFT DCT decode and buffers'])
    assert budget.used_bytes == 0
