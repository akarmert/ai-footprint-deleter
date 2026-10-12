import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')

import json
import time
from threading import Event

import pytest
from PIL import Image, PngImagePlugin
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import QApplication, QFileDialog, QMessageBox

from app.services.workflow import OperationCancelled
from app.ui.main_window import MainWindow
from app.workers.workflow_task import WorkflowTask


def wait_until(app, predicate, seconds=10):
    deadline = time.monotonic() + seconds
    while not predicate():
        if time.monotonic() > deadline:
            raise AssertionError('Qt worker timeout')
        app.processEvents()
        time.sleep(0.002)
    app.processEvents()


@pytest.fixture
def app():
    return QApplication.instance() or QApplication([])


@pytest.fixture
def source(tmp_path):
    path = tmp_path / 'private-owner.png'
    info = PngImagePlugin.PngInfo()
    info.add_text('parameters', 'private-prompt-secret seed: 42')
    Image.new('RGB', (32, 24), (25, 80, 125)).save(path, pnginfo=info)
    return path


@pytest.fixture
def window(app, monkeypatch):
    monkeypatch.setattr('app.ui.main_window.stale_temp_candidates', lambda: [])
    view = MainWindow()
    view.show()
    yield view
    view.close()
    wait_until(app, lambda: not view._tasks)
    app.processEvents()


@pytest.mark.parametrize('kind', ['scan', 'clean'])
def test_cancel_checkpoint_no_error_popup(app, window, monkeypatch, kind):
    entered = Event()
    release = Event()
    errors = []
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: errors.append(args))

    def operation(cancelled):
        entered.set()
        assert release.wait(5)
        if cancelled():
            raise OperationCancelled()
        raise AssertionError('Cancellation checkpoint was not set')

    window._submit(kind, operation, cancellable=True)
    wait_until(app, entered.is_set)
    task = next(iter(window._tasks.values()))
    window.cancel_button.click()
    assert task.cancel_requested.is_set()
    assert not window.cancel_button.isEnabled()
    release.set()
    wait_until(app, lambda: not window._tasks)
    assert not errors
    assert 'iptal' in window.statusBar().currentMessage().lower()
    assert window.open_button.isEnabled()
    assert window.scan_result is None
    assert window.process_result is None


def test_worker_error_popup_and_recovery(app, window, monkeypatch):
    errors = []
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: errors.append(args))

    def fail():
        raise ValueError('controlled failure')

    window._submit('scan', fail)
    wait_until(app, lambda: not window._tasks)
    assert len(errors) == 1
    assert 'controlled failure' in errors[0][-1]
    assert window.open_button.isEnabled()


def test_close_requests_cancel_waits_without_blocking(app, window, monkeypatch):
    entered = Event()
    release = Event()
    errors = []
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: errors.append(args))

    def operation(cancelled):
        entered.set()
        assert release.wait(5)
        assert cancelled()
        raise OperationCancelled()

    window._submit('scan', operation, cancellable=True)
    wait_until(app, entered.is_set)
    start = time.monotonic()
    window.close()
    assert time.monotonic() - start < 0.5
    assert window.isVisible()
    assert window._closing
    assert window._tasks
    release.set()
    wait_until(app, lambda: not window._tasks and not window.isVisible())
    assert not errors
    assert window._pool.waitForDone(0)


def test_finished_signal_retains_task_until_run_returns(app, window, monkeypatch):
    emitted = Event()
    release = Event()
    original_run = WorkflowTask.run

    def delayed_return(task):
        original_run(task)
        emitted.set()
        assert release.wait(5)

    monkeypatch.setattr(WorkflowTask, 'run', delayed_return)
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: None)

    def fail():
        raise ValueError('finish-tail')

    window._submit('scan', fail)
    wait_until(app, emitted.is_set)
    ticks = []
    QTimer.singleShot(0, lambda: ticks.append(True))
    wait_until(app, lambda: bool(ticks))
    assert window._tasks
    assert not window.open_button.isEnabled()
    release.set()
    wait_until(app, lambda: not window._tasks)
    assert window._pool.waitForDone(0)


