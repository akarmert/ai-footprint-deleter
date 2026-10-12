from functools import lru_cache
from numbers import Integral

import numpy as np


MAX_TILE_SIZE = 1024


def validate_shape(shape):
    if len(shape) != 2 or any(isinstance(n, bool) or not isinstance(n, Integral) or not 8 <= int(n) <= MAX_TILE_SIZE for n in shape):
        raise ValueError('Shape must contain two integer dimensions in [8, 1024]')
    return tuple(int(n) for n in shape)


def numeric_plane(array, nonnegative=False):
    if not isinstance(array, np.ndarray) or array.ndim != 2:
        raise ValueError('Expected a numeric two-dimensional ndarray')
    validate_shape(array.shape)
    if array.dtype.kind not in 'uif':
        raise ValueError('Expected real numeric samples')
    result = np.asarray(array, dtype=np.float64)
    if not np.isfinite(result).all() or (nonnegative and np.any(result < 0)):
        raise ValueError('Samples must be finite' + (' and nonnegative' if nonnegative else ''))
    return result


def readonly(array):
    result = np.ascontiguousarray(array)
    return np.frombuffer(result.tobytes(), dtype=result.dtype).reshape(result.shape)


def window2d(shape, kind='hann'):
    shape = validate_shape(shape)
    if not isinstance(kind, str) or kind not in ('hann', 'hamming', 'blackman', 'none'):
        raise ValueError('Unknown window kind')
    return _window2d(shape, kind)


@lru_cache(maxsize=4)
def _window2d(shape, kind):
    if kind == 'none':
        result = np.ones(shape, dtype=np.float64)
    else:
        function = {'hann': np.hanning, 'hamming': np.hamming, 'blackman': np.blackman}[kind]
        result = np.outer(function(shape[0]), function(shape[1]))
    return readonly(result)
