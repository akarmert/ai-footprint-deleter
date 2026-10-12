import hashlib
import json
import math
import threading
import time
from dataclasses import asdict

import pytest
from PIL import Image

from modules.analysis import (
    AnalysisCancelled, AnalysisEngine, AnalysisError, AnalysisOptions,
    MemoryBudget, MemoryBudgetExceeded, SourceChanged, plan_tiles,
)


def make_image(tmp_path, mode='RGB', pixels=None, size=(3, 2)):
    path = tmp_path / 'sample.png'
    image = Image.new(mode, size)
    if pixels is not None:
        image.putdata(pixels)
    image.save(path)
    image.close()
    return path


def test_analysis_known_rgb_exact_histogram(tmp_path):
    pixels = [(0, 10, 255), (20, 30, 40), (255, 100, 50),
              (1, 2, 3), (90, 100, 110), (254, 250, 240)]
    path = make_image(tmp_path, pixels=pixels)
    progress = []
    result = AnalysisEngine(options=AnalysisOptions(tile_size=2, halo=1)).analyze(
        path, generation_id='known', progress=lambda done, total: progress.append((done, total)))
    assert result.status == 'Complete'
    assert result.source_sha256 == hashlib.sha256(path.read_bytes()).hexdigest()
    assert result.source_identity.snapshot_identity == result.source_sha256
    assert result.generation_id == 'known'
    assert progress == [(1, 2), (2, 2)]
    for index, channel in enumerate('RGB'):
        values = [pixel[index] for pixel in pixels]
        stats = result.channel_statistics[channel]
        expected = [values.count(value) for value in range(256)]
        assert list(stats.histogram) == expected
        assert stats.count == 6
        assert stats.sum == sum(values)
        assert stats.sum_squares == sum(value * value for value in values)
        assert stats.mean == sum(values) / 6
        assert stats.standard_deviation == pytest.approx(math.sqrt(sum((v - stats.mean) ** 2 for v in values) / 6))
        assert stats.minimum == min(values)
        assert stats.maximum == max(values)
    with Image.open(path) as image:
        assert result.luminance.histogram == tuple(image.convert('L').histogram())
    assert json.loads(json.dumps(asdict(result)))['generation_id'] == 'known'
    assert result.measured_peak_memory is None
    assert result.elapsed_seconds >= result.decode_seconds >= 0


@pytest.mark.parametrize('mode,pixels', [('L', [0, 2, 4, 6, 8, 10]),
    ('RGBA', [(255, 1, 2, 0), (0, 255, 3, 0), (4, 5, 255, 255)] * 2)])
def test_analysis_raw_modes_and_halo_invariance(tmp_path, mode, pixels):
    path = make_image(tmp_path, mode, pixels)
    whole = AnalysisEngine().analyze(path)
    tiled = AnalysisEngine(options=AnalysisOptions(tile_size=1, halo=2)).analyze(path)
    assert tiled.channel_statistics == whole.channel_statistics
    assert tiled.luminance == whole.luminance
    assert sum(tiled.luminance.histogram) == 6
    if mode == 'RGBA':
        assert tiled.channel_statistics['R'].maximum == 255


def test_analysis_plan_edges_no_double_count():
    coverage = [0] * (7 * 5)
    for tile in plan_tiles(7, 5, 3, 2):
        l, t, r, b = tile.core
        pl, pt, pr, pb = tile.processing
        assert 0 <= pl <= l < r <= pr <= 7
        assert 0 <= pt <= t < b <= pb <= 5
        for y in range(t, b):
            for x in range(l, r):
                coverage[y * 7 + x] += 1
    assert coverage == [1] * 35


def test_analysis_expected_hash_and_mutation(tmp_path):
    path = make_image(tmp_path)
    with pytest.raises(SourceChanged):
        AnalysisEngine().analyze(path, expected_sha256='0' * 64)
    def mutate(done, total):
        Image.new('RGB', (3, 2), 'red').save(path)
    with pytest.raises(SourceChanged):
        AnalysisEngine().analyze(path, progress=mutate)


