import json
import subprocess
import sys
from types import SimpleNamespace

import pytest
from PIL import Image

from scripts import benchmark_frequency as benchmark


@pytest.mark.parametrize('value', [0, 1, 2, -1, True, 3.5])
def test_repeat_validation(value):
    with pytest.raises(ValueError):
        benchmark.validate_repeats(value)


def test_real_document_isolated_private_and_preserved(tmp_path, monkeypatch):
    source = tmp_path / 'private-photo.jpg'
    Image.new('RGB', (32, 24)).save(source)
    original = source.read_bytes()
    calls = []

    def child(arguments, timeout):
        calls.append((arguments, timeout))
        return {'durations': [float(len(calls))], 'source_preserved': True}

    monkeypatch.setattr(benchmark, 'child_record', child)
    document = benchmark.real_document(source, 3, 45)
    assert len(calls) == 3
    assert all('--worker' in args and timeout == 45 for args, timeout in calls)
    assert document['min_seconds'] == 1
    assert document['max_seconds'] == 3
    assert document['mean_seconds'] == 2
    assert document['source_preserved']
    assert 'licensing not inferred' in document['fixture']
    text = json.dumps(document)
    assert str(source) not in text
    assert benchmark.source_digest(source) not in text
    assert source.read_bytes() == original


def test_rejection_measures_and_releases_budget(tmp_path):
    source = tmp_path / 'private.png'
    Image.new('RGB', (32, 24)).save(source)
    original = source.read_bytes()
    result = benchmark.run_rejection(source, 1)
    assert result['status'] == 'MemoryBudgetExceeded'
    assert result['duration_seconds'] >= 0
    assert result['released_bytes'] == 0
    assert result['source_preserved']
    assert source.read_bytes() == original
    assert str(source) not in json.dumps(result)


def test_preview_timeout(monkeypatch):
    clock = iter([0, 2])
    monkeypatch.setattr(benchmark.time, 'perf_counter', lambda: next(clock))
    window = SimpleNamespace(analysis_preview=SimpleNamespace(_loading=True),
                             before_preview=SimpleNamespace(_loading=False))
    with pytest.raises(RuntimeError, match='Preview timeout'):
        benchmark.wait_preview(SimpleNamespace(processEvents=lambda: None), window, 1)


def test_child_timeout_is_bounded_and_private(monkeypatch):
    def run(command, **kwargs):
        assert kwargs['timeout'] == 12
        assert kwargs['capture_output']
        raise subprocess.TimeoutExpired(command, 12, stderr='private path and hash')

    monkeypatch.setattr(benchmark.subprocess, 'run', run)
    with pytest.raises(RuntimeError) as error:
        benchmark.child_record(['--input', 'private.jpg'], 12)
    assert 'private.jpg' not in str(error.value)
    assert 'private path' not in str(error.value)


@pytest.mark.parametrize('arguments', [
    ['--repeats', '2'], ['--timeout', 'nan'], ['--timeout', '0'],
    ['--budget-mib', '1'], ['--worker'],
])
def test_cli_invalid_options(arguments, monkeypatch):
    monkeypatch.setattr(sys, 'argv', ['benchmark_frequency.py', *arguments])
    with pytest.raises(SystemExit) as error:
        benchmark.main()
    assert error.value.code == 2


def test_output_is_not_overwritten(tmp_path, monkeypatch):
    output = tmp_path / 'evidence.json'
    output.write_text('existing evidence')
    monkeypatch.setattr(sys, 'argv', ['benchmark_frequency.py', '--output', str(output)])
    with pytest.raises(SystemExit) as error:
        benchmark.main()
    assert error.value.code == 2
    assert output.read_text() == 'existing evidence'


def test_worker_failure_does_not_disclose_source(tmp_path, monkeypatch, capsys):
    source = tmp_path / 'private.jpg'
    source.write_bytes(b'not an image')
    monkeypatch.setattr(sys, 'argv', ['benchmark_frequency.py', '--worker', '--input', str(source)])
    with pytest.raises(SystemExit) as error:
        benchmark.main()
    assert error.value.code == 1
    captured = capsys.readouterr()
    assert str(source) not in captured.out + captured.err


@pytest.mark.parametrize('mode', ['hash', 'copy'])
def test_oversize_rejected_before_read(tmp_path, monkeypatch, mode):
    source = tmp_path / 'private.jpg'
    source.write_bytes(b'x' * 17)
    from pathlib import Path
    original_open = Path.open
    class NoRead:
        def __init__(self, stream):
            self.stream = stream
        def __enter__(self):
            return self
        def __exit__(self, *args):
            self.stream.close()
        def fileno(self):
            return self.stream.fileno()
        def read(self, *args):
            pytest.fail('Oversized source must be rejected before read')
    def guarded_open(path, *args, **kwargs):
        stream = original_open(path, *args, **kwargs)
        return NoRead(stream) if path == source else stream
    monkeypatch.setattr(Path, 'open', guarded_open)
    monkeypatch.setattr(benchmark, 'MAX_INPUT_BYTES', 16)
    with pytest.raises(ValueError, match='byte limit'):
        if mode == 'hash':
            benchmark.source_digest(source)
        else:
            benchmark.copy_source(source, tmp_path / 'copy.jpg')
    assert not (tmp_path / 'copy.jpg').exists() or (tmp_path / 'copy.jpg').stat().st_size == 0


def test_growing_source_bounded_transfer(tmp_path, monkeypatch):
    import io
    from pathlib import Path
    source = tmp_path / 'source.jpg'
    source.write_bytes(b'x')
    reads = []
    class Growing(io.BytesIO):
        def fileno(self):
            return 999
        def read(self, size=-1):
            block = super().read(min(size, 5))
            reads.append(len(block))
            return block
    monkeypatch.setattr(benchmark, 'MAX_INPUT_BYTES', 16)
    monkeypatch.setattr(benchmark.os, 'fstat', lambda fd: SimpleNamespace(st_size=1))
    monkeypatch.setattr(Path, 'open', lambda *args, **kwargs: Growing(b'x' * 30))
    destination = io.BytesIO()
    with pytest.raises(ValueError, match='byte limit'):
        benchmark.bounded_transfer(source, destination)
    assert reads == [5, 5, 5, 2]
    assert len(destination.getvalue()) == 15
