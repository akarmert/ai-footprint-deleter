"""Frequency orchestration reuses the proven read-only snapshot/hash lifecycle."""
from contextlib import closing
from dataclasses import dataclass, asdict
import math
from numbers import Integral
import time
from datetime import datetime, timezone

import numpy as np
from PIL import Image
from .engine import AnalysisEngine, _SnapshotView, _failure_cleanup, plan_tiles
from .containers import validate_container
from .exceptions import AnalysisError, check_cancelled
from .schemas import SourceIdentity


@dataclass(frozen=True)
class FrequencyOptions:
    tile_size: int = 512
    window: str = 'hann'
    subtract_mean: bool = True
    radial_bins: int = 32

    def __post_init__(self):
        if (isinstance(self.tile_size, bool) or not isinstance(self.tile_size, Integral)
                or self.tile_size not in (256,512,1024)
                or self.window not in ('hann','none','hamming','blackman')
                or not isinstance(self.subtract_mean, bool)
                or isinstance(self.radial_bins, bool) or not isinstance(self.radial_bins, Integral)
                or not 4 <= self.radial_bins <= 128):
            raise ValueError('Geçersiz frekans analizi ayarı')


@dataclass(frozen=True)
class FrequencyResult:
    status: str
    source_identity: SourceIdentity
    width: int
    height: int
    mode: str
    options: dict
    channels: dict
    tiles_processed: int
    total_tiles: int
    elapsed_seconds: float
    memory_estimate: int
    timings: dict
    warnings: tuple[str,...] = ()
    measured_peak_memory: int | None = None
    schema_version: str = '1.0'

    @property
    def source_sha256(self): return self.source_identity.sha256
    @property
    def generation_id(self): return self.source_identity.generation_id


def spectrum_preview(array, mode='power'):
    from .windowing import numeric_plane

    samples = numeric_plane(array, nonnegative=True)
    if samples.shape[0] != samples.shape[1] or samples.shape[0] not in (256, 512, 1024):
        raise ValueError('Preview requires a square 256, 512 or 1024 spectrum')
    if mode not in ('power', 'magnitude'):
        raise ValueError('Preview mode must be power or magnitude')
    factor = samples.shape[0] // 256
    blocks = samples.reshape(256, factor, 256, factor)
    with np.errstate(over='ignore', invalid='ignore'):
        preview = blocks.sum(axis=(1, 3)) if mode == 'power' else np.sqrt(np.mean(blocks ** 2, axis=(1, 3)))
    if not np.isfinite(preview).all():
        raise ValueError('Spectrum exceeds float64 pooling capacity')
    return preview


