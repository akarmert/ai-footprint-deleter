from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class FFTResult:
    magnitude: np.ndarray
    power: np.ndarray
    frequencies_y: np.ndarray
    frequencies_x: np.ndarray
    coherent_gain: float
    window_energy: float
    window: str
    subtract_mean: bool
    mean: float
    timings: dict[str, float]


@dataclass(frozen=True)
class DCTSummary:
    mean_energy: np.ndarray
    dc_energy: float
    ac_energy: float
    low_energy: float
    mid_energy: float
    high_energy: float
    block_count: int


@dataclass(frozen=True)
class RadialSpectrum:
    radii: np.ndarray
    mean: np.ndarray
    count: np.ndarray
    sum: np.ndarray
    dc_power: float
    domain: str = 'circle'
    normalization: str = 'window-corrected periodogram'


@dataclass(frozen=True)
class SpectrumDisplay:
    image: np.ndarray
    lower: float
    upper: float


@dataclass(frozen=True)
class SpectralPeak:
    frequency_y: float
    frequency_x: float
    power: float


@dataclass(frozen=True)
class SpectralFeatures:
    low_energy: float
    mid_energy: float
    high_energy: float
    total_energy: float
    peaks: tuple[SpectralPeak, ...]
    domain: str
