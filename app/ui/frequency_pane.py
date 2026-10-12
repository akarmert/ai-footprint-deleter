from __future__ import annotations

import math
from collections.abc import Mapping

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QImage, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QCheckBox, QComboBox, QDoubleSpinBox, QFormLayout, QGridLayout,
    QHBoxLayout, QLabel, QPlainTextEdit, QProgressBar, QPushButton,
    QScrollArea, QHeaderView, QTableWidget, QTableWidgetItem, QTabWidget, QVBoxLayout, QWidget,
)


def _get(value, key, default=None):
    return value.get(key, default) if isinstance(value, Mapping) else getattr(value, key, default)


def _number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _matrix_shape(values):
    try:
        height = len(values)
        width = len(values[0]) if height else 0
        return height, width
    except (TypeError, IndexError):
        return 0, 0


class FrequencyHeatmap(QWidget):
    def __init__(self, title, horizontal, vertical, parent=None):
        super().__init__(parent)
        self.title = title
        self.horizontal = horizontal
        self.vertical = vertical
        self.image = QImage()
        self.minimum = 0.0
        self.maximum = 1.0
        self.setMinimumHeight(205)
        self.setAccessibleName(title)

    def clear(self):
        self.image = QImage()
        self.update()

    def set_data(self, values, minimum=None, maximum=None, normalized=False):
        height, width = _matrix_shape(values)
        if not height or not width or height > 256 or width > 256:
            self.clear()
            return
        finite = [] if minimum is None or maximum is None else None
        if finite is not None:
            for row in values:
                if len(row) != width:
                    self.clear()
                    return
                for value in row:
                    number = _number(value)
                    if number is not None:
                        finite.append(number)
            minimum = min(finite, default=0.0)
            maximum = max(finite, default=1.0)
        self.minimum = _number(minimum)
        self.maximum = _number(maximum)
        if self.minimum is None or self.maximum is None or self.maximum < self.minimum:
            self.clear()
            return
        low, high = (0.0, 1.0) if normalized else (self.minimum, self.maximum)
        span = high - low
        image = QImage(width, height, QImage.Format.Format_RGB32)
        colors = [QColor(12 + index * 28 // 255, 22 + index * 164 // 255, 38 + index * 217 // 255).rgb() for index in range(256)]
        for y, row in enumerate(values):
            if len(row) != width:
                self.clear()
                return
            for x, value in enumerate(row):
                number = _number(value)
                level = 0 if number is None or span <= 0 else round(255 * min(1.0, max(0.0, (number - low) / span)))
                image.setPixel(x, y, colors[level])
        self.image = image
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), self.palette().base())
        painter.setPen(self.palette().text().color())
        painter.drawText(12, 20, self.title)
        plot = QRectF(55, 34, max(1, self.width() - 150), max(1, self.height() - 82))
        if self.image.isNull():
            painter.drawText(plot, Qt.AlignmentFlag.AlignCenter, "Veri bekleniyor")
            return
        painter.drawImage(plot, self.image)
        painter.setPen(self.palette().mid().color())
        painter.drawRect(plot)
        painter.setPen(self.palette().text().color())
        painter.drawText(QRectF(plot.left(), plot.bottom() + 6, plot.width(), 36), Qt.AlignmentFlag.AlignCenter, self.horizontal)
        painter.save()
        painter.translate(15, plot.center().y())
        painter.rotate(-90)
        painter.drawText(QRectF(-plot.height() / 2, 0, plot.height(), 30), Qt.AlignmentFlag.AlignCenter, self.vertical)
        painter.restore()
        legend = QRectF(plot.right() + 12, plot.top(), 12, plot.height())
        for index in range(256):
            painter.fillRect(QRectF(legend.left(), legend.bottom() - (index + 1) * legend.height() / 256, 12, legend.height() / 256 + 1), QColor(12 + index * 28 // 255, 22 + index * 164 // 255, 38 + index * 217 // 255))
        painter.drawText(QPointF(legend.right() + 5, legend.top() + 12), f"{self.maximum:.4g}")
        painter.drawText(QPointF(legend.right() + 5, legend.bottom()), f"{self.minimum:.4g}")


class RadialPlot(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.points = []
        self.counts = ()
        self.setMinimumHeight(230)
        self.setAccessibleName("Radyal frekans: halka başına ortalama güç")

    def set_data(self, frequency=(), mean=(), counts=()):
        self.points = []
        for x, y in zip(frequency, mean):
            x, y = _number(x), _number(y)
            if x is not None and y is not None:
                self.points.append((x, y))
            if len(self.points) >= 1024:
                break
        self.counts = counts
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.fillRect(self.rect(), self.palette().base())
        painter.setPen(self.palette().text().color())
        plot = QRectF(78, 35, max(1, self.width() - 110), max(1, self.height() - 100))
        painter.drawText(12, 20, "Radyal profil · halka başına ortalama güç (enerji toplamı değil)")
        painter.setPen(self.palette().mid().color())
        painter.drawRect(plot)
        painter.setPen(self.palette().text().color())
        if not self.points:
            painter.drawText(plot, Qt.AlignmentFlag.AlignCenter, "Veri bekleniyor")
            return
        xmin = min(x for x, _ in self.points)
        xmax = max(x for x, _ in self.points)
        ymin = min(0.0, min(y for _, y in self.points))
        ymax = max(y for _, y in self.points)
        path = QPainterPath()
        for index, (x, y) in enumerate(self.points):
            point = QPointF(plot.left() + (x - xmin) * plot.width() / (xmax - xmin or 1), plot.bottom() - (y - ymin) * plot.height() / (ymax - ymin or 1))
            path.moveTo(point) if index == 0 else path.lineTo(point)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(QPen(QColor("#69b8ef"), 2))
        painter.drawPath(path)
        painter.setPen(self.palette().text().color())
        painter.drawText(QPointF(8, plot.top() + 12), f"{ymax:.4g}")
        painter.drawText(QPointF(8, plot.bottom()), f"{ymin:.4g}")
        painter.drawText(QPointF(plot.left(), plot.bottom() + 18), f"{xmin:.4g}")
        painter.drawText(QPointF(plot.right() - 40, plot.bottom() + 18), f"{xmax:.4g}")
        painter.drawText(QRectF(plot.left(), plot.bottom() + 22, plot.width(), 24), Qt.AlignmentFlag.AlignCenter, "Frekans (cycles/pixel)")


class FrequencyPane(QWidget):
    analyze_requested = Signal(dict)
    display_requested = Signal(dict)
    cancel_requested = Signal()
    INTERPRETATION = (
        "Pencereleme spektral sızıntıyı azaltır; AI kanıtı değildir. Bu gözlemler AI olasılığı veya kalite skoru değildir.\n"
        "FFT: karolu, güç-normalize edilmiş frekans gözlemleri; pencere kazancı ve ortalama çıkarma ayarı raporlanır. "
        "Alfa kompozit yapılmadan, ICC dönüşümü uygulanmadan çözümlenmiş Y/Cb/Cr örnekleri incelenir. "
        "Kroma, kodlanmış dosyanın yerel alt örnekleme düzlemi değildir.\n"
        "DCT: 8 × 8 çözümlenmiş piksel blokları; JPEG yerel katsayıları veya global DCT değildir."
    )

    def __init__(self, parent=None):
        super().__init__(parent)
        self.result = None
        self.state = "empty"
        self._busy = False
        self._stale = False
        outer = QVBoxLayout(self)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        outer.addWidget(scroll)
        content = QWidget()
        scroll.setWidget(content)
        layout = QVBoxLayout(content)
        self.summary = QLabel()
        self.summary.setWordWrap(True)
        self.summary.setTextFormat(Qt.TextFormat.PlainText)
        layout.addWidget(self.summary)
        analysis = QHBoxLayout()
        self.window = QComboBox()
        self.window.addItem("Hann", "hann")
        self.window.addItem("Dikdörtgen", "none")
        self.window.addItem("Hamming", "hamming")
        self.window.addItem("Blackman", "blackman")
        self.window.setToolTip("Pencereleme spektral sızıntıyı azaltır; AI kanıtı değildir.")
        self.tile_size = QComboBox()
        self.tile_size.addItems(["256", "512", "1024"])
        self.remove_mean = QCheckBox("Karo ortalamasını çıkar")
        self.remove_mean.setChecked(True)
        for title, control in (("Pencere", self.window), ("Karo", self.tile_size)):
            group = QVBoxLayout()
            group.addWidget(QLabel(title))
            group.addWidget(control)
            analysis.addLayout(group)
        analysis.addWidget(self.remove_mean)
        analysis.addStretch()
        layout.addLayout(analysis)
        actions = QHBoxLayout()
        self.start_button = QPushButton("Frekans Analizini Başlat")
        self.cancel_button = QPushButton("İptal")
        self.start_button.clicked.connect(self._analyze)
        self.cancel_button.clicked.connect(self.cancel_requested.emit)
        actions.addWidget(self.start_button)
        actions.addWidget(self.cancel_button)
        actions.addStretch()
        layout.addLayout(actions)
        self.progress = QProgressBar()
        layout.addWidget(self.progress)
        display = QGridLayout()
        self.channel = QComboBox()
        self.channel.addItems(["Y", "Cb", "Cr"])
        self.mode = QComboBox()
        self.mode.addItem("Güç", "power")
        self.mode.addItem("Genlik", "magnitude")
        self.log = QCheckBox("Log ölçek")
        self.log.setChecked(True)
        self.suppress_dc = QCheckBox("DC gizle (yalnız görünüm)")
        self.suppress_dc.setChecked(True)
        self.suppress_dc.setToolTip('512/1024 karolarda DC içeren havuzlanmış hücre ve içindeki komşu frekanslar yalnız görünümden kaldırılır; ham analiz değişmez.')
        self.percentile_low = self._spin(0, 100, 1)
        self.percentile_high = self._spin(0, 100, 99.5)
        self.scale_mode = QComboBox()
        self.scale_mode.addItem("Otomatik yüzdelik", "auto")
        self.scale_mode.addItem("Sabit aralık (karşılaştırma)", "manual")
        self.minimum = self._spin(0, 1e30, 0)
        self.maximum = self._spin(0, 1e30, 1)
        self.minimum.setToolTip("Görüntü birimleri: log açıkken log1p, aksi halde ham güç/genlik.")
        for column, (title, control) in enumerate((("Kanal", self.channel), ("FFT görünümü", self.mode), ("Ölçek", self.scale_mode))):
            group = QVBoxLayout()
            group.addWidget(QLabel(title))
            group.addWidget(control)
            display.addLayout(group, 0, column)
        display.addWidget(self.log, 1, 0)
        display.addWidget(self.suppress_dc, 1, 1, 1, 2)
        for column, (title, control) in enumerate((("Alt yüzdelik", self.percentile_low), ("Üst yüzdelik", self.percentile_high), ("Min", self.minimum), ("Maks", self.maximum))):
            group = QVBoxLayout()
            group.addWidget(QLabel(title))
            group.addWidget(control)
            display.addLayout(group, 2 + column // 2, column % 2)
        self.display_button = QPushButton("Görünümü Uygula")
        self.display_button.clicked.connect(self._request_display)
        display.addWidget(self.display_button, 4, 0, 1, 3)
        layout.addLayout(display)
        self.display_notice = QLabel()
        self.display_notice.setWordWrap(True)
        self.display_notice.setTextFormat(Qt.TextFormat.PlainText)
        layout.addWidget(self.display_notice)
        self.tabs = QTabWidget()
        self.fft = FrequencyHeatmap("Merkezlenmiş FFT · güç", "fx: −0.5 → 0 → +0.5 cycles/pixel", "fy: −0.5 → +0.5 cycles/pixel")
        self.tabs.addTab(self.fft, "FFT")
        dct = QWidget()
        dct_layout = QVBoxLayout(dct)
        self.dct_energy = FrequencyHeatmap("8 × 8 DCT · ortalama katsayı enerjisi", "Yatay katsayı: 0 → 7", "Dikey katsayı: 0 → 7")
        self.dct_region = FrequencyHeatmap("Bölgesel DCT enerji haritası", "Görsel x: sol → sağ", "Görsel y: üst → alt")
        dct_layout.addWidget(self.dct_energy)
        dct_layout.addWidget(self.dct_region)
        self.tabs.addTab(dct, "DCT")
        self.radial = RadialPlot()
        self.tabs.addTab(self.radial, "Radyal")
        layout.addWidget(self.tabs)
        self.features = QTableWidget(0, 2)
        self.features.setHorizontalHeaderLabels(["Sayısal gözlem", "Değer"])
        self.features.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.features.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.features.setMaximumHeight(210)
        layout.addWidget(self.features)
        self.details = QPlainTextEdit()
        self.details.setReadOnly(True)
        self.details.setMaximumHeight(150)
        layout.addWidget(self.details)
        for control in (self.window, self.tile_size):
            control.currentIndexChanged.connect(self._analysis_changed)
        self.remove_mean.toggled.connect(self._analysis_changed)
        self.channel.currentIndexChanged.connect(self._channel_changed)
        for control in (self.mode, self.scale_mode):
            control.currentIndexChanged.connect(self._display_changed)
        for control in (self.log, self.suppress_dc):
            control.toggled.connect(self._display_changed)
        for control in (self.percentile_low, self.percentile_high, self.minimum, self.maximum):
            control.valueChanged.connect(self._display_changed)
        for combo in (self.window, self.tile_size, self.channel, self.mode, self.scale_mode):
            combo.setMinimumWidth(60)
            combo.setMaximumWidth(180)
            combo.setSizeAdjustPolicy(QComboBox.SizeAdjustPolicy.AdjustToMinimumContentsLengthWithIcon)
            combo.setMinimumContentsLength(5)
        self.remove_mean.setText('Ortalama çıkar')
        self.suppress_dc.setText('DC hücresini gizle')
        self.minimum.setMaximumWidth(150)
        self.maximum.setMaximumWidth(150)
        self.percentile_low.setMaximumWidth(150)
        self.percentile_high.setMaximumWidth(150)
        self.display_button.setText('Görünümü Uygula')
        self.clear()

    @staticmethod
    def _spin(low, high, value):
        control = QDoubleSpinBox()
        control.setRange(low, high)
        control.setDecimals(5)
        control.setValue(value)
        return control

    def options(self):
        return self.analysis_options()

    def analysis_options(self):
        return {"window": self.window.currentData(), "tile_size": int(self.tile_size.currentText()), "subtract_mean": self.remove_mean.isChecked()}

    def display_options(self):
        return {
            "channel": self.channel.currentText(), "mode": self.mode.currentData(),
            "log": self.log.isChecked(), "suppress_dc": self.suppress_dc.isChecked(),
            "percentile_low": self.percentile_low.value(), "percentile_high": self.percentile_high.value(),
            "scale_mode": self.scale_mode.currentData(), "minimum": self.minimum.value(), "maximum": self.maximum.value(),
        }

    def _analyze(self):
        if not self._busy:
            self.analyze_requested.emit(self.analysis_options())

    def _analysis_changed(self, *args):
        if self.result is not None:
            self._stale = True
            self.display_notice.setText("Analiz ayarları değişti: yeniden analiz gerekli. Eski sonuç yeni ayarları temsil etmez.")
            self._clear_plots()
        self._sync_controls()

    def _display_changed(self, *args):
        self._sync_controls()
        if self.result is not None and not self._stale:
            self.fft.clear()
            self.display_notice.setText("FFT görünüm ayarları değişti; sınırlı önizlemeyi yenilemek için Görünümü Uygula'yı seçin.")

    def _channel_changed(self, *args):
        if self.result is not None and not self._stale:
            self._show_channel()
            self._request_display()

    def _valid_display(self):
        options = self.display_options()
        return options["minimum"] < options["maximum"] if options["scale_mode"] == "manual" else options["percentile_low"] < options["percentile_high"]

    def _sync_controls(self):
        manual = self.scale_mode.currentData() == "manual"
        for control in (self.minimum, self.maximum):
            control.setEnabled(manual and not self._busy)
        for control in (self.percentile_low, self.percentile_high):
            control.setEnabled(not manual and not self._busy)
        for control in (self.window, self.tile_size, self.remove_mean, self.channel, self.mode, self.log, self.suppress_dc, self.scale_mode):
            control.setEnabled(not self._busy)
        self.start_button.setEnabled(not self._busy)
        self.cancel_button.setEnabled(self._busy)
        self.display_button.setEnabled(self.result is not None and not self._busy and not self._stale and self._valid_display())

    def _request_display(self):
        if self.result is not None and not self._busy and not self._stale and self._valid_display():
            from modules.analysis.spectrum_visualization import display_spectrum

            options = self.display_options()
            channel = _get(self.result, "channels", {}).get(options["channel"], {})
            raw = _get(channel, options["mode"] + "_preview", ())
            height, width = _matrix_shape(raw)
            if not height or not width or height > 256 or width > 256:
                self.fft.clear()
                self.display_notice.setText("FFT önizlemesi yok veya 256 × 256 sınırını aşıyor.")
                return
            try:
                payload = display_spectrum(
                    raw, log=options["log"], lower=1 if options["scale_mode"] == "manual" else options["percentile_low"],
                    upper=99.5 if options["scale_mode"] == "manual" else options["percentile_high"], exclude_dc=options["suppress_dc"],
                    manual_range=(options["minimum"], options["maximum"]) if options["scale_mode"] == "manual" else None,
                )
            except (ValueError, TypeError) as error:
                self.fft.clear()
                self.display_notice.setText(f"FFT görünümü kullanılamıyor: {error}")
                return
            self.show_display(payload)
            self.display_requested.emit(options)

    def _clear_plots(self):
        self.fft.clear()
        self.dct_energy.clear()
        self.dct_region.clear()
        self.radial.set_data()
        self.features.setRowCount(0)

    def clear(self, message="Frekans analizi bekleniyor."):
        self.result = None
        self._busy = False
        self._stale = False
        self.state = "empty"
        self.summary.setText(message)
        self.display_notice.clear()
        self._clear_plots()
        self.details.setPlainText(self.INTERPRETATION)
        self.progress.setRange(0, 1)
        self.progress.setValue(0)
        self.progress.setFormat("%p%")
        self._sync_controls()

    def set_state(self, state, text=""):
        if state in ("empty", "error", "cancelled", "source_changed", "unsupported"):
            self.clear(text or state)
        elif state in ("loading", "running", "analyzing", "verifying"):
            self.clear(text or "Frekans analizi çalışıyor…")
            self._busy = True
        else:
            self.summary.setText(text or state)
            self._busy = False
        self.state = state
        self._sync_controls()

    def set_progress(self, done, total):
        if total > 0 and 0 <= done <= total:
            self.progress.setRange(0, total + 1)
            self.progress.setValue(done)
            self.progress.setFormat(f"%p% · Karo {done}/{total}" + (" · Kaynak doğrulanıyor…" if done == total else ""))

    def show_result(self, result):
        self.result = result
        self._busy = False
        self._stale = False
        status = str(_get(result, "status", "Unknown"))
        self.state = status.lower()
        complete = status.lower() in ("complete", "completed")
        status_label = {'Completed': 'Tamamlandı', 'Unsupported': 'Desteklenmiyor', 'Failed': 'Başarısız', 'Cancelled': 'İptal edildi'}.get(status, status)
        self.summary.setText(f"{status_label} · {_get(result, 'tiles_processed', 0)} / {_get(result, 'total_tiles', _get(result, 'tiles_total', 0))} karo · {_get(result, 'elapsed_seconds', 0):.3f} s")
        self.progress.setRange(0, 1)
        self.progress.setValue(1 if complete else 0)
        self.progress.setFormat("100% · Doğrulandı" if complete else status)
        config = _get(result, "options", {})
        for control in (self.window, self.tile_size, self.remove_mean):
            control.blockSignals(True)
        index = self.window.findData(_get(config, "window", "hann"))
        if index >= 0:
            self.window.setCurrentIndex(index)
        self.tile_size.setCurrentText(str(_get(config, "tile_size", 256)))
        self.remove_mean.setChecked(bool(_get(config, "subtract_mean", True)))
        for control in (self.window, self.tile_size, self.remove_mean):
            control.blockSignals(False)
        channels = _get(result, "channels", {})
        self.channel.blockSignals(True)
        for index in range(self.channel.count()):
            item = self.channel.model().item(index)
            item.setEnabled(self.channel.itemText(index) in channels)
        if self.channel.currentText() not in channels and channels:
            self.channel.setCurrentText(next(iter(channels)))
        self.channel.blockSignals(False)
        info = [self.INTERPRETATION, f"Analiz ayarları: {_get(result, 'options', {})}", f"Tahmini bellek: {_get(result, 'memory_estimate', 'Ölçülmedi')}", f"Zamanlamalar: {_get(result, 'timings', {})}", "Uyarılar:"]
        info.extend(str(warning) for warning in _get(result, "warnings", ()) or ("Yok",))
        self.details.setPlainText("\n".join(info))
        self._clear_plots()
        self._sync_controls()
        if complete and channels:
            self._show_channel()
            self._request_display()
        else:
            self.result = None
            self._sync_controls()

    METRIC_LABELS = {
        'total_energy': 'Toplam enerji', 'low_energy': 'Düşük frekans enerjisi',
        'mid_energy': 'Orta frekans enerjisi', 'high_energy': 'Yüksek frekans enerjisi',
        'low_ratio': 'Düşük frekans oranı', 'mid_ratio': 'Orta frekans oranı',
        'high_ratio': 'Yüksek frekans oranı', 'dc_energy': 'DC enerjisi',
        'ac_energy': 'AC enerjisi', 'dct_low_energy': 'DCT düşük frekans enerjisi',
        'dct_mid_energy': 'DCT orta frekans enerjisi', 'dct_high_energy': 'DCT yüksek frekans enerjisi',
        'local_ac_energy_std': 'Bölgesel AC enerji standart sapması',
        'dct_blocks': 'DCT blok sayısı', 'padded_blocks': 'Kenar dolgulu blok sayısı',
        'window_coherent_gain': 'Pencere tutarlı kazancı', 'window_energy': 'Pencere enerjisi',
        'dc_ac_ratio': 'DC / AC oranı', 'spectral_density': 'Spektral yoğunluk',
    }

    def _show_channel(self):
        channel = _get(self.result, "channels", {}).get(self.channel.currentText(), {})
        self.fft.clear()
        self.dct_energy.set_data(_get(channel, "dct_energy", ()))
        self.dct_region.set_data(_get(channel, "dct_region_map", ()))
        self.radial.set_data(_get(channel, "radial_frequency", ()), _get(channel, "radial_mean", ()), _get(channel, "radial_counts", ()))
        features = dict(_get(channel, "features", {}))
        for key in ("dc_energy", "ac_energy", "dct_low_energy", "dct_mid_energy", "dct_high_energy", "local_ac_energy_std", "dct_blocks", "padded_blocks", "window_coherent_gain", "window_energy"):
            value = _get(channel, key)
            if value is not None:
                features[key] = value
        entries = [(str(name), number) for name, value in features.items() if (number := _number(value)) is not None]
        self.details.setPlainText('\n'.join([self.INTERPRETATION, f"Analiz ayarları: {_get(self.result, 'options', {})}", f"Tahmini bellek: {_get(self.result, 'memory_estimate', 'Ölçülmedi')}", f"Zamanlamalar: {_get(self.result, 'timings', {})}", *map(str, _get(self.result, 'warnings', ()))]))
        for key in ('normalization', 'frequency_unit', 'padding', 'fft_dtype', 'radial_domain'):
            if _get(channel, key) is not None:
                self.details.appendPlainText(f'{key}: {_get(channel, key)}')
        self.features.setRowCount(len(entries))
        for row, (name, value) in enumerate(entries):
            self.features.setItem(row, 0, QTableWidgetItem(self.METRIC_LABELS.get(name, name)))
            self.features.setItem(row, 1, QTableWidgetItem(f"{value:.8g}"))

    def show_display(self, payload):
        if self.result is None or self._stale or self._busy:
            return
        self.fft.title = f"Merkezlenmiş FFT · {'güç' if self.mode.currentData() == 'power' else 'genlik'}" + (" · log" if self.log.isChecked() else " · doğrusal")
        self.fft.set_data(_get(payload, "image", ()), 0, 255)
        self.fft.minimum = _number(_get(payload, "lower", _get(payload, "minimum", 0))) or 0.0
        upper = _number(_get(payload, "upper", _get(payload, "maximum", 1)))
        self.fft.maximum = upper if upper is not None else 1.0
        self.display_notice.setText("FFT görünümü güncel. Sabit aralık aynı ölçekle karşılaştırma içindir." if not self.fft.image.isNull() else "FFT görünüm verisi kullanılamıyor.")