class FrequencyEngine(AnalysisEngine):
    def __init__(self,budget=None,frequency_options=None):
        super().__init__(budget=budget)
        self.frequency_options=frequency_options or FrequencyOptions()

    def _analyze_snapshot(self,snapshot,suffix,digest,size,generation,started,cancelled,progress):
        # Header admission covers encoded WebP buffers before the first Pillow open.
        with self.budget.reserve(2*size+32*1024**2,'Frequency header',cancelled), _failure_cleanup():
            image=Image.open(_SnapshotView(snapshot))
            try:
                fmt,dimensions,mode=image.format,image.size,image.mode
                if fmt != {'.jpg':'JPEG','.jpeg':'JPEG','.png':'PNG','.webp':'WEBP','.tif':'TIFF','.tiff':'TIFF'}.get(suffix):
                    raise AnalysisError('Uzantı/format uyuşmuyor')
                if dimensions[0]*dimensions[1]>self.options.max_pixels or getattr(image,'n_frames',1)!=1:
                    raise AnalysisError('Çözünürlük/animasyon sınırı')
            finally:
                image.close(); image=None
        identity=SourceIdentity(digest,digest,size,fmt,str(generation),digest,datetime.now(timezone.utc).isoformat())
        config=self.frequency_options
        if mode not in ('RGB','RGBA','L'):
            return FrequencyResult('Unsupported',identity,*dimensions,mode,vars(config),{},0,0,0,0,{},('Yalnız RGB/RGBA/L desteklenir.',))
        snapshot.seek(0); validate_container(snapshot,fmt,size,cancelled); snapshot.seek(0)
        estimate=dimensions[0]*dimensions[1]*8+2*size+config.tile_size**2*200+64*1024**2
        with self.budget.reserve(estimate,'FFT DCT decode and buffers',cancelled), _failure_cleanup():
            image=Image.open(_SnapshotView(snapshot))
            try:
                tick=time.perf_counter(); image.load(); decode=time.perf_counter()-tick
                check_cancelled(cancelled)
                return self._calculate(image,identity,config,estimate,decode,cancelled,progress)
            finally:
                image.close(); image=None

    def _calculate(self,image,identity,config,estimate,decode,cancelled,progress):
        # Numerical adapters are imported here to keep snapshot ownership separate.
        from .color_channels import color_channels
        from .fft_analyzer import fft_analyze
        from .dct_analyzer import dct_blocks
        from .radial_spectrum import radial_spectrum
        from .spectral_features import spectral_features
        accum={}; times={'decode':decode,'fft':0.,'dct':0.,'rapsd':0.}
        total=math.ceil(image.width/config.tile_size)*math.ceil(image.height/config.tile_size)
        processed=0
        for tile in plan_tiles(image.width,image.height,config.tile_size):
            check_cancelled(cancelled)
            with closing(image.crop(tile.core)) as crop:
                pixels=np.asarray(crop,dtype=np.float64)
                channels=color_channels(pixels)
            valid=(tile.core[2]-tile.core[0])*(tile.core[3]-tile.core[1])
            for name,array in channels.items():
                height,width=array.shape
                padded=np.pad(array,((0,config.tile_size-height),(0,config.tile_size-width)),mode='edge')
                tick=time.perf_counter(); fft=fft_analyze(padded,window=config.window,subtract_mean=config.subtract_mean); times['fft']+=time.perf_counter()-tick
                tick=time.perf_counter(); radial=radial_spectrum(fft.power,bins=config.radial_bins); times['rapsd']+=time.perf_counter()-tick
                # Tile size is a multiple of8: every block is globally anchored at(0,0).
                dh,dw=(-height)%8,(-width)%8
                block_image=np.pad(array,((0,dh),(0,dw)),mode='edge')
                blocks=block_image.reshape(block_image.shape[0]//8,8,block_image.shape[1]//8,8).transpose(0,2,1,3).reshape(-1,8,8)
                tick=time.perf_counter(); coeff=dct_blocks(blocks); energy=np.square(coeff); times['dct']+=time.perf_counter()-tick
                if name not in accum:
                    accum[name]={'power':np.zeros_like(fft.power),'magnitude':np.zeros_like(fft.magnitude),'radial':np.zeros_like(radial.mean),'weight':0,'dct_sum':np.zeros((8,8)),'blocks':0,'padded_blocks':0,'regions':[],'radial_result':radial}
                record=accum[name]; record['power']+=fft.power*valid; record['magnitude']+=fft.magnitude*valid
                record['radial']+=radial.mean*valid; record['weight']+=valid
                record['dct_sum']+=energy.sum(axis=0); record['blocks']+=len(blocks)
                record['padded_blocks']+=len(blocks)-(height//8)*(width//8)
                record['regions'].append(float(energy[:,1:,:].sum()+energy[:,0,1:].sum())/len(blocks))
            processed+=1
            if progress:progress(processed,total)
            check_cancelled(cancelled)
        output={}
        for name,record in accum.items():
            power=record['power']/record['weight']; magnitude=record['magnitude']/record['weight']
            dct=record['dct_sum']/record['blocks']; radial=record['radial_result']
            step=max(1,config.tile_size//256)
            regions=np.asarray(record['regions']).reshape(math.ceil(image.height/config.tile_size),math.ceil(image.width/config.tile_size))
            output[name]={'power_preview':spectrum_preview(power),'magnitude_preview':spectrum_preview(magnitude, mode='magnitude'),
                'preview_power_method':'block sum; total power preserved',
                'preview_magnitude_method':'block RMS of tile-averaged magnitude',
                'preview_pool_factor':step,'preview_dc_index':[128,128],
                'preview_frequency_context':'pooled shifted FFT bins; frequency interval width is pool factor / tile size',
                'dct_energy':dct,'dct_region_map':regions,'radial_frequency':radial.radii.copy(),
                'radial_mean':record['radial']/record['weight'],'radial_counts':radial.count.copy(),
                'features':asdict(spectral_features(power)),'dc_energy':float(dct[0,0]),'ac_energy':float(dct.sum()-dct[0,0]),
                'dct_blocks':record['blocks'],'padded_blocks':record['padded_blocks'],
                'dct_low_energy':float(dct[(np.add.outer(np.arange(8),np.arange(8))>=1)&(np.add.outer(np.arange(8),np.arange(8))<=3)].sum()),
                'dct_mid_energy':float(dct[(np.add.outer(np.arange(8),np.arange(8))>=4)&(np.add.outer(np.arange(8),np.arange(8))<=7)].sum()),
                'dct_high_energy':float(dct[np.add.outer(np.arange(8),np.arange(8))>=8].sum()),
                'local_ac_energy_std':float(np.std(record['regions'])),
                'normalization':('abs(fft2(window*(samples-mean)))² / (N*sum(window²))' if config.subtract_mean
                                 else 'abs(fft2(window*samples))² / (N*sum(window²))'),
                'frequency_unit':'cycles/pixel','fft_dtype':'complex128','sample_dtype':'float64',
                'window_coherent_gain':fft.coherent_gain,'window_energy':fft.window_energy,
                'dct_level_shift':False,'grid_origin':[0,0],'padding':'edge',
                'radial_domain':'radius <= 0.5; square corners excluded; empty bins zero/count0'}
        return FrequencyResult('Completed',identity,image.width,image.height,image.mode,vars(config),output,processed,total,0,estimate,times,
            ('Tiled spektrum ortalaması global görüntü FFT değildir; kenarlar edge padding ile tamamlandı.',
             'YCbCr decoded RGB full-range BT.601; ICC uygulanmadı. Alpha dahil gizli RGB sayılır.',
             'DCT decoded piksel katsayılarıdır; orijinal JPEG kuantize katsayıları değildir.'))
