import math

import numpy as np
import pytest

from modules.analysis.color_channels import color_channels
from modules.analysis.dct_analyzer import dct_blocks, dct_matrix, dct_summary, global_block_plan
from modules.analysis.fft_analyzer import fft_analyze
from modules.analysis.radial_spectrum import radial_spectrum
from modules.analysis.spectral_features import spectral_features
from modules.analysis.spectrum_visualization import display_spectrum
from modules.analysis.windowing import window2d


def independent_dft(samples):
    height, width = samples.shape
    output = np.zeros(samples.shape, dtype=np.complex128)
    for ky in range(height):
        for kx in range(width):
            output[ky, kx] = sum(
                float(samples[y, x]) * np.exp(-2j * np.pi * (ky * y / height + kx * x / width))
                for y in range(height) for x in range(width)
            )
    return np.roll(output, (height // 2, width // 2), axis=(0, 1))


@pytest.mark.parametrize('shape', [(8, 8), (9, 11)])
def test_fft_independent_dft_parseval_and_inverse(shape):
    samples = np.random.default_rng(8).normal(size=shape)
    reference = independent_dft(samples)
    result = fft_analyze(samples, window='none', subtract_mean=False)
    np.testing.assert_allclose(result.magnitude, abs(reference), atol=1e-12)
    np.testing.assert_allclose(result.power, abs(reference) ** 2 / samples.size ** 2, atol=1e-14)
    assert result.power.sum() == pytest.approx(np.mean(samples ** 2))
    inverse = np.fft.ifft2(np.fft.ifftshift(reference))
    np.testing.assert_allclose(inverse.real, samples, atol=1e-13)
    np.testing.assert_allclose(inverse.imag, 0, atol=1e-13)
    assert np.fft.fft2(samples).dtype == np.complex128
    np.testing.assert_array_equal(result.frequencies_y, np.fft.fftshift(np.fft.fftfreq(shape[0])))


@pytest.mark.parametrize('kind', ['hann', 'hamming', 'blackman', 'none'])
def test_window_corrected_energy_and_immutable_cache(kind):
    samples = np.random.default_rng(3).normal(size=(32, 40))
    weights = window2d(samples.shape, kind)
    assert weights is window2d(samples.shape, kind)
    assert weights.dtype == np.float64
    with pytest.raises(ValueError):
        weights[0, 0] = 0
    with pytest.raises(ValueError):
        weights.setflags(write=True)
    result = fft_analyze(samples, kind)
    centered = samples - np.mean(samples)
    assert result.power.sum() == pytest.approx(np.sum((centered * weights) ** 2) / np.sum(weights ** 2))
    assert result.window_energy == pytest.approx(np.sum(weights ** 2))
    assert result.coherent_gain == pytest.approx(np.mean(weights))
    assert set(result.timings) == {'prepare_seconds', 'fft_seconds', 'total_seconds'}
    assert all(t >= 0 for t in result.timings.values())


def test_dc_mean_subtraction_and_nonmutation():
    samples = np.full((16, 16), 43., dtype=np.float64)
    samples.setflags(write=False)
    zero = fft_analyze(samples)
    np.testing.assert_array_equal(zero.power, 0)
    dc = fft_analyze(samples, 'none', False)
    assert dc.power[8, 8] == pytest.approx(43 ** 2)
    assert np.count_nonzero(dc.power) == 1
    np.testing.assert_array_equal(samples, 43)


def test_noninteger_sine_hann_reduces_out_of_mainband_leakage():
    n = 256
    sine = np.sin(2 * np.pi * 17.35 * np.arange(n) / n)
    samples = np.tile(sine, (n, 1))
    rectangular = fft_analyze(samples, 'none')
    hann = fft_analyze(samples, 'hann')
    fx = rectangular.frequencies_x
    outside = np.minimum(abs(fx - 17.35 / n), abs(fx + 17.35 / n)) > 3 / n
    assert hann.power[:, outside].sum() < rectangular.power[:, outside].sum() * .02
    assert abs(rectangular.power.sum() - .5) < .01
    assert abs(hann.power.sum() - .5) < .001


def test_bt601_patches_alpha_hidden_rgb_and_gray():
    rgb = np.zeros((8, 8, 4), dtype=np.uint8)
    rgb[..., 0] = 255
    result = color_channels(rgb)
    np.testing.assert_allclose(result['Y'], 76.245)
    np.testing.assert_allclose(result['Cb'], 84.97232)
    np.testing.assert_allclose(result['Cr'], 255.5)
    rgb[..., 3] = 255
    for key, channel in color_channels(rgb).items():
        np.testing.assert_array_equal(channel, result[key])
        assert channel.dtype == np.float64
    for index, expected in [(1, 149.685), (2, 29.07)]:
        patch = np.zeros((8, 8, 3), dtype=np.uint8)
        patch[..., index] = 255
        np.testing.assert_allclose(color_channels(patch)['Y'], expected)
    gray = color_channels(np.full((8, 8), 71, dtype=np.uint8))
    np.testing.assert_array_equal(gray['Y'], 71)
    np.testing.assert_array_equal(gray['Cb'], 128)
    np.testing.assert_array_equal(gray['Cr'], 128)


def test_dct_independent_cosine_inverse_and_parseval():
    blocks = np.random.default_rng(9).normal(size=(3, 8, 8))
    coefficients = dct_blocks(blocks)
    reference = np.zeros_like(coefficients)
    for block in range(3):
        for u in range(8):
            for v in range(8):
                au = math.sqrt(1 / 8) if u == 0 else .5
                av = math.sqrt(1 / 8) if v == 0 else .5
                reference[block, u, v] = au * av * sum(
                    blocks[block, y, x] * math.cos(math.pi * (2 * y + 1) * u / 16)
                    * math.cos(math.pi * (2 * x + 1) * v / 16)
                    for y in range(8) for x in range(8)
                )
    np.testing.assert_allclose(coefficients, reference, atol=2e-15)
    transform = dct_matrix()
    np.testing.assert_allclose(transform.T @ coefficients @ transform, blocks, atol=1e-14)
    np.testing.assert_allclose(np.sum(coefficients ** 2, axis=(1, 2)), np.sum(blocks ** 2, axis=(1, 2)))
    assert transform is dct_matrix()
    with pytest.raises(ValueError):
        transform.setflags(write=True)


def test_dct_summary_dc_and_deterministic_bands():
    blocks = np.full((2, 8, 8), 128., dtype=np.float64)
    summary = dct_summary(blocks)
    assert summary.dc_energy == pytest.approx(1024 ** 2)
    assert summary.ac_energy < 1e-23
    np.testing.assert_array_equal(dct_blocks(blocks, level_shift=True), 0)
    transform = dct_matrix()
    coefficients = np.zeros((1, 8, 8))
    for u, v in [(0, 1), (2, 2), (7, 7)]:
        coefficients[0, u, v] = 3
    summary = dct_summary(transform.T @ coefficients @ transform)
    assert summary.low_energy == pytest.approx(9)
    assert summary.mid_energy == pytest.approx(9)
    assert summary.high_energy == pytest.approx(9)
    assert summary.ac_energy == pytest.approx(27)
    assert summary.mean_energy.shape == (8, 8)


def test_global_block_ownership_non_aligned_tiles():
    shape = (27, 35)
    full = list(global_block_plan(shape))
    tiled = []
    for top in range(0, shape[0], 11):
        for left in range(0, shape[1], 13):
            tiled.extend(global_block_plan(shape, (left, top, min(left + 13, shape[1]), min(top + 11, shape[0]))))
    assert sorted(tiled) == sorted(full)
    assert len(tiled) == len(set(tiled)) == 20
    assert (24, 32) in full


@pytest.mark.parametrize('shape,bins', [((8, 8), 32), ((17, 19), 7), ((32, 32), 1)])
def test_radial_matches_bruteforce_and_empty_bins(shape, bins):
    power = np.random.default_rng(5).random(shape)
    result = radial_spectrum(power, bins)
    counts = np.zeros(bins, dtype=int)
    sums = np.zeros(bins)
    fy = np.fft.fftshift(np.fft.fftfreq(shape[0]))
    fx = np.fft.fftshift(np.fft.fftfreq(shape[1]))
    for y in range(shape[0]):
        for x in range(shape[1]):
            radius = math.hypot(fy[y], fx[x])
            if 0 < radius <= .5:
                index = min(int(radius * 2 * bins), bins - 1)
                counts[index] += 1
                sums[index] += power[y, x]
    np.testing.assert_array_equal(result.count, counts)
    np.testing.assert_allclose(result.sum, sums)
    np.testing.assert_allclose(result.mean, np.divide(sums, counts, out=np.zeros(bins), where=counts != 0))
    assert result.dc_power == power[shape[0] // 2, shape[1] // 2]
    assert result.normalization == 'window-corrected periodogram'


def test_features_explicit_domain_dc_and_peaks():
    power = np.zeros((32, 32))
    power[16, 16] = 1e6
    power[16, 17] = 2
    power[16, 20] = 3
    power[16, 24] = 4
    power[0, 0] = 5
    square = spectral_features(power)
    circle = spectral_features(power, 'circle')
    assert (square.low_energy, square.mid_energy, square.high_energy, square.total_energy) == (2, 3, 9, 14)
    assert circle.total_energy == 9
    assert square.peaks[0].power == 5
    assert square.peaks[0].frequency_x == -.5
    assert all(peak.frequency_x or peak.frequency_y for peak in square.peaks)
    assert spectral_features(np.zeros((8, 8))).peaks == ()


def test_display_readonly_manual_shared_range_and_dc():
    raw = np.arange(64, dtype=np.float64).reshape(8, 8)
    original = raw.copy()
    raw.setflags(write=False)
    result = display_spectrum(raw, log=False, manual_range=(0, 63))
    np.testing.assert_array_equal(result.image, np.rint(raw / 63 * 255).astype(np.uint8))
    shared = display_spectrum(raw / 2, log=False, manual_range=(0, 63))
    assert shared.image.max() == 128
    suppressed = display_spectrum(raw, exclude_dc=True)
    assert suppressed.image[4, 4] == 0
    expected = np.percentile(np.delete(np.log1p(raw).ravel(), 36), [1, 99.5])
    np.testing.assert_allclose([suppressed.lower, suppressed.upper], expected)
    np.testing.assert_array_equal(raw, original)
    np.testing.assert_array_equal(display_spectrum(np.zeros((8, 8))).image, 0)
    np.testing.assert_array_equal(display_spectrum(np.ones((8, 8))).image, 0)


@pytest.mark.parametrize('function', [fft_analyze, radial_spectrum, spectral_features, display_spectrum])
@pytest.mark.parametrize('bad', [np.zeros((7, 8)), np.zeros((1025, 8)), np.full((8, 8), np.nan), np.full((8, 8), np.inf), np.zeros((8, 8), dtype=complex), np.zeros((8, 8), dtype=object)])
def test_invalid_planes_rejected(function, bad):
    with pytest.raises(ValueError):
        function(bad)


def test_max_tile_and_dct_tensor_bounds():
    samples = np.zeros((1024, 1024), dtype=np.uint8)
    result = fft_analyze(samples, 'none')
    assert result.power.shape == samples.shape
    assert result.power.sum() == 0
    blocks = samples.reshape(128, 8, 128, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    summary = dct_summary(blocks)
    assert summary.block_count == 16384
    assert summary.dc_energy == summary.ac_energy == 0


def test_peak_ties_are_deterministic_and_negative_power_rejected():
    power = np.ones((9, 11))
    peaks = spectral_features(power, peak_count=3).peaks
    expected = ((-4 / 9, -5 / 11), (-4 / 9, -4 / 11), (-4 / 9, -3 / 11))
    np.testing.assert_allclose([(p.frequency_y, p.frequency_x) for p in peaks], expected)
    for function in (radial_spectrum, spectral_features, display_spectrum):
        with pytest.raises(ValueError):
            function(-power)


@pytest.mark.parametrize('invoke', [
    lambda: window2d((8, 8), 'invalid'),
    lambda: window2d((8.0, 8)),
    lambda: radial_spectrum(np.ones((8, 8)), 0),
    lambda: radial_spectrum(np.ones((8, 8)), 1.5),
    lambda: display_spectrum(np.ones((8, 8)), manual_range=(1, 1)),
    lambda: display_spectrum(np.ones((8, 8)), lower=float('nan')),
    lambda: display_spectrum(np.ones((8, 8)), lower=90, upper=10),
    lambda: spectral_features(np.ones((8, 8)), 'unknown'),
    lambda: spectral_features(np.ones((8, 8)), peak_count=-1),
    lambda: dct_blocks(np.zeros((16385, 8, 8))),
    lambda: dct_blocks(np.full((1, 8, 8), np.nan)),
    lambda: dct_summary(np.full((1, 8, 8), 1e200)),
    lambda: fft_analyze(np.full((8, 8), 1e200), subtract_mean=False),
    lambda: radial_spectrum(np.full((8, 8), 1e308), bins=1),
    lambda: spectral_features(np.full((8, 8), 1e308)),
    lambda: display_spectrum(-np.ones((8, 8))),
    lambda: color_channels(np.full((8, 8, 3), 256)),
    lambda: global_block_plan((40_000_001, 1)),
    lambda: global_block_plan((20, 20), (-1, 0, 20, 20)),
])
def test_invalid_options_rejected(invoke):
    with pytest.raises(ValueError):
        invoke()
