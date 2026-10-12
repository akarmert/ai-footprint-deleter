from numbers import Integral

import numpy as np

from .frequency_schemas import SpectralFeatures, SpectralPeak
from .radial_spectrum import frequency_grid
from .windowing import numeric_plane


def spectral_features(power, domain='square', peak_count=5):
    samples = numeric_plane(power, nonnegative=True)
    if domain not in ('square', 'circle'):
        raise ValueError('domain must be square or circle')
    if isinstance(peak_count, bool) or not isinstance(peak_count, Integral) or not 0 <= int(peak_count) <= 64:
        raise ValueError('peak_count must be an integer in [0, 64]')
    fy, fx, radius = frequency_grid(samples.shape)
    selected = radius > 0
    if domain == 'circle':
        selected &= radius <= .5
    with np.errstate(over='ignore', invalid='ignore'):
        low = float(samples[selected & (radius < .125)].sum())
        mid = float(samples[selected & (radius >= .125) & (radius < .25)].sum())
        high = float(samples[selected & (radius >= .25)].sum())
        total = low + mid + high
    if not np.isfinite(total):
        raise ValueError('Spectrum exceeds float64 aggregation capacity')
    flat_indices = np.flatnonzero(selected & (samples > 0))
    if peak_count and flat_indices.size:
        candidates = samples.ravel()[flat_indices]
        if flat_indices.size > int(peak_count):
            threshold = np.partition(candidates, -int(peak_count))[-int(peak_count)]
            flat_indices = flat_indices[candidates >= threshold]
            candidates = samples.ravel()[flat_indices]
        order = np.lexsort((flat_indices, -candidates))[:int(peak_count)]
        locations = np.unravel_index(flat_indices[order], samples.shape)
        peaks = tuple(SpectralPeak(float(fy[y]), float(fx[x]), float(samples[y, x]))
                      for y, x in zip(*locations))
    else:
        peaks = ()
    return SpectralFeatures(low, mid, high, total, peaks, domain)
