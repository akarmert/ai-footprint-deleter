import os
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PySide6.QtCore import QCoreApplication, QEvent, Qt
from PySide6.QtWidgets import QApplication, QLabel

from app.ui.frequency_pane import FrequencyHeatmap, FrequencyPane


_APPLICATION = None


@pytest.fixture(scope="session")
def frequency_app():
    global _APPLICATION
    _APPLICATION = QApplication.instance() or QApplication([])
    return _APPLICATION


@pytest.fixture
def pane(frequency_app):
    widget = FrequencyPane()
    yield widget
    widget.close()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    widget.deleteLater()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    frequency_app.processEvents()


@pytest.fixture
def result():
    channel = {
        "power_preview": np.arange(64, dtype=float).reshape(8, 8),
        "magnitude_preview": np.sqrt(np.arange(64, dtype=float).reshape(8, 8)),
        "dct_energy": [[row * 8 + column for column in range(8)] for row in range(8)],
        "dct_region_map": [[1, 2], [3, 4]],
        "radial_frequency": [0.1, 0.2, 0.3],
        "radial_mean": [5, 3, 1],
        "radial_counts": [8, 16, 24],
        "features": {"low_energy": 0.3, "high_energy": 0.7, "note": "not numeric", "invalid": float("nan")},
        "dc_energy": 4, "ac_energy": 6,
    }
    chroma = dict(channel, dct_region_map=[[9]], radial_mean=[1, 2, 3])
    return SimpleNamespace(status="Completed", channels={"Y": channel, "Cb": chroma, "Cr": channel},
                           tiles_processed=4, tiles_total=4, elapsed_seconds=0.01,
                           options={"window": "hann", "tile_size": 256, "subtract_mean": True},
                           memory_estimate=1024, timings={"fft": 0.003}, warnings=("Gözlem sınırlaması",))


def test_turkish_labels_and_compact_layout(pane, result, frequency_app):
    from PySide6.QtWidgets import QScrollArea
    pane.resize(660, 480)
    pane.show()
    pane.show_result(result)
    frequency_app.processEvents()
    assert pane.findChild(QScrollArea).horizontalScrollBar().maximum() == 0
    labels = [pane.features.item(row, 0).text() for row in range(pane.features.rowCount())]
    assert 'Düşük frekans enerjisi' in labels
    assert 'DC enerjisi' in labels
    assert pane.tabs.tabText(2) == 'Radyal'


def test_options_and_signals_are_real_configuration(pane):
    received = []
    pane.analyze_requested.connect(received.append)
    pane.window.setCurrentIndex(1)
    pane.tile_size.setCurrentText("1024")
    pane.remove_mean.setChecked(False)
    pane.start_button.click()
    assert received == [{"window": "none", "tile_size": 1024, "subtract_mean": False}]
    assert [pane.tabs.tabText(i) for i in range(3)] == ["FFT", "DCT", "Radyal"]
    assert not pane.display_button.isEnabled()


def test_result_and_worker_display_separation(pane, result):
    requests = []
    pane.display_requested.connect(requests.append)
    pane.show_result(result)
    assert len(requests) == 1
    assert not pane.fft.image.isNull()
    assert pane.dct_energy.image.size().width() == 8
    assert pane.dct_region.image.width() == 2
    assert pane.radial.points == [(0.1, 5.0), (0.2, 3.0), (0.3, 1.0)]
    assert pane.features.rowCount() == 4
    assert pane.progress.value() == pane.progress.maximum()
    pane.show_display(SimpleNamespace(image=[[0, 255], [128, 64]], lower=-1.0, upper=8.0))
    assert not pane.fft.image.isNull()
    assert pane.fft.minimum == -1
    assert pane.fft.maximum == 8
    assert pane.fft.image.pixelColor(0, 0) != pane.fft.image.pixelColor(1, 0)
    assert "Gözlem sınırlaması" in pane.details.toPlainText()
    assert "AI kanıtı değildir" in pane.details.toPlainText()
    assert "JPEG yerel katsayıları" in pane.details.toPlainText()


def test_last_tile_is_verifying_not_complete(pane, result):
    pane.set_state("running", "Çalışıyor")
    pane.set_progress(4, 4)
    assert pane.progress.value() < pane.progress.maximum()
    assert "Kaynak doğrulanıyor" in pane.progress.format()
    pane.show_result(result)
    assert pane.progress.value() == pane.progress.maximum()
    assert "Doğrulandı" in pane.progress.format()


def test_analysis_change_invalidates_visuals_and_requires_rerun(pane, result):
    requests = []
    pane.display_requested.connect(requests.append)
    pane.show_result(result)
    pane.show_display({"image": [[255]], "lower": 0, "upper": 1})
    pane.remove_mean.setChecked(False)
    assert pane.fft.image.isNull()
    assert pane.dct_energy.image.isNull()
    assert pane.features.rowCount() == 0
    assert not pane.display_button.isEnabled()
    assert "yeniden analiz" in pane.display_notice.text()
    pane.show_display({"image": [[255]]})
    assert pane.fft.image.isNull()
    assert len(requests) == 1


def test_channel_switch_updates_all_views_and_requests_fft(pane, result):
    requests = []
    pane.display_requested.connect(requests.append)
    pane.show_result(result)
    pane.channel.setCurrentText("Cb")
    assert requests[-1]["channel"] == "Cb"
    assert pane.dct_region.image.width() == 1
    assert pane.radial.points[-1] == (0.3, 3.0)


