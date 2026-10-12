from numbers import Real

import numpy as np

from .frequency_schemas import SpectrumDisplay
from .windowing import numeric_plane


def display_spectrum(raw, log=True, lower: float = 1, upper: float = 99.5, exclude_dc=False, manual_range=None):
    samples = numeric_plane(raw, nonnegative=True)
    if not isinstance(log, bool) or not isinstance(exclude_dc, bool):
        raise ValueError('Display switches must be boolean')
    if any(isinstance(v, bool) or not isinstance(v, Real) or not np.isfinite(float(v)) for v in (lower, upper)) or not 0 <= lower < upper <= 100:
        raise ValueError('Percentiles must satisfy 0 <= lower < upper <= 100')
    values = np.log1p(samples) if log else samples.copy()
    center = (samples.shape[0] // 2, samples.shape[1] // 2)
    if manual_range is None:
        if exclude_dc:
            selected = np.ones(samples.shape, dtype=bool)
            selected[center] = False
            fitting = values[selected]
        else:
            fitting = values.ravel()
        minimum, maximum = (float(v) for v in np.percentile(fitting, [lower, upper]))
    else:
        if len(manual_range) != 2 or any(isinstance(v, bool) or not isinstance(v, Real) or not np.isfinite(float(v)) for v in manual_range):
            raise ValueError('Manual range must contain two finite numbers')
        minimum, maximum = (float(v) for v in manual_range)
        if minimum < 0 or minimum >= maximum:
            raise ValueError('Manual range must satisfy 0 <= minimum < maximum')
    if maximum <= minimum:
        image = np.zeros(samples.shape, dtype=np.uint8)
    else:
        clipped = np.clip(values, minimum, maximum)
        normalized = (clipped - minimum) / (maximum - minimum)
        image = np.rint(normalized * 255).astype(np.uint8)
    if exclude_dc:
        image[center] = 0
    return SpectrumDisplay(image, minimum, maximum)
