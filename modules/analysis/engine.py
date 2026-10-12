import hashlib
import math
import os
import tempfile
from dataclasses import replace
from contextlib import closing, contextmanager, nullcontext
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from .containers import validate_container
from .exceptions import AnalysisError, MemoryBudgetExceeded, SourceChanged, check_cancelled
from .memory import ANALYSIS_SCHEDULER, DEFAULT_BUDGET
from .schemas import AnalysisOptions, AnalysisResult, ChannelStatistics, SourceIdentity, Tile


def plan_tiles(width, height, tile_size=512, halo=0):
    if width <= 0 or height <= 0 or tile_size <= 0 or halo < 0:
        raise ValueError('Invalid tile dimensions')
    for top in range(0, height, tile_size):
        for left in range(0, width, tile_size):
            right, bottom = min(width, left + tile_size), min(height, top + tile_size)
            yield Tile((left, top, right, bottom),
                       (max(0, left - halo), max(0, top - halo),
                         min(width, right + halo), min(height, bottom + halo)),
                       (top // tile_size) * ((width + tile_size - 1) // tile_size) + left // tile_size)


def statistics(histogram):
    count = sum(histogram)
    total = sum(value * frequency for value, frequency in enumerate(histogram))
    squares = sum(value * value * frequency for value, frequency in enumerate(histogram))
    occupied = [value for value, frequency in enumerate(histogram) if frequency]
    variance_numerator = squares * count - total * total
    return ChannelStatistics(count, occupied[0], occupied[-1], total, squares,
                             total / count, math.sqrt(variance_numerator) / count,
                             tuple(histogram))


def _stamp(stat):
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def _copy_hash(source, target, options, cancelled):
    digest = hashlib.sha256()
    size = 0
    while True:
        check_cancelled(cancelled)
        chunk = source.read(options.hash_chunk_size)
        if not chunk:
            break
        size += len(chunk)
        if size > options.max_source_bytes:
            raise AnalysisError('Source exceeds 128 MiB safety limit')
        digest.update(chunk)
        if target is not None:
            target.write(chunk)
    return digest.hexdigest(), size


@contextmanager
def _failure_cleanup():
    try:
        yield
    except BaseException as error:
        pending = [error]
        seen = set()
        while pending:
            current = pending.pop()
            if id(current) in seen:
                continue
            seen.add(id(current))
            traceback.clear_frames(current.__traceback__)
            if current.__cause__ is not None:
                pending.append(current.__cause__)
            if current.__context__ is not None:
                pending.append(current.__context__)
        raise


class _SnapshotView:
    def __init__(self, stream):
        self._stream = stream

    def read(self, size=-1):
        return self._stream.read(size)

    def seek(self, offset, whence=0):
        return self._stream.seek(offset, whence)

    def tell(self):
        return self._stream.tell()

    def close(self):
        pass


class AnalysisEngine:
    def __init__(self, budget=None, options=None):
        self.budget = DEFAULT_BUDGET if budget is None else budget
        self.options = AnalysisOptions() if options is None else options

    def analyze(self, path, expected_sha256=None, generation_id='', cancelled=None, progress=None):
        started = time.perf_counter()
        options = self.options
        expected = options.expected_sha256 if expected_sha256 is None else expected_sha256
        generation = generation_id or options.generation_id
        path = Path(path)
        with ANALYSIS_SCHEDULER.reserve(1, 'Analysis scheduler', cancelled):
            with nullcontext():
                try:
                    with path.open('rb') as source, tempfile.TemporaryFile(mode='w+b') as snapshot:
                        initial = os.fstat(source.fileno())
                        if _stamp(path.stat()) != _stamp(initial):
                            raise SourceChanged('Source changed before snapshot')
                        if initial.st_size > options.max_source_bytes:
                            raise AnalysisError('Source exceeds 128 MiB safety limit')
                        with self.budget.reserve(2 * 1024 * 1024, 'Snapshot buffers', cancelled):
                            source_hash, size = _copy_hash(source, snapshot, options, cancelled)
                        if _stamp(path.stat()) != _stamp(initial):
                            raise SourceChanged('Source changed during snapshot')
                        if expected is not None and source_hash != expected:
                            raise SourceChanged('Source hash does not match expected SHA256')
                        source.close()
                        snapshot.flush()
                        snapshot.seek(0)
                        result = self._analyze_snapshot(snapshot, path.suffix.lower(), source_hash,
                                                        size, generation, started, cancelled, progress)
                        check_cancelled(cancelled)
                        try:
                            with self.budget.reserve(2 * 1024 * 1024, 'Final source hash', cancelled):
                                with path.open('rb') as current:
                                    current_hash, current_size = _copy_hash(current, None, options, cancelled)
                            if (current_hash != source_hash or current_size != size
                                    or _stamp(path.stat()) != _stamp(initial)):
                                raise SourceChanged('Source changed during analysis')
                        except OSError as error:
                            raise SourceChanged('Source no longer accessible after snapshot') from error
                        check_cancelled(cancelled)
                        return replace(result, elapsed_seconds=time.perf_counter() - started)
                except AnalysisError:
                    raise
                except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as error:
                    raise AnalysisError('Image could not be safely analyzed') from error

    def _analyze_snapshot(self, snapshot, suffix, digest, size, generation, started, cancelled, progress):
        options = self.options
        with self.budget.reserve(2 * size + 32 * 1024 * 1024, 'Header and encoded buffers', cancelled), _failure_cleanup():
            image = Image.open(_SnapshotView(snapshot))
            try:
                fmt, mode = image.format or '', image.mode
                width, height = image.size
                identity = SourceIdentity(digest, digest, size, fmt, generation, digest,
                                          datetime.now(timezone.utc).isoformat())
                reason = None
                expected_formats = {'.png': 'PNG', '.jpg': 'JPEG', '.jpeg': 'JPEG',
                                    '.webp': 'WEBP', '.tif': 'TIFF', '.tiff': 'TIFF'}
                if expected_formats.get(suffix) != fmt:
                    reason = 'Unsupported format or extension mismatch'
                elif width * height > options.max_pixels:
                    reason = 'Image exceeds 40 MP safety limit'
                elif fmt not in ('PNG', 'JPEG', 'WEBP', 'TIFF'):
                    reason = 'Unsupported image format'
                elif mode not in ('RGB', 'RGBA', 'L'):
                    reason = 'Only raw RGB, RGBA and L modes are supported'
                elif getattr(image, 'n_frames', 1) != 1:
                    reason = 'Multi-frame images are unsupported'
                if reason is None:
                    reason = validate_container(snapshot, fmt, size, cancelled)
                warnings = ['Raw storage orientation; no EXIF orientation transform applied',
                            'Native decoder allocation is an estimate, not a hard memory limit']
                if image.info.get('icc_profile'):
                    warnings.append('ICC profile is not applied; statistics use unmanaged raw samples')
                if mode == 'RGBA':
                    warnings.append('Transparent pixels retain raw RGB samples; alpha is analyzed separately')
                if reason:
                    return AnalysisResult(identity, digest, generation, 'Unsupported', width, height,
                                          mode, width * height, elapsed_seconds=time.perf_counter() - started,
                                          warnings=tuple(warnings), unsupported_reason=reason)
            finally:
                try:
                    image.close()
                finally:
                    image = None
        snapshot.seek(0)
        tile_side = min(options.tile_size + 2 * options.halo, max(width, height))
        estimate = width * height * (8 if fmt == 'TIFF' else 4) + tile_side * tile_side * 12 + 32 * 1024 * 1024 + 2 * size
        if estimate + 2 * 1024 * 1024 > self.budget.limit_bytes:
            raise MemoryBudgetExceeded('Full decode plus snapshot buffers exceeds memory budget; no downsampling performed')
        with self.budget.reserve(estimate, 'Full image decode and tiles', cancelled), _failure_cleanup():
            check_cancelled(cancelled)
            image = Image.open(_SnapshotView(snapshot))
            try:
                decode_start = time.perf_counter()
                image.load()
                decode_seconds = time.perf_counter() - decode_start
                check_cancelled(cancelled)
                histograms = {name: [0] * 256 for name in mode}
                luminance = [0] * 256
                total = ((width + options.tile_size - 1) // options.tile_size
                         * ((height + options.tile_size - 1) // options.tile_size))
                processed = 0
                for tile in plan_tiles(width, height, options.tile_size, options.halo):
                    check_cancelled(cancelled)
                    with closing(image.crop(tile.processing)) as processing:
                        left, top, right, bottom = tile.core
                        px, py, _, _ = tile.processing
                        with closing(processing.crop((left - px, top - py, right - px, bottom - py))) as core:
                            histogram = core.histogram()
                            for index, name in enumerate(mode):
                                aggregate = histograms[name]
                                for value, frequency in enumerate(histogram[index * 256:(index + 1) * 256]):
                                    aggregate[value] += frequency
                            with closing(core.convert('L')) as light:
                                for value, frequency in enumerate(light.histogram()):
                                    luminance[value] += frequency
                    processed += 1
                    check_cancelled(cancelled)
                    if progress is not None:
                        progress(processed, total)
                return AnalysisResult(identity, digest, generation, 'Complete', width, height, mode,
                                      width * height, {name: statistics(hist) for name, hist in histograms.items()},
                                      statistics(luminance), options.tile_size, options.halo, processed,
                                      estimate + 2 * 1024 * 1024, None, time.perf_counter() - started,
                                      decode_seconds, tuple(warnings))
            finally:
                try:
                    image.close()
                finally:
                    image = None
