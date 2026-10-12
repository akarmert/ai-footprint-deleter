import threading
from dataclasses import asdict

import pytest
from PIL import Image

from modules.analysis import AnalysisEngine, MemoryBudget, MemoryBudgetExceeded, SourceChanged


def image_path(tmp_path, suffix='.png'):
    path = tmp_path / ('source' + suffix)
    image = Image.new('RGB', (8, 7), (32, 64, 128))
    image.save(path)
    image.close()
    return path


def test_analysis_header_admission_before_pillow(tmp_path, monkeypatch):
    path = image_path(tmp_path)
    monkeypatch.setattr(Image, 'open', lambda *args, **kwargs: pytest.fail('Pillow opened before admission'))
    with pytest.raises(MemoryBudgetExceeded):
        AnalysisEngine(MemoryBudget(3 * 1024 * 1024)).analyze(path)


def test_analysis_source_deleted_after_snapshot(tmp_path):
    path = image_path(tmp_path)
    def delete(done, total):
        path.unlink()
    with pytest.raises(SourceChanged):
        AnalysisEngine().analyze(path, progress=delete)


def test_analysis_all_images_close_under_reservation(tmp_path, monkeypatch):
    path = image_path(tmp_path)
    budget = MemoryBudget(64 * 1024 * 1024)
    real_open = Image.open
    observed = []
    def tracked_open(*args, **kwargs):
        image = real_open(*args, **kwargs)
        real_close = image.close
        def close():
            observed.append(budget.used_bytes)
            real_close()
        image.close = close
        return image
    monkeypatch.setattr(Image, 'open', tracked_open)
    result = AnalysisEngine(budget).analyze(path)
    assert result.status == 'Complete'
    assert len(observed) == 2
    assert all(amount > 0 for amount in observed)
    assert budget.used_bytes == 0


def test_analysis_serialized_schema_and_webp(tmp_path):
    path = image_path(tmp_path, '.webp')
    result = AnalysisEngine().analyze(path, generation_id='serial')
    serialized = asdict(result)
    for name in ('schema_version', 'analysis_id', 'source_sha256', 'generation_id',
                 'completion_status', 'image_width', 'image_height', 'analysis_width',
                 'analysis_height', 'analysis_mode', 'processing_strategy', 'elapsed_time',
                 'memory_estimate', 'histogram_data', 'statistics', 'tile_size', 'tiles_processed'):
        assert name in serialized
    assert serialized['completion_status'] == 'Complete'
    assert serialized['elapsed_time'] == result.elapsed_seconds
    assert result.channel_statistics['R'].count == 56


def test_analysis_full_admission_no_nested_deadlock(tmp_path):
    path = image_path(tmp_path)
    budget = MemoryBudget(33 * 1024 * 1024)
    result = []
    def analyze():
        try:
            result.append(AnalysisEngine(budget).analyze(path))
        except MemoryBudgetExceeded:
            result.append('rejected')
    thread = threading.Thread(target=analyze, daemon=True)
    thread.start()
    thread.join(2)
    assert not thread.is_alive()
    assert result == ['rejected']
    assert budget.used_bytes == 0
