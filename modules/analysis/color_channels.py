import numpy as np

from .windowing import MAX_TILE_SIZE


def color_channels(rgb):
    if not isinstance(rgb, np.ndarray):
        raise ValueError('Expected ndarray samples')
    if rgb.ndim not in (2, 3) or rgb.dtype.kind not in 'uif':
        raise ValueError('Expected grayscale, RGB or RGBA samples')
    if rgb.ndim == 3 and rgb.shape[2] not in (3, 4):
        raise ValueError('Expected RGB or RGBA samples')
    if any(not 1 <= dimension <= MAX_TILE_SIZE for dimension in rgb.shape[:2]):
        raise ValueError('Color tile dimensions must be in [1, 1024]')
    samples = np.asarray(rgb, dtype=np.float64)
    if not np.isfinite(samples).all() or np.any((samples < 0) | (samples > 255)):
        raise ValueError('Color samples must be finite and in [0, 255]')
    if rgb.ndim == 2:
        y = samples.copy()
        return {'Y': y, 'Cb': np.full_like(y, 128), 'Cr': np.full_like(y, 128)}
    r, g, b = (samples[..., i] for i in range(3))
    return {
        'Y': .299 * r + .587 * g + .114 * b,
        'Cb': 128 - .168736 * r - .331264 * g + .5 * b,
        'Cr': 128 + .5 * r - .418688 * g - .081312 * b,
    }