def test_real_scan_report_safe_default_and_explicit_standard(app, window, source, tmp_path, monkeypatch):
    window.scan_path(str(source))
    wait_until(app, lambda: window.scan_result is not None and not window._tasks)
    assert window.navigation.count() == 8
    assert window.report_mode.currentData() is True
    assert 'private-prompt-secret' not in window.report_content.toPlainText()
    assert str(source) not in window.report_content.toPlainText()
    assert window.scan_result.sha256 not in window.report_content.toPlainText()
    target = tmp_path / 'safe.json'
    monkeypatch.setattr(QFileDialog, 'getSaveFileName', lambda *args: (str(target), 'JSON'))
    window.export_report()
    safe = target.read_text(encoding='utf-8')
    json.loads(safe)
    assert 'private-prompt-secret' not in safe
    assert str(source) not in safe
    assert window.scan_result.sha256 not in safe
    warnings = []
    monkeypatch.setattr(QMessageBox, 'warning', lambda *args: warnings.append(args) or QMessageBox.StandardButton.No)
    window.report_mode.setCurrentIndex(1)
    assert window.report_mode.currentData() is True
    assert len(warnings) == 1
    monkeypatch.setattr(QMessageBox, 'warning', lambda *args: QMessageBox.StandardButton.Yes)
    window.report_mode.setCurrentIndex(1)
    assert window.report_mode.currentData() is False
    standard = tmp_path / 'standard.json'
    monkeypatch.setattr(QFileDialog, 'getSaveFileName', lambda *args: (str(standard), 'JSON'))
    window.export_scan()
    assert 'private-prompt-secret' in standard.read_text(encoding='utf-8')
    errors = []
    monkeypatch.setattr(QMessageBox, 'critical', lambda *args: errors.append(args))
    window.export_scan()
    assert errors
    assert 'private-prompt-secret' in standard.read_text(encoding='utf-8')


def test_report_history_bounded_and_preview_capped(app, window, source):
    result = window.workflow.scan(str(source))
    for index in range(25):
        window._add_report(str(index), result)
    assert len(window._reports) == 20
    assert window.report_list.count() == 20
    assert window._reports[0][0] == '5'
    assert window.report_list.item(0).text() == '5'
    assert len(window._preview_json({'value': 'x' * 100000})) < 16100


def test_consent_reset_and_actual_clean_options(app, window, source, tmp_path, monkeypatch):
    monkeypatch.setattr(QMessageBox, 'warning', lambda *args: QMessageBox.StandardButton.Yes)
    window.scan_path(str(source))
    wait_until(app, lambda: window.scan_result is not None and not window._tasks)
    window.rights_check.setChecked(True)
    destination = tmp_path / 'clean.png'
    monkeypatch.setattr(QFileDialog, 'getSaveFileName', lambda *args: (str(destination), 'PNG'))
    original_clean = window.workflow.clean
    seen = []

    def clean(source_path, target, options, cancelled=None):
        seen.append((options.remove_rights, cancelled))
        return original_clean(source_path, target, options, cancelled=cancelled)

    monkeypatch.setattr(window.workflow, 'clean', clean)
    window.clean_button.click()
    wait_until(app, lambda: window.process_result is not None and not window._tasks)
    assert seen[0][0] is True
    assert callable(seen[0][1])
    assert destination.is_file()
    assert window.process_result.checks['pixels'] == 'Verified'
    window.scan_path(str(source))
    wait_until(app, lambda: window.scan_result is not None and not window._tasks)
    assert not window.rights_check.isChecked()
    assert not window.c2pa_check.isChecked()


def test_stale_temp_notice_nonblocking(app, window, monkeypatch):
    monkeypatch.setattr('app.ui.main_window.stale_temp_candidates', lambda: ['sensitive-path'])
    window._check_stale_temp()
    assert '1' in window.temp_warning.text()
    assert 'Otomatik silinmedi' in window.temp_warning.text()
    assert 'sensitive-path' not in window.temp_warning.text()
    assert window.open_button.isEnabled()
