from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import (
    QComboBox, QHBoxLayout, QLabel, QPlainTextEdit, QProgressBar,
    QPushButton, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
)


class HistogramWidget(QWidget):
    COLORS = {"R": "#e86b6b", "G": "#69c78b", "B": "#75a5ed", "Luma": "#dddddd", "A": "#c28ded"}

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.histograms = {}
        self.channels: tuple[str, ...] = ("R", "G", "B")
        self.setMinimumHeight(180)
        self.setAccessibleName("256 kutulu kanal histogramı")

    def set_data(self, histograms: dict) -> None:
        self.histograms = histograms
        self.update()

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.fillRect(self.rect(), self.palette().base())
        plot = self.rect().adjusted(16, 12, -16, -24)
        painter.setPen(self.palette().mid().color())
        painter.drawRect(plot)
        available = [self.histograms[channel] for channel in self.channels if channel in self.histograms]
        peak = max((max(values, default=0) for values in available), default=0)
        if not peak:
            painter.setPen(self.palette().text().color())
            painter.drawText(plot, Qt.AlignmentFlag.AlignCenter, "Histogram verisi yok")
            return
        for channel in self.channels:
            values = self.histograms.get(channel)
            if values is None:
                continue
            painter.setPen(QPen(QColor(self.COLORS.get(channel, "#dddddd")), 1))
            for index in range(min(256, len(values)) - 1):
                x1 = plot.left() + index * plot.width() / 255
                x2 = plot.left() + (index + 1) * plot.width() / 255
                y1 = plot.bottom() - values[index] * plot.height() / peak
                y2 = plot.bottom() - values[index + 1] * plot.height() / peak
                painter.drawLine(int(x1), int(y1), int(x2), int(y2))
        painter.setPen(self.palette().text().color())
        painter.drawText(16, self.height() - 5, "0")
        painter.drawText(self.width() - 40, self.height() - 5, "255")


class AnalysisPane(QWidget):
    INTERPRETATION = "Bu analiz AI olasılığı, FFT veya kalite skoru hesaplamaz. SSIM / PSNR: Unsupported. Ham kodlanmış kanal değerleri incelenir; ICC renk dönüşümü ve EXIF yön düzeltmesi uygulanmaz. Alfa varsa ayrı kanal olarak gösterilir, kompozit yapılmaz."

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.result = None
        layout = QVBoxLayout(self)
        self.summary = QLabel("Piksel istatistikleri için önce bir görselin meta verilerini tarayın.")
        self.summary.setWordWrap(True)
        self.summary.setTextFormat(Qt.TextFormat.PlainText)
        self.summary.setMinimumHeight(self.summary.fontMetrics().lineSpacing() * 3)
        layout.addWidget(self.summary)
        actions = QHBoxLayout()
        self.start_button = QPushButton("Piksel Analizini Başlat")
        self.export_button = QPushButton("Analiz Raporunu Dışa Aktar")
        self.channel = QComboBox()
        self.channel.addItems(["RGB", "R", "G", "B", "Luma", "L", "A"])
        self.channel.currentTextChanged.connect(self._channel_changed)
        actions.addWidget(self.start_button)
        actions.addWidget(self.export_button)
        actions.addStretch()
        actions.addWidget(self.channel)
        layout.addLayout(actions)
        self.progress = QProgressBar()
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        layout.addWidget(self.progress)
        self.histogram = HistogramWidget()
        layout.addWidget(self.histogram, 1)
        self.statistics = QTableWidget(0, 7)
        self.statistics.setHorizontalHeaderLabels(["Kanal", "Örnek", "Min", "Maks", "Ortalama", "Std. sapma", "Toplam"])
        self.statistics.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.statistics.horizontalHeader().setStretchLastSection(True)
        layout.addWidget(self.statistics)
        self.details = QPlainTextEdit()
        self.details.setReadOnly(True)
        self.details.setMaximumHeight(180)
        layout.addWidget(self.details)
        self.clear()

    def _channel_changed(self, text: str) -> None:
        self.histogram.channels = ("R", "G", "B") if text == "RGB" else (text,)
        self.histogram.update()

    def clear(self, message: str = "Analiz bekleniyor.") -> None:
        self.result = None
        self.summary.setText(message)
        self.statistics.setRowCount(0)
        self.histogram.set_data({})
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        self.progress.setFormat("%p%")
        self.details.setPlainText(self.INTERPRETATION)
        self.export_button.setEnabled(False)

    def set_progress(self, processed: int, total: int) -> None:
        if total > 0 and 0 <= processed <= total:
            # The final source hash check still runs after the last tile.
            self.progress.setRange(0, total + 1)
            self.progress.setValue(processed)
            self.progress.setFormat(f"%p% · Karo {processed}/{total}" + (" · Kaynak doğrulanıyor…" if processed == total else ""))

    def show_result(self, result) -> None:
        self.result = result
        if result.status == "Unsupported":
            self.summary.setText(f"Unsupported · {result.source_identity.format} · {result.width} × {result.height} · {result.mode}\nBu kaynak için piksel analizi üretilmedi.")
        else:
            self.summary.setText(f"{result.status} · {result.source_identity.format} · {result.width} × {result.height} · {result.pixel_count:,} piksel · {result.mode} · {len(result.channel_statistics)} kanal\nTam çözünürlük (1:1), karolu toplama · {result.tiles_processed} karo · {result.elapsed_seconds:.3f} s · Kaynak kimliği doğrulandı")
        channels = dict(result.channel_statistics)
        if result.luminance is not None:
            channels["Luma"] = result.luminance
        self.statistics.setRowCount(len(channels))
        for row, (name, stats) in enumerate(channels.items()):
            values = [name, stats.count, stats.minimum, stats.maximum, f"{stats.mean:.6f}", f"{stats.standard_deviation:.6f}", stats.sum]
            for column, value in enumerate(values):
                self.statistics.setItem(row, column, QTableWidgetItem(str(value)))
        self.histogram.set_data({name: stats.histogram for name, stats in channels.items()})
        selection = self.channel.currentText()
        if selection == "RGB":
            available = all(name in channels for name in ("R", "G", "B"))
        else:
            available = selection in channels
        if not available and channels:
            self.channel.setCurrentText("RGB" if "R" in channels else next(iter(channels)))
        self.progress.setRange(0, max(1, result.tiles_processed))
        self.progress.setValue(result.tiles_processed if result.status == "Complete" else 0)
        self.progress.setFormat("%p% · Doğrulandı" if result.status == "Complete" else "Analiz uygulanmadı")
        peak = "Ölçülmedi" if result.measured_peak_memory is None else str(result.measured_peak_memory)
        details = [self.INTERPRETATION, f"Karo: {result.tile_size}; halo: {result.halo}", f"Tahmini tepe bellek: {result.estimated_peak_memory:,} bayt; ölçülen: {peak}", "Uyarılar:"]
        details.extend(result.warnings or ("Yok",))
        if result.unsupported_reason:
            details.append(result.unsupported_reason)
        self.details.setPlainText("\n".join(details))
        self.export_button.setEnabled(True)
