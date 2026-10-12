from numbers import Integral

import numpy as np

from .frequency_schemas import RadialSpectrum
from .windowing import numeric_plane


def frequency_grid(shape):
    fy = np.fft.fftshift(np.fft.fftfreq(shape[0]))
    fx = np.fft.fftshift(np.fft.fftfreq(shape[1]))
    return fy, fx, np.hypot(fy[:, None], fx[None, :])


def radial_spectrum(power, bins=32):
    samples = numeric_plane(power, nonnegative=True)
    if isinstance(bins, bool) or not isinstance(bins, Integral) or not 1 <= int(bins) <= 1024:
        raise ValueError('bins must be an integer in [1, 1024]')
    bins = int(bins)
    _, _, radius = frequency_grid(samples.shape)
    selected = (radius > 0) & (radius <= .5)
    indices = np.minimum((radius[selected] * (2 * bins)).astype(np.int64), bins - 1)
    count = np.bincount(indices, minlength=bins)
    sums = np.bincount(indices, weights=samples[selected], minlength=bins)
    means = np.divide(sums, count, out=np.zeros(bins), where=count != 0)
    if not np.isfinite(sums).all():
        raise ValueError('Spectrum exceeds float64 aggregation capacity')
    return RadialSpectrum((np.arange(bins) + .5) / (2 * bins), means, count, sums,
                          float(samples[samples.shape[0] // 2, samples.shape[1] // 2]))
