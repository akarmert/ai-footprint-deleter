from functools import lru_cache
from numbers import Integral

import numpy as np

from .frequency_schemas import DCTSummary
from .windowing import readonly


@lru_cache(maxsize=1)
def dct_matrix():
    k = np.arange(8, dtype=np.float64)[:, None]
    n = np.arange(8, dtype=np.float64)[None, :]
    matrix = .5 * np.cos(np.pi * (2 * n + 1) * k / 16)
    matrix[0] /= np.sqrt(2)
    return readonly(matrix)


def dct_blocks(array, level_shift=False):
    if not isinstance(array, np.ndarray) or array.ndim != 3 or array.shape[1:] != (8, 8):
        raise ValueError('Expected N x 8 x 8 ndarray blocks')
    if not 1 <= array.shape[0] <= 16384 or array.dtype.kind not in 'uif':
        raise ValueError('Expected 1..16384 real numeric blocks')
    if not isinstance(level_shift, bool):
        raise ValueError('level_shift must be boolean')
    samples = np.asarray(array, dtype=np.float64)
    if not np.isfinite(samples).all():
        raise ValueError('Blocks must be finite')
    matrix = dct_matrix()
    with np.errstate(over='ignore', invalid='ignore'):
        result = matrix @ (samples - 128 if level_shift else samples) @ matrix.T
    if not np.isfinite(result).all():
        raise ValueError('Sample range exceeds float64 transform capacity')
    return result


def dct_summary(array, level_shift=False):
    coefficients = dct_blocks(array, level_shift)
    with np.errstate(over='ignore', invalid='ignore'):
        energy = np.mean(coefficients ** 2, axis=0)
    if not np.isfinite(energy).all():
        raise ValueError('Sample range exceeds float64 energy capacity')
    bands = np.add.outer(np.arange(8), np.arange(8))
    dc = float(energy[0, 0])
    with np.errstate(over='ignore', invalid='ignore'):
        low = float(energy[(bands >= 1) & (bands <= 3)].sum())
        mid = float(energy[(bands >= 4) & (bands <= 7)].sum())
        high = float(energy[bands >= 8].sum())
        ac = low + mid + high
    if not np.isfinite(ac) or not np.isfinite(dc + ac):
        raise ValueError('Sample range exceeds float64 energy capacity')
    return DCTSummary(energy, dc, ac, low, mid, high, array.shape[0])


def global_block_plan(shape, core=None):
    if len(shape) != 2 or any(isinstance(n, bool) or not isinstance(n, Integral) or int(n) < 1 for n in shape):
        raise ValueError('Expected positive integer global height and width')
    height, width = (int(n) for n in shape)
    if height * width > 40_000_000:
        raise ValueError('Global shape exceeds 40 million pixels')
    if core is None:
        core = (0, 0, width, height)
    if len(core) != 4 or any(isinstance(n, bool) or not isinstance(n, Integral) for n in core):
        raise ValueError('Core must be (left, top, right, bottom) integers')
    left, top, right, bottom = (int(n) for n in core)
    if not 0 <= left < right <= width or not 0 <= top < bottom <= height:
        raise ValueError('Core must lie inside global image')
    return ((y, x) for y in range((top + 7) // 8 * 8, bottom, 8)
            for x in range((left + 7) // 8 * 8, right, 8))
