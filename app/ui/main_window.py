from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from PySide6.QtCore import Qt, QThreadPool, QTimer, Slot
from PySide6.QtGui import QAction, QCloseEvent, QKeySequence
from PySide6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QFileDialog, QFormLayout, QFrame,
    QGroupBox, QHBoxLayout, QHeaderView, QLabel, QListWidget, QMainWindow,
    QMessageBox, QPlainTextEdit, QProgressBar, QPushButton, QSplitter,
    QStackedWidget, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget, QSizePolicy, QTabWidget,
)

from app.ui.image_preview import ImagePreview
from app.ui.analysis_pane import AnalysisPane
from app.ui.metadata_overview import MetadataOverview
from app.services.dashboard_scan import DashboardScan, scan_dashboard
from modules.analysis import AnalysisEngine
from modules.analysis.frequency_engine import FrequencyEngine, FrequencyOptions
from app.ui.frequency_pane import FrequencyPane
from app.workers.workflow_task import WorkflowTask
from app.services.temp_registry import stale_temp_candidates
from modules.reporting.exporter import export_report as write_report, report_dict



class MainWindow(QMainWindow):
    def __init__(self, workflow=None) -> None:
        super().__init__()
        if workflow is None:
            from app.services.workflow import Workflow
            workflow = Workflow()
        self.workflow = workflow
        self.scan_result: Any = None
        self.process_result: Any = None
        self.analysis_result: Any = None
        self.analysis_engine = AnalysisEngine()
        self.frequency_result = None
        self._generation = 0
        self._task_generations: dict[str, int] = {}
        self._pending_path: str | None = None
        self._reports: list[tuple[str, Any]] = []
        self._tasks: dict[str, WorkflowTask] = {}
        self._task_kinds: dict[str, str] = {}
        self._closing = False
        self._pool = QThreadPool(self)
        self._pool.setMaxThreadCount(1)
        self.setWindowTitle("AI Footprint Cleaner · Görsel Gizliliği")
        self.resize(1360, 900)
        self.setMinimumSize(980, 700)
        self.setAcceptDrops(True)
        self._build_ui()
        self._load_theme()
        self._update_actions()
        QTimer.singleShot(0, self._check_stale_temp)

    def _check_stale_temp(self) -> None:
        try:
            candidates = stale_temp_candidates()
        except OSError:
            self.temp_warning.setText("Geçici dosya kayıtları kontrol edilemedi; otomatik silme yapılmadı.")
            return
        if candidates:
            message = f"Önceki oturumdan {len(candidates)} olası geçici dosya kaydı bulundu. Otomatik silinmedi; yerel geçici dosyaları elle inceleyin."
            self.temp_warning.setText(message + '\nSahiplik doğrulanmış değildir. Aday yolları yerel AI-Footprint-Cleaner/temp-journal kayıtlarından manuel inceleyin; hassas yollar ekranda gösterilmez.')
            self.statusBar().showMessage(message)

    def _load_theme(self) -> None:
        theme = Path(__file__).resolve().parents[2] / "assets" / "themes" / "dark.qss"
        try:
            self.setStyleSheet(theme.read_text(encoding="utf-8"))
        except OSError:
            self.statusBar().showMessage("Tema dosyası okunamadı; sistem görünümü kullanılıyor.")

    @staticmethod
    def _label(text: str, name: str = "") -> QLabel:
        label = QLabel(text)
        label.setTextFormat(Qt.TextFormat.PlainText)
        label.setWordWrap(True)
        if name:
            label.setObjectName(name)
        return label

    def _page(self, title: str, subtitle: str) -> tuple[QWidget, QVBoxLayout]:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 22, 28, 22)
        layout.setSpacing(16)
        layout.addWidget(self._label(title, "pageTitle"))
        layout.addWidget(self._label(subtitle, "muted"))
        self.pages.addWidget(page)
        return page, layout

    def _build_ui(self) -> None:
        root = QWidget()
        self.setCentralWidget(root)
        layout = QHBoxLayout(root)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(230)
        side = QVBoxLayout(sidebar)
        side.setContentsMargins(18, 26, 18, 20)
        side.addWidget(self._label("AI FOOTPRINT\nCLEANER", "brand"))
        side.addWidget(self._label("Görsel gizliliği çalışma alanı", "muted"))
        self.navigation = QListWidget()
        self.navigation.setObjectName("navigation")
        self.navigation.addItems([
            "Genel Bakış", "Görsel Analizi", "Meta Veri Temizliği", "AI İz Analizi",
            "Görsel İşleme", "Toplu İşleme", "Raporlar", "Ayarlar",
        ])
        self.navigation.currentRowChanged.connect(self._navigate)
        side.addWidget(self.navigation, 1)
        side.addWidget(self._label("FAZ 2B · YEREL ANALİZ", "badge"))
        side.addWidget(self._label("Meta veri temizliği, görünür filigranları veya görsel içeriğini kaldırmaz.", "muted"))
        layout.addWidget(sidebar)
        body = QWidget()
        body_layout = QVBoxLayout(body)
        body_layout.setContentsMargins(0, 0, 0, 0)
        header = QFrame()
        header.setObjectName("toolbar")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(28, 16, 28, 16)
        self.path_label = self._label("Bir görsel açın veya pencereye bırakın", "muted")
        self.path_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        self.path_label.setMinimumWidth(0)
        self.path_label.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        header_layout.addWidget(self.path_label, 1)
        self.open_button = QPushButton("Görsel Aç")
        self.open_button.setObjectName("primary")
        self.open_button.clicked.connect(self.open_image)
        header_layout.addWidget(self.open_button)
        self.cancel_button = QPushButton("İşlemi İptal Et")
        self.cancel_button.clicked.connect(self.cancel_operation)
        header_layout.addWidget(self.cancel_button)
        body_layout.addWidget(header)
        self.pages = QStackedWidget()
        body_layout.addWidget(self.pages, 1)
        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setTextVisible(False)
        self.progress.setFixedHeight(3)
        self.progress.hide()
        body_layout.addWidget(self.progress)
        layout.addWidget(body, 1)
        self._build_dashboard()
        self._build_analyzer()
        self._build_cleaner()
        _, analysis_layout = self._page("AI İz Analizi · Piksel İstatistikleri", "Gerçek kanal istatistikleri ve histogramlar; yapay zekâ üretimi tespiti değildir.")
        self.analysis_pane = AnalysisPane()
        self.analysis_pane.start_button.clicked.connect(self.analyze_image)
        self.analysis_pane.export_button.clicked.connect(self.export_analysis)
        self.analysis_tabs = QTabWidget()
        self.analysis_tabs.addTab(self.analysis_pane, 'Piksel ve Histogram')
        self.frequency_pane = FrequencyPane()
        self.frequency_pane.analyze_requested.connect(self.start_frequency)
        self.frequency_pane.cancel_requested.connect(self.cancel_operation)
        self.analysis_tabs.addTab(self.frequency_pane, 'FFT / DCT / Radyal')
        analysis_layout.addWidget(self.analysis_tabs)
        self._build_future("Görsel İşleme", "Yeniden boyutlandırma, biçim dönüşümü ve piksel düzenleme bu sürümde desteklenmiyor. Meta veri temizliği görsel içeriğini ya da görünür filigranları kaldırmaz.")
        self._build_future("Toplu İşleme", "Faz 1 yalnız tek görsel üzerinde çalışır. Kuyruk, klasör taraması ve toplu çıktı üretimi henüz desteklenmiyor.")
        self._build_reports()
        self._build_settings()
        self.navigation.setCurrentRow(0)
        action = QAction("Görsel Aç", self)
        action.setShortcut(QKeySequence.StandardKey.Open)
        action.triggered.connect(self.open_image)
        self.addAction(action)
        self.statusBar().showMessage("Hazır · Orijinal dosya üzerine yazılmaz")

    def _build_dashboard(self) -> None:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 16, 24, 16)
        self.pages.addWidget(page)
        self.dashboard_summary = self._label("Henüz analiz yapılmadı.", "summary")
        self.dashboard_summary.hide()
        self.metadata_overview = MetadataOverview()
        self.metadata_overview.open_requested.connect(self.open_image)
        self.metadata_overview.navigate_requested.connect(self.navigation.setCurrentRow)
        layout.addWidget(self.metadata_overview, 1)

    def _build_analyzer(self) -> None:
        _, layout = self._page("Meta Veri Analizi", "Her satır bir gerçek alanı temsil eder. İşaretli ve kaldırılabilir alanlar Özel profilinde kullanılır.")
        self.scan_summary = self._label("Henüz görsel seçilmedi.", "summary")
        self.scan_summary.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(self.scan_summary)
        split = QSplitter(Qt.Orientation.Horizontal)
        self.analysis_preview = ImagePreview()
        split.addWidget(self.analysis_preview)
        self.metadata = QTableWidget(0, 6)
        self.metadata.setHorizontalHeaderLabels(["Seç", "Anahtar", "Değer", "Standart", "Etki", "Kategori"])
        self.metadata.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.metadata.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.metadata.setAlternatingRowColors(True)
        self.metadata.verticalHeader().hide()
        self.metadata.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Interactive)
        self.metadata.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.metadata.setColumnWidth(0, 48)
        self.metadata.setColumnWidth(1, 160)
        self.metadata.itemChanged.connect(self._update_actions)
        split.addWidget(self.metadata)
        split.setSizes([350, 650])
        layout.addWidget(split, 1)
        self.analysis_details = QPlainTextEdit()
        self.analysis_details.setReadOnly(True)
        self.analysis_details.setMaximumHeight(155)
        self.analysis_details.setPlaceholderText("C2PA bilgisi ve analiz uyarıları burada gösterilir.")
        layout.addWidget(self.analysis_details)
        footer = QHBoxLayout()
        self.scan_export = QPushButton("Analizi JSON Olarak Dışa Aktar")
        self.scan_export.clicked.connect(self.export_scan)
        footer.addWidget(self.scan_export)
        next_button = QPushButton("Temizleme Seçeneklerine Git")
        next_button.clicked.connect(lambda: self.navigation.setCurrentRow(2))
        footer.addWidget(next_button)
        footer.addStretch()
        layout.addLayout(footer)

    def _build_cleaner(self) -> None:
        _, layout = self._page("Gizlilik Temizliği", "Orijinal korunur. Çıktı için farklı bir dosya seçilir; sonuçlar çekirdeğin raporuyla gösterilir.")
        options = QHBoxLayout()
        profile_box = QGroupBox("Temizleme kapsamı")
        form = QFormLayout(profile_box)
        self.profile = QComboBox()
        self.profile.addItem("Gizlilik · Privacy", "privacy")
        self.profile.addItem("Gelişmiş · Advanced", "advanced")
        self.profile.addItem("Özel · Custom", "custom")
        self.profile.currentIndexChanged.connect(self._profile_changed)
        form.addRow("Profil", self.profile)
        self.profile_description = self._label("Çekirdeğin gizlilik profili uygulanır. C2PA ayrıca onaylanmadıkça korunur.")
        form.addRow(self.profile_description)
        self.category_widget = QWidget()
        self.category_layout = QVBoxLayout(self.category_widget)
        self.category_layout.setContentsMargins(0, 0, 0, 0)
        self.category_checks: list[QCheckBox] = []
        form.addRow("Kategoriler", self.category_widget)
        self.category_widget.hide()
        self.c2pa_check = QCheckBox("C2PA / kaynak provenans verisini de kaldır")
        self.c2pa_check.toggled.connect(self._c2pa_toggled)
        form.addRow(self.c2pa_check)
        form.addRow(self._label("C2PA kaldırma imza ve kaynak geçmişini kaybettirebilir. Varsayılan: kapalı.", "warning"))
        self.rights_check = QCheckBox("Telif / hak ve kaynak alanlarını kaldırmaya ayrıca izin ver")
        self.rights_check.toggled.connect(self._rights_toggled)
        form.addRow(self.rights_check)
        form.addRow(self._label("EXIF/XMP/IPTC gibi kapsayıcılar bütün olarak kaldırılabilir; tek alan seçimi aynı kapsayıcıdaki diğer alanları da kaybettirebilir. Hak/kaynak alanları ayrıca izin verilmedikçe korunur; bu nedenle temizlik engellenebilir.", "warning"))
        options.addWidget(profile_box, 1)
        action_box = QGroupBox("Güvenli çıktı")
        action_layout = QVBoxLayout(action_box)
        action_layout.addWidget(self._label("Önce analiz tamamlanmalıdır. Temizleme sırasında yeni iş başlatılmaz. Kaydetme iletişim kutusunda orijinalden farklı bir hedef seçin."))
        self.clean_button = QPushButton("Yeni Dosyaya Temizle…")
        self.clean_button.setObjectName("primary")
        self.clean_button.clicked.connect(self.clean_image)
        action_layout.addWidget(self.clean_button)
        self.selection_note = self._label("Analiz bekleniyor", "muted")
        action_layout.addWidget(self.selection_note)
        action_layout.addStretch()
        options.addWidget(action_box, 1)
        layout.addLayout(options)
        preview_row = QHBoxLayout()
        self.before_preview = ImagePreview()
        self.after_preview = ImagePreview()
        for title, view in [("Önce · orijinal", self.before_preview), ("Sonra · çıktı", self.after_preview)]:
            group = QGroupBox(title)
            group_layout = QVBoxLayout(group)
            group_layout.addWidget(view)
            fit = QPushButton("Görseli Sığdır")
            fit.clicked.connect(view.fit_image)
            group_layout.addWidget(fit)
            preview_row.addWidget(group, 1)
        layout.addLayout(preview_row, 1)
        self.clean_summary = QPlainTextEdit()
        self.clean_summary.setReadOnly(True)
        self.clean_summary.setMaximumHeight(140)
        self.clean_summary.setPlaceholderText("İşlem durumu, korunan/kaldırılan alanlar ve kontroller burada görünür.")
        layout.addWidget(self.clean_summary)

    def _build_reports(self) -> None:
        _, layout = self._page("Raporlar", "Bu oturumdaki gerçek analiz ve temizleme sonuçları. Liste kalıcı değildir; JSON ile saklayabilirsiniz.")
        self.report_mode = QComboBox()
        self.report_mode.addItem("Gizlilik Güvenli Rapor · Privacy-Safe Report", True)
        self.report_mode.addItem("Standart Rapor · Standard Report", False)
        self.report_mode.currentIndexChanged.connect(self._report_mode_changed)
        layout.addWidget(self.report_mode)
        layout.addWidget(self._label("Önizleme her zaman gizlilik güvenlidir. Standart rapor ham meta veri, C2PA, dosya yolları ve kimlik bilgileri içerebilir; paylaşmadan önce inceleyin. Yalnız son 20 rapor bellekte tutulur.", "warning"))
        splitter = QSplitter(Qt.Orientation.Horizontal)
        self.report_list = QListWidget()
        self.report_list.currentRowChanged.connect(self._show_report)
        self.report_content = QPlainTextEdit()
        self.report_content.setReadOnly(True)
        self.report_content.setPlaceholderText("Henüz rapor yok. Görsel açıldığında analiz raporu oluşturulur.")
        splitter.addWidget(self.report_list)
        splitter.addWidget(self.report_content)
        splitter.setSizes([260, 700])
        layout.addWidget(splitter, 1)
        self.report_export = QPushButton("Seçili Raporu JSON Olarak Kaydet…")
        self.report_export.clicked.connect(self.export_report)
        layout.addWidget(self.report_export)

    def _build_settings(self) -> None:
        _, layout = self._page("Ayarlar", "Bu oturumda uygulanan arayüz ve güvenli başlangıç tercihleri.")
        group = QGroupBox("Görünüm ve varsayılanlar")
        form = QFormLayout(group)
        self.auto_fit = QCheckBox("Pencere boyutu değişince önizlemeyi sığdır")
        self.auto_fit.setChecked(True)
        self.auto_fit.toggled.connect(self._set_auto_fit)
        form.addRow(self.auto_fit)
        self.default_profile = QComboBox()
        self.default_profile.addItem("Gizlilik", "privacy")
        self.default_profile.addItem("Gelişmiş", "advanced")
        self.default_profile.addItem("Özel", "custom")
        form.addRow("Yeni analiz için profil", self.default_profile)
        form.addRow("Tema", self._label("Koyu · yerel masaüstü"))
        form.addRow("Önizleme üst sınırı", self._label("1600 piksel · QImageReader ile ölçekli okuma"))
        form.addRow("C2PA", self._label("Her yeni analizde kaldırma onayı sıfırlanır."))
        layout.addWidget(group)
        self.temp_warning = self._label("Başlangıçta önceki oturumun geçici dosya kayıtları kontrol edilir; otomatik silme yapılmaz.", "warning")
        layout.addWidget(self.temp_warning)
        layout.addWidget(self._label("Ayarlar yalnız bu oturum için geçerlidir. Raporlar ve dosya yolları otomatik olarak diske kaydedilmez.", "muted"))
        layout.addStretch()

    def _build_future(self, title: str, message: str) -> None:
        _, layout = self._page(title, "NOT SUPPORTED · Bu sürümde desteklenmiyor")
        layout.addWidget(self._label("Planlanan kapsam · Faz 1 dışında", "badge"))
        layout.addWidget(self._label(message, "summary"))
        layout.addWidget(self._label("Bu sayfa işlem başlatmaz ve herhangi bir analiz sonucu üretmez.", "muted"))
        layout.addStretch()

    @Slot(int)
    def _navigate(self, row: int) -> None:
        if row >= 0:
            self.pages.setCurrentIndex(row)

    @Slot()
    def open_image(self) -> None:
        if self._closing:
            return
        path, _ = QFileDialog.getOpenFileName(self, "Analiz edilecek görsel", "", "Desteklenen görseller (*.png *.jpg *.jpeg *.webp *.tif *.tiff);;Tüm dosyalar (*)")
        if path:
            self.scan_path(path)

    def scan_path(self, path: str) -> None:
        if self._closing:
            return
        if not Path(path).is_file():
            QMessageBox.warning(self, "Dosya açılamadı", "Yerel ve mevcut bir görsel dosyası seçin.")
            return
        self._generation += 1
        self.metadata_overview.set_state("scanning", "Metadata taranıyor; kaynak kimliği doğrulanacak…")
        self.analysis_result = None
        self.analysis_pane.clear()
        self.frequency_result = None
        self.frequency_pane.clear('Yeni kaynak seçildi.')
        if self._tasks:
            self._pending_path = path
            self.scan_result = None
            self.process_result = None
            self.metadata.setRowCount(0)
            self.analysis_details.clear()
            self.clean_summary.clear()
            self.analysis_preview.clear_preview("Yeni görsel bekleniyor")
            self.before_preview.clear_preview("Yeni görsel bekleniyor")
            self.after_preview.clear_preview("Henüz çıktı yok")
            self.scan_summary.setText("Önceki işlem iptal ediliyor; son seçilen görsel taranacak…")
            self.path_label.setText(Path(path).name[:140] + ('…' if len(Path(path).name) > 140 else ''))
            self.path_label.setToolTip(path)
            self.cancel_operation()
            self._update_actions()
            return
        self._pending_path = None
        self.scan_result = None
        self.process_result = None
        self.metadata.setRowCount(0)
        self.scan_summary.setText("Analiz ediliyor…")
        self.analysis_details.clear()
        self.clean_summary.clear()
        self.analysis_preview.clear_preview("Analiz bekleniyor")
        self.before_preview.clear_preview("Analiz bekleniyor")
        self.after_preview.clear_preview("Henüz çıktı yok")
        self.c2pa_check.setChecked(False)
        self.rights_check.setChecked(False)
        self.path_label.setText(Path(path).name[:140] + ('…' if len(Path(path).name) > 140 else ''))
        self.path_label.setToolTip(path)
        self.profile.setCurrentIndex(self.profile.findData(self.default_profile.currentData()))
        self.navigation.setCurrentRow(0)
        self._submit("scan", lambda cancelled, progress: scan_dashboard(path, cancelled=cancelled, progress=progress, workflow=self.workflow), progressive=True)

    @Slot()
    def analyze_image(self) -> None:
        if self._tasks or self.scan_result is None or self._closing:
            return
        source = self.scan_result.path
        expected = self.scan_result.sha256
        generation = str(self._generation)
        self.analysis_result = None
        self.analysis_pane.clear("Piksel analizi sürüyor…")
        self._submit("analyze", lambda cancelled, progress: self.analysis_engine.analyze(
            source, expected_sha256=expected, generation_id=generation,
            cancelled=cancelled, progress=progress,
        ), progressive=True)

    @Slot()
    def start_analysis(self) -> None:
        self.analyze_image()

    @Slot()
    def start_frequency(self, options=None) -> None:
        if self.scan_result is None or self._tasks or self._closing:
            return
        config = FrequencyOptions(**(options or {}))
        engine = FrequencyEngine(frequency_options=config)
        source, expected, generation = self.scan_result.path, self.scan_result.sha256, str(self._generation)
        self.frequency_result = None
        self.frequency_pane.clear('Hazırlanıyor…')
        self.frequency_pane.set_state('running', 'Frekans analizi çalışıyor…')
        self.analysis_tabs.setCurrentIndex(1)
        self._submit('frequency', lambda cancelled, progress: engine.analyze(source, expected_sha256=expected,
                     generation_id=generation, cancelled=cancelled, progress=progress), progressive=True)

    def export_analysis(self) -> None:
        if self.analysis_result is not None:
            self._export_json(self.analysis_result, "piksel-analizi")

    def _submit(self, kind: str, operation, cancellable: bool = False, progressive: bool = False) -> None:
        if self._tasks or self._closing:
            return
        task = WorkflowTask(operation, cancellable=cancellable, progressive=progressive)
        self._tasks[task.task_id] = task
        self._task_generations[task.task_id] = self._generation
        task.signals.progress.connect(self._task_progress)
        task.signals.invalidated.connect(self._task_invalidated)
        self._task_kinds[task.task_id] = kind
        task.signals.succeeded.connect(self._task_succeeded)
        task.signals.failed.connect(self._task_failed)
        task.signals.cancelled.connect(self._task_cancelled)
        task.signals.finished.connect(self._task_finished)
        self.progress.show()
        self.statusBar().showMessage("Piksel analizi sürüyor…" if kind == "analyze" else "Analiz sürüyor…" if kind == "scan" else "Yeni çıktı hazırlanıyor…")
        self._update_actions()
        self._pool.start(task)

    def _current_task(self, task_id: str) -> bool:
        return task_id in self._tasks and self._task_generations.get(task_id) == self._generation and not self._closing

    @Slot(str, int, int)
    def _task_progress(self, task_id: str, processed: int, total: int) -> None:
        if self._current_task(task_id) and self._task_kinds.get(task_id) == "analyze":
            self.analysis_pane.set_progress(processed, total)
        elif self._current_task(task_id) and self._task_kinds.get(task_id) == "frequency":
            self.frequency_pane.set_progress(processed, total)
        elif self._current_task(task_id) and self._task_kinds.get(task_id) == "scan":
            self.metadata_overview.set_state("verifying", "Tarama tamamlandı; kaynak SHA-256 kimliği doğrulanıyor…")

    @Slot(str, str)
    def _task_invalidated(self, task_id: str, message: str) -> None:
        if not self._current_task(task_id):
            return
        self.scan_result = None
        self.process_result = None
        self.analysis_result = None
        self.metadata.setRowCount(0)
        self.analysis_preview.clear_preview("Kaynak değişti")
        self.before_preview.clear_preview("Kaynak değişti")
        self.after_preview.clear_preview("Kaynak değişti")
        self.analysis_pane.clear("Kaynak değişti. Dosyayı yeniden açıp meta verileri tarayın.")
        self.frequency_result = None
        self.frequency_pane.clear('Kaynak değişti; yeniden tarama gerekli.')
        self.scan_summary.setText("Kaynak kimliği değişti; yeniden tarama gerekli.")
        self.metadata_overview.set_state("source_changed", "Kaynak kimliği değişti. Dosyayı yeniden açıp tarayın.")
        self.statusBar().showMessage("Kaynak değişti; önce yeniden meta veri taraması yapın.")
        self._update_actions()

    @Slot(str, object)
    def _task_succeeded(self, task_id: str, result: Any) -> None:
        if not self._current_task(task_id):
            return
        if self._tasks[task_id].cancel_requested.is_set() and self._task_kinds.get(task_id) == "analyze":
            self._task_cancelled(task_id)
            return
        if self._task_kinds.get(task_id) == 'frequency':
            if self._tasks[task_id].cancel_requested.is_set():
                self._task_cancelled(task_id)
                return
            if self.scan_result is None or result.source_sha256 != self.scan_result.sha256 or result.generation_id != str(self._generation):
                return
            self.frequency_result = result
            self.frequency_pane.show_result(result)
            self._add_report('Frekans analizi', result)
            self.statusBar().showMessage('Frekans analizi doğrulandı.' if result.status == 'Completed' else 'Frekans analizi desteklenmiyor.')
        elif self._task_kinds.get(task_id) == "analyze":
            if self.scan_result is None or result.generation_id != str(self._generation) or result.source_sha256 != self.scan_result.sha256:
                return
            self.analysis_result = result
            self.analysis_pane.show_result(result)
            self._add_report("Piksel analizi", result)
            self.statusBar().showMessage("Bu görsel için piksel analizi desteklenmiyor." if result.status == "Unsupported" else "Piksel analizi tamamlandı.")
        elif self._task_kinds.get(task_id) == "scan":
            if self._tasks[task_id].cancel_requested.is_set():
                self._task_cancelled(task_id)
                return
            if isinstance(result, DashboardScan):
                self.metadata_overview.show_model(result.dashboard)
                result = result.scan
            self.scan_result = result
            self._populate_scan(result)
            self._add_report(f"Analiz · {Path(result.path).name}", result)
            self.statusBar().showMessage("Analiz tamamlandı.")
        else:
            self.process_result = result
            preview_error = self.after_preview.load_path(result.after.path)
            details = [
                f"Durum: {result.status}",
                f"Çıktı: {result.after.path}",
                f"Kaldırılan: {', '.join(result.removed) or 'Yok'}",
                f"Korunan: {', '.join(result.preserved) or 'Yok'}",
                "Kontroller: " + json.dumps(result.checks, ensure_ascii=False),
                "Uyarılar: " + ("; ".join(result.warnings) or "Yok"),
            ]
            if preview_error:
                details.append(f"Önizleme: {preview_error}")
            self.clean_summary.setPlainText("\n".join(details))
            self._add_report(f"Temizlik · {Path(result.after.path).name} · {result.status}", result)
            self.dashboard_summary.setText(f"Son işlem: {result.status}\n{len(result.removed)} alan kaldırıldı; {len(result.preserved)} alan korundu.\nÇıktı: {result.after.path}")
            self.statusBar().showMessage(f"İşlem tamamlandı · çekirdek durumu: {result.status}")

    @Slot(str, str)
    def _task_failed(self, task_id: str, message: str) -> None:
        if not self._current_task(task_id):
            return
        if self._task_kinds.get(task_id) == 'frequency':
            self.frequency_result = None
            self.frequency_pane.clear('Frekans analizi başarısız: ' + message[:512])
        elif self._task_kinds.get(task_id) == "analyze":
            self.analysis_result = None
            self.analysis_pane.clear("Piksel analizi tamamlanamadı.")
            self.analysis_pane.details.appendPlainText(message)
        elif self._task_kinds.get(task_id) == "scan":
            self.scan_summary.setText("Analiz tamamlanamadı.")
            self.metadata_overview.set_state("failed", "Tarama hatası: " + message[:500])
            self.dashboard_summary.setText("Son analiz başarısız oldu. Yeni bir dosya seçebilirsiniz.")
        else:
            self.clean_summary.setPlainText("Temizleme tamamlanamadı.\n" + message)
        self.statusBar().showMessage("İşlem başarısız; ayrıntıları kontrol edin.")
        if not self._closing:
            QMessageBox.critical(self, "İşlem hatası", message)

    @Slot()
    def cancel_operation(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        self.cancel_button.setEnabled(False)
        self.statusBar().showMessage("İptal istendi; güvenli kontrol noktasında durdurulacak…")

    @Slot(str)
    def _task_cancelled(self, task_id: str) -> None:
        if not self._current_task(task_id):
            return
        if self._task_kinds.get(task_id) == 'frequency':
            self.frequency_result = None
            self.frequency_pane.clear('Frekans analizi iptal edildi.')
        elif self._task_kinds.get(task_id) == "analyze":
            self.analysis_result = None
            self.analysis_pane.clear("Piksel analizi iptal edildi.")
        elif self._task_kinds.get(task_id) == "scan":
            self.scan_summary.setText("Analiz iptal edildi.")
            self.metadata_overview.set_state("cancelled", "Tarama iptal edildi; güncel sonuç gösterilmiyor.")
        else:
            self.clean_summary.setPlainText("Temizleme iptal edildi; yeni çıktı yayımlanmadı.")
        self.statusBar().showMessage("İşlem iptal edildi.")

    @Slot(str)
    def _task_finished(self, task_id: str) -> None:
        if task_id not in self._tasks:
            return
        if not self._pool.waitForDone(0):
            QTimer.singleShot(10, lambda: self._task_finished(task_id))
            return
        task = self._tasks.pop(task_id, None)
        self._task_kinds.pop(task_id, None)
        self._task_generations.pop(task_id, None)
        if task is not None:
            task.signals.deleteLater()
        if not self._tasks:
            self.progress.hide()
        self._update_actions()
        if self._closing and not self._tasks:
            self._pending_path = None
            QTimer.singleShot(0, self.close)
        elif not self._tasks and self._pending_path is not None:
            path = self._pending_path
            self._pending_path = None
            self.scan_path(path)

    def _populate_scan(self, result: Any) -> None:
        self.scan_summary.setText(
            f"{result.format} · {result.width} × {result.height} · {result.mode} · {result.size_bytes:,} bayt · {len(result.fields)} alan\nSHA-256: {result.sha256}"
        )
        self.dashboard_summary.setText(f"{Path(result.path).name}\n{result.format} · {result.width} × {result.height} · {len(result.fields)} meta veri alanı\n{len(result.warnings)} çekirdek uyarısı")
        self.metadata.blockSignals(True)
        self.metadata.setRowCount(len(result.fields))
        for row, field in enumerate(result.fields):
            selected = QTableWidgetItem()
            selected.setData(Qt.ItemDataRole.UserRole, field.key)
            flags = Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled
            if self._field_selectable(field):
                flags |= Qt.ItemFlag.ItemIsUserCheckable
                selected.setCheckState(Qt.CheckState.Unchecked)
                selected.setToolTip("Özel profil için seç")
            else:
                selected.setToolTip("Çekirdek bu alanı kaldırılabilir olarak işaretlemedi")
            selected.setFlags(flags)
            self.metadata.setItem(row, 0, selected)
            for column, value in enumerate([field.key, field.value, field.standard, field.impact, field.category], start=1):
                text = str(value)
                if len(text) > 2000:
                    text = text[:2000] + "… [gösterim kısaltıldı]"
                item = QTableWidgetItem(text)
                item.setToolTip(text)
                self.metadata.setItem(row, column, item)
        self.metadata.blockSignals(False)
        preview_error = self.analysis_preview.load_path(result.path)
        self.before_preview.load_path(result.path)
        details = "C2PA · Çekirdek bulguları (kriptografik doğrulama iddiası değildir):\n"
        details += self._preview_json(report_dict(result, privacy_safe=True))
        details += "\n\nUyarılar:\n" + ("\n".join(result.warnings) or "Yok")
        if preview_error:
            details += f"\nÖnizleme: {preview_error}"
        self.analysis_details.setPlainText(details)
        self._populate_categories()
        self._update_actions()

    def _field_selectable(self, field) -> bool:
        return field.removable or (self.rights_check.isChecked() and field.impact.startswith('Hak/telif grubu korunur'))

    def _populate_categories(self) -> None:
        while self.category_layout.count():
            item = self.category_layout.takeAt(0)
            if item.widget() is not None:
                item.widget().deleteLater()
        self.category_checks = []
        categories = sorted({field.category for field in self.scan_result.fields if self._field_selectable(field)})
        for category in categories:
            check = QCheckBox(category or "Kategorisiz")
            check.setProperty("category", category)
            check.toggled.connect(self._update_actions)
            self.category_checks.append(check)
            self.category_layout.addWidget(check)
        if not categories:
            self.category_layout.addWidget(self._label("Kaldırılabilir kategori bulunamadı.", "muted"))

    def _selected_keys(self) -> tuple[str, ...]:
        if self.scan_result is None:
            return ()
        if self.profile.currentData() == "advanced":
            categories = {check.property("category") for check in self.category_checks if check.isChecked()}
            return tuple(dict.fromkeys(field.key for field in self.scan_result.fields if self._field_selectable(field) and field.category in categories))
        if self.profile.currentData() == "custom":
            return tuple(dict.fromkeys(
                self.metadata.item(row, 0).data(Qt.ItemDataRole.UserRole)
                for row in range(self.metadata.rowCount())
                if self.metadata.item(row, 0).checkState() == Qt.CheckState.Checked
            ))
        return ()

    @Slot()
    def _profile_changed(self) -> None:
        mode = self.profile.currentData()
        self.category_widget.setVisible(mode == "advanced")
        descriptions = {
            "privacy": "Çekirdeğin gizlilik profili uygulanır. C2PA ayrıca onaylanmadıkça korunur.",
            "advanced": "Kategorileri seçin. Kaldırılabilir alanlar anahtarlara dönüştürülerek custom modunda gönderilir.",
            "custom": "Analiz tablosunda kaldırılmasını istediğiniz alanları işaretleyin. İşaretlenmeyen alanlar talebe dahil edilmez.",
        }
        self.profile_description.setText(descriptions[mode])
        self._update_actions()

    @Slot(bool)
    def _c2pa_toggled(self, checked: bool) -> None:
        if checked:
            reply = QMessageBox.warning(
                self, "C2PA provenans bilgisini kaldırma onayı",
                "C2PA verisinin kaldırılması içerik kimlik bilgilerini, imzaları ve kaynak geçmişini kaybettirebilir. Bu işlem kaynağın doğrulanması değildir.\n\nYeni çıktıdan C2PA verisinin kaldırılmasını açıkça onaylıyor musunuz?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                self.c2pa_check.setChecked(False)
        self._update_actions()

    @Slot(bool)
    def _rights_toggled(self, checked: bool) -> None:
        if checked:
            reply = QMessageBox.warning(
                self, "Telif ve kaynak bilgileri",
                "Telif/hak ve kaynak alanları kapsayıcıyla birlikte kalıcı olarak silinebilir. Bu kaldırma için yasal yetkiniz bulunduğunu ve kaybı kabul ettiğinizi onaylayın.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                self.rights_check.setChecked(False)
        if self.scan_result is not None:
            self.metadata.blockSignals(True)
            for row, field in enumerate(self.scan_result.fields):
                item = self.metadata.item(row, 0)
                flags = Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled
                if self._field_selectable(field):
                    flags |= Qt.ItemFlag.ItemIsUserCheckable
                    item.setCheckState(Qt.CheckState.Unchecked)
                else:
                    item.setData(Qt.ItemDataRole.CheckStateRole, None)
                item.setFlags(flags)
            self.metadata.blockSignals(False)
            self._populate_categories()
        self._update_actions()

    @Slot(int)
    def _report_mode_changed(self, index: int) -> None:
        if self.report_mode.currentData() is False:
            reply = QMessageBox.warning(
                self, "Standart rapor gizlilik uyarısı",
                "Standart rapor ham meta veri, C2PA, yollar ve kimlik bilgileri içerir. Bu bilgileri dışa aktarmayı kabul ediyor musunuz?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No,
            )
            if reply != QMessageBox.StandardButton.Yes:
                self.report_mode.setCurrentIndex(0)

    @Slot()
    def _update_actions(self) -> None:
        if not hasattr(self, "clean_button"):
            return
        busy = bool(self._tasks)
        has_scan = self.scan_result is not None
        self.open_button.setEnabled(not busy and not self._closing)
        self.analysis_pane.start_button.setEnabled(has_scan and not busy and not self._closing)
        self.frequency_pane.start_button.setEnabled(has_scan and not busy and not self._closing)
        self.analysis_pane.export_button.setEnabled(self.analysis_result is not None and not busy)
        self.cancel_button.setEnabled(busy and not all(task.cancel_requested.is_set() for task in self._tasks.values()))
        self.rights_check.setEnabled(has_scan and not busy)
        self.scan_export.setEnabled(has_scan and not busy)
        self.profile.setEnabled(not busy)
        self.c2pa_check.setEnabled(has_scan and not busy)
        self.metadata.setEnabled(not busy)
        self.category_widget.setEnabled(not busy)
        keys = self._selected_keys()
        scan_only = has_scan and self.scan_result.format == "TIFF"
        unknown_c2pa = has_scan and self.scan_result.c2pa.get("presence") == "unknown"
        can_clean = has_scan and not scan_only and not unknown_c2pa and (self.profile.currentData() == "privacy" or bool(keys) or self.c2pa_check.isChecked())
        self.clean_button.setEnabled(can_clean and not busy)
        if busy:
            note = "İşlem sürüyor…"
        elif scan_only:
            note = "TIFF yalnız analiz destekler; temizleme desteklenmiyor."
        elif unknown_c2pa:
            note = "C2PA durumu bilinmiyor; çekirdek temizlemeyi engeller."
        elif has_scan and self.profile.currentData() != "privacy":
            note = f"{len(keys)} alan seçili"
        else:
            note = "Gizlilik profili hazır" if has_scan else "Analiz bekleniyor"
        self.selection_note.setText(note)
        self.report_export.setEnabled(self.report_list.currentRow() >= 0)

    @Slot()
    def clean_image(self) -> None:
        if self._tasks or self.scan_result is None:
            return
        from app.models.schema import CleanOptions
        source = self.scan_result.path
        original = Path(source)
        destination, _ = QFileDialog.getSaveFileName(self, "Temizlenmiş görseli farklı dosyaya kaydet", str(original.with_name(original.stem + "_temiz" + original.suffix)), "Aynı biçimde görsel (*" + original.suffix + ");;Tüm dosyalar (*)")
        if not destination:
            return
        try:
            same_path = os.path.normcase(os.path.realpath(source)) == os.path.normcase(os.path.realpath(destination))
            if Path(destination).exists():
                same_path = same_path or os.path.samefile(source, destination)
        except OSError as exc:
            QMessageBox.warning(self, "Hedef kontrol edilemedi", str(exc))
            return
        if same_path:
            QMessageBox.warning(self, "Orijinal korunuyor", "Çıktı orijinal dosyayla aynı olamaz. Farklı bir dosya adı seçin.")
            return
        if Path(destination).exists():
            QMessageBox.warning(self, "Mevcut dosya korunuyor", "Çekirdek mevcut dosyaları değiştirmez. Kullanılmayan yeni bir dosya adı seçin.")
            return
        if Path(destination).suffix.lower() != original.suffix.lower():
            QMessageBox.warning(self, "Biçim değişikliği desteklenmiyor", "Çıktıda orijinal dosyayla aynı uzantıyı kullanın.")
            return
        mode = "privacy" if self.profile.currentData() == "privacy" else "custom"
        options = CleanOptions(mode=mode, remove_keys=self._selected_keys(), remove_c2pa=self.c2pa_check.isChecked(), remove_rights=self.rights_check.isChecked(), expected_source_sha256=self.scan_result.sha256)
        self.process_result = None
        self.after_preview.clear_preview("İşlem sürüyor")
        self.clean_summary.setPlainText("Temizleme sürüyor…")
        self._submit("clean", lambda cancelled: self.workflow.clean(source, destination, options, cancelled=cancelled), cancellable=True)

    def _add_report(self, title: str, result: Any) -> None:
        self._reports.append((title, result))
        if len(self._reports) > 20:
            self._reports.pop(0)
            self.report_list.blockSignals(True)
            self.report_list.takeItem(0)
            self.report_list.blockSignals(False)
        self.report_list.addItem(title)
        self.report_list.setCurrentRow(len(self._reports) - 1)

    @staticmethod
    def _preview_json(payload: dict) -> str:
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        return text[:16000] + ("\n… [gösterim kısaltıldı]" if len(text) > 16000 else "")

    @Slot(int)
    def _show_report(self, row: int) -> None:
        if 0 <= row < len(self._reports):
            self.report_content.setPlainText(self._preview_json(report_dict(self._reports[row][1], privacy_safe=True)))
        self._update_actions()

    @Slot()
    def export_scan(self) -> None:
        if self.scan_result is not None:
            self._export_json(self.scan_result, "analiz")

    @Slot()
    def export_report(self) -> None:
        row = self.report_list.currentRow()
        if 0 <= row < len(self._reports):
            self._export_json(self._reports[row][1], "rapor")

    def _export_json(self, result: Any, name: str) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "JSON raporunu kaydet", name + ".json", "JSON (*.json)")
        if not path:
            return
        if not Path(path).suffix:
            path += ".json"
        protected = {getattr(result, "path", None)}
        if hasattr(result, "before"):
            protected.update([result.before.path, result.after.path])
        if self.scan_result is not None:
            protected.add(self.scan_result.path)
        if self.process_result is not None:
            protected.add(self.process_result.after.path)
        try:
            target = os.path.normcase(os.path.realpath(path))
            for image_path in protected:
                if image_path is None:
                    continue
                if target == os.path.normcase(os.path.realpath(image_path)) or (Path(path).exists() and Path(image_path).exists() and os.path.samefile(path, image_path)):
                    QMessageBox.warning(self, "Görsel korunuyor", "JSON raporu bir görsel dosyasının üzerine yazılamaz.")
                    return
            write_report(path, result, privacy_safe=bool(self.report_mode.currentData()))
        except (OSError, TypeError, ValueError) as exc:
            QMessageBox.critical(self, "Rapor kaydedilemedi", str(exc))
            return
        self.statusBar().showMessage(f"JSON raporu kaydedildi: {path}")

    @Slot(bool)
    def _set_auto_fit(self, enabled: bool) -> None:
        for preview in (self.analysis_preview, self.before_preview, self.after_preview):
            preview.auto_fit = enabled
            if enabled:
                preview.fit_image()

    def dragEnterEvent(self, event) -> None:
        urls = event.mimeData().urls()
        if not self._closing and len(urls) == 1 and urls[0].isLocalFile() and Path(urls[0].toLocalFile()).is_file():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event) -> None:
        urls = event.mimeData().urls()
        if not self._closing and len(urls) == 1 and urls[0].isLocalFile():
            event.acceptProposedAction()
            self.scan_path(urls[0].toLocalFile())
        else:
            event.ignore()

    def closeEvent(self, event: QCloseEvent) -> None:
        if self._tasks:
            self._closing = True
            self.cancel_operation()
            self.setEnabled(False)
            self.statusBar().showMessage("İptal istendi; çalışan işlem güvenle döndükten sonra pencere kapanacak…")
            event.ignore()
        else:
            for preview in (self.analysis_preview, self.before_preview, self.after_preview):
                preview.clear_preview("Pencere kapatıldı")
            event.accept()


def launch() -> int:
    import sys
    application = QApplication.instance() or QApplication(sys.argv)
    application.setApplicationName("AI Footprint Cleaner")
    window = MainWindow()
    window.show()
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(launch())
