from time import perf_counter

import numpy as np

from .frequency_schemas import FFTResult
from .windowing import numeric_plane, window2d


def fft_analyze(array, window='hann', subtract_mean=True):
    start = perf_counter()
    samples = numeric_plane(array)
    if not isinstance(subtract_mean, bool):
        raise ValueError('subtract_mean must be boolean')
    weights = window2d(samples.shape, window)
    mean = float(np.mean(samples))
    prepared = (samples - mean if subtract_mean else samples) * weights
    if not np.isfinite(prepared).all():
        raise ValueError('Sample range exceeds float64 transform capacity')
    prepared_at = perf_counter()
    transformed = np.fft.fftshift(np.fft.fft2(prepared))
    transformed_at = perf_counter()
    magnitude = np.abs(transformed)
    energy = float(np.sum(weights * weights))
    with np.errstate(over='ignore', invalid='ignore'):
        power = magnitude ** 2 / (samples.size * energy)
    if not np.isfinite(power).all():
        raise ValueError('Sample range exceeds float64 power capacity')
    return FFTResult(
        magnitude, power,
        np.fft.fftshift(np.fft.fftfreq(samples.shape[0])),
        np.fft.fftshift(np.fft.fftfreq(samples.shape[1])),
        float(np.mean(weights)), energy, window, subtract_mean, mean,
        {'prepare_seconds': prepared_at - start,
         'fft_seconds': transformed_at - prepared_at,
         'total_seconds': perf_counter() - start},
    )