def test_display_controls_emit_exact_manual_and_auto_options(pane, result):
    requests = []
    pane.display_requested.connect(requests.append)
    pane.show_result(result)
    pane.mode.setCurrentIndex(1)
    pane.log.setChecked(False)
    pane.suppress_dc.setChecked(False)
    pane.scale_mode.setCurrentIndex(1)
    pane.minimum.setValue(2)
    pane.maximum.setValue(7)
    assert not pane.percentile_low.isEnabled()
    assert pane.minimum.isEnabled()
    pane.display_button.click()
    assert requests[-1] == {"channel": "Y", "mode": "magnitude", "log": False, "suppress_dc": False,
                            "percentile_low": 1, "percentile_high": 99.5,
                            "scale_mode": "manual", "minimum": 2, "maximum": 7}
    pane.minimum.setValue(8)
    assert not pane.display_button.isEnabled()
    pane.scale_mode.setCurrentIndex(0)
    pane.percentile_low.setValue(100)
    assert not pane.display_button.isEnabled()
    pane.percentile_low.setValue(1)
    assert pane.display_button.isEnabled()


@pytest.mark.parametrize("state", ["empty", "error", "cancelled", "source_changed", "unsupported"])
def test_terminal_state_removes_old_result(pane, result, state):
    pane.show_result(result)
    pane.set_state(state, "<b>Durum</b>")
    assert pane.result is None
    assert pane.summary.text() == "<b>Durum</b>"
    assert pane.summary.textFormat() == Qt.TextFormat.PlainText
    assert pane.dct_energy.image.isNull()
    assert pane.radial.points == []
    assert pane.progress.value() == 0
    assert not pane.display_button.isEnabled()


def test_busy_cancel_controls_and_late_display(pane, result):
    cancelled = []
    pane.cancel_requested.connect(lambda: cancelled.append(True))
    pane.show_result(result)
    pane.set_state("running", "Çalışıyor")
    assert not pane.start_button.isEnabled()
    assert not pane.channel.isEnabled()
    assert pane.cancel_button.isEnabled()
    pane.cancel_button.click()
    assert cancelled == [True]
    pane.show_display({"image": [[255]]})
    assert pane.fft.image.isNull()


def test_unsupported_dictionary_and_missing_channel(pane, result):
    pane.channel.setCurrentText("Cr")
    result.channels = {"Y": result.channels["Y"]}
    pane.show_result(vars(result))
    assert pane.channel.currentText() == "Y"
    assert not pane.channel.model().item(1).isEnabled()
    pane.show_result({"status": "Unsupported", "channels": {}})
    assert pane.result is None
    assert pane.progress.value() == 0
    assert pane.dct_energy.image.isNull()


def test_bounded_rendering_and_finite_data(pane, result, frequency_app):
    pane.show_result(result)
    pane.fft.set_data([[float("nan"), float("inf")], [1, 1]])
    assert not pane.fft.image.isNull()
    pane.fft.set_data([[1]] * 257)
    assert pane.fft.image.isNull()
    pane.fft.set_data([[1, 2], [3]])
    assert pane.fft.image.isNull()
    pane.setStyleSheet((Path(__file__).parents[2] / "assets/themes/dark.qss").read_text(encoding="utf-8"))
    pane.resize(900, 800)
    pane.show()
    frequency_app.processEvents()
    assert not pane.grab().isNull()
    assert all(label.textFormat() == Qt.TextFormat.PlainText for label in pane.findChildren(QLabel) if label in (pane.summary, pane.display_notice))
    assert not pane.dct_energy.grab().isNull()
    assert not pane.radial.grab().isNull()


def test_actual_display_matches_numeric_api_and_preserves_raw(pane, result):
    from modules.analysis.spectrum_visualization import display_spectrum

    raw = result.channels["Y"]["power_preview"]
    before = raw.copy()
    pane.show_result(result)
    expected = display_spectrum(raw, log=True, lower=1, upper=99.5, exclude_dc=True)
    assert pane.fft.minimum == expected.lower
    assert pane.fft.maximum == expected.upper
    assert pane.fft.image.pixelColor(4, 4).red() == 12
    np.testing.assert_array_equal(raw, before)
    pane.percentile_low.setValue(100)
    pane.scale_mode.setCurrentIndex(1)
    pane.maximum.setValue(8)
    pane.display_button.click()
    assert pane.fft.minimum == 0
    assert pane.fft.maximum == 8
    assert not pane.fft.image.isNull()
    np.testing.assert_array_equal(raw, before)


def test_real_result_dataclass_contract(pane, result):
    from modules.analysis.frequency_engine import FrequencyResult
    from modules.analysis.schemas import SourceIdentity

    identity = SourceIdentity("a" * 64, "a" * 64, 100, "PNG", "generation", "a" * 64, "2026-10-11")
    actual = FrequencyResult("Completed", identity, 32, 24, "RGB",
                             {"window": "hann", "tile_size": 512, "subtract_mean": False},
                             result.channels, 2, 2, 0.01, 1024, {}, ())
    pane.show_result(actual)
    assert "2 / 2 karo" in pane.summary.text()
    assert pane.options() == {"window": "hann", "tile_size": 512, "subtract_mean": False}
    assert pane.result.source_sha256 == "a" * 64
    assert not pane.fft.image.isNull()