def test_analysis_cancel_and_memory_release(tmp_path):
    path = make_image(tmp_path)
    budget = MemoryBudget(64 * 1024 * 1024)
    event = threading.Event()
    with pytest.raises(AnalysisCancelled):
        AnalysisEngine(budget).analyze(path, cancelled=lambda: True)
    with pytest.raises(AnalysisCancelled):
        AnalysisEngine(budget, AnalysisOptions(tile_size=1)).analyze(
            path, cancelled=event.is_set, progress=lambda done, total: event.set())
    assert budget.used_bytes == 0
    assert AnalysisEngine(budget).analyze(path).status == 'Complete'


def test_analysis_budget_rejected_before_load(tmp_path, monkeypatch):
    path = make_image(tmp_path)
    def forbidden(self, *args, **kwargs):
        pytest.fail('Image.load called before budget admission')
    monkeypatch.setattr(Image.Image, 'load', forbidden)
    with pytest.raises(MemoryBudgetExceeded):
        AnalysisEngine(MemoryBudget(3 * 1024 * 1024)).analyze(path)


@pytest.mark.parametrize('mode', ['P', '1', 'I;16'])
def test_analysis_unsupported_modes(tmp_path, mode):
    path = make_image(tmp_path, mode)
    result = AnalysisEngine().analyze(path)
    assert result.status == 'Unsupported'
    assert not result.channel_statistics
    assert result.unsupported_reason


def test_analysis_bad_crc_and_truncated(tmp_path):
    path = make_image(tmp_path)
    data = bytearray(path.read_bytes())
    data[-1] ^= 1
    path.write_bytes(data)
    with pytest.raises(AnalysisError):
        AnalysisEngine().analyze(path)
    path.write_bytes(b'not an image')
    with pytest.raises(AnalysisError):
        AnalysisEngine().analyze(path)


def test_analysis_extension_and_animation(tmp_path):
    path = make_image(tmp_path)
    renamed = tmp_path / 'bad.jpg'
    renamed.write_bytes(path.read_bytes())
    assert AnalysisEngine().analyze(renamed).status == 'Unsupported'
    Image.new('RGB', (3, 2)).save(path, save_all=True, append_images=[Image.new('RGB', (3, 2), 'red')])
    assert AnalysisEngine().analyze(path).status == 'Unsupported'


def test_analysis_safety_limits_and_options(tmp_path):
    path = make_image(tmp_path)
    assert AnalysisEngine(options=AnalysisOptions(max_pixels=5)).analyze(path).status == 'Unsupported'
    with pytest.raises(AnalysisError):
        AnalysisEngine(options=AnalysisOptions(max_source_bytes=1)).analyze(path)
    for kwargs in ({'tile_size': 0}, {'halo': -1}, {'max_pixels': 40_000_001}, {'hash_chunk_size': 2 ** 21}):
        with pytest.raises(ValueError):
            AnalysisOptions(**kwargs)


def test_analysis_budget_fifo_cancel_and_failure_release():
    budget = MemoryBudget(10)
    entered = []
    cancel = threading.Event()
    started = threading.Event()
    def waiter(name, amount, cancelled=None):
        started.set()
        try:
            with budget.reserve(amount, name, cancelled):
                entered.append(name)
        except AnalysisCancelled:
            entered.append('cancelled')
    with budget.reserve(10):
        first = threading.Thread(target=waiter, args=('first', 10, cancel.is_set))
        first.start()
        assert started.wait(1)
        time.sleep(0.02)
        second = threading.Thread(target=waiter, args=('second', 1))
        second.start()
        cancel.set()
        first.join(1)
        assert not first.is_alive()
        assert entered == ['cancelled']
    second.join(1)
    assert not second.is_alive()
    assert entered == ['cancelled', 'second']
    with pytest.raises(ValueError):
        with budget.reserve(2):
            raise ValueError('test')
    assert budget.used_bytes == 0
