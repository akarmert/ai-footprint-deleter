"""Crash residue journal. Never delete a candidate based on its name or this ledger."""
import json
import os
from pathlib import Path
import stat
import uuid


def _journal_root():
    base = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local' / 'state')))
    return base / 'AI-Footprint-Cleaner' / 'temp-journal'


def _is_link(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


def register_temp(path):
    root = _journal_root()
    root.mkdir(parents=True, exist_ok=True)
    for folder in (root, root.parent):
        if _is_link(folder):
            raise ValueError('Geçici dosya günlüğü reparse/symlink üzerinden kullanılamaz.')
    entry = root / (uuid.uuid4().hex + '.json')
    with entry.open('x', encoding='utf-8') as stream:
        json.dump({'path': str(Path(path).absolute()), 'version': 1}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    return entry


def unregister_temp(entry):
    if entry is not None:
        Path(entry).unlink(missing_ok=True)


def stale_temp_candidates():
    """Bounded, journal-only discovery. Returned paths are NOT proof of ownership."""
    root = _journal_root()
    try:
        if not root.exists() or _is_link(root) or _is_link(root.parent):
            return []
    except OSError:
        return []
    candidates = []
    for index, entry in enumerate(root.glob('*.json')):
        if index >= 200:
            break
        try:
            if _is_link(entry) or entry.stat().st_size > 8192:
                continue
            record = json.loads(entry.read_text(encoding='utf-8'))
            path = Path(record['path'])
            if record.get('version') == 1 and path.is_absolute() and path.name.startswith('.afc-') and path.exists():
                candidates.append(str(path))
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return candidates
