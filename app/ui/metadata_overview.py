from html import escape
from app.models.dashboard import Row

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (QAbstractItemView, QDialog, QDialogButtonBox,
                               QFrame, QGridLayout, QHeaderView,
                               QLabel, QPlainTextEdit, QPushButton, QScrollArea,
                               QSizePolicy, QStyle, QTableWidget, QTableWidgetItem,
                               QToolButton, QVBoxLayout, QWidget)


class FileNameLabel(QLabel):
    def __init__(self, text, parent=None):
        super().__init__(parent)
        self.full_text = str(text).replace('\\', '/').rsplit('/', 1)[-1]
        self.setTextFormat(Qt.TextFormat.PlainText)
        self.setMinimumWidth(0)
        self.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        self.setToolTip('<qt>' + escape(self.full_text) + '</qt>')
        self.setAccessibleName(self.full_text)
        self._elide()

    def _elide(self):
        self.setText(self.fontMetrics().elidedText(self.full_text, Qt.TextElideMode.ElideMiddle, max(0, self.width())))

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._elide()


class MetadataOverview(QScrollArea):
    open_requested = Signal()
    navigate_requested = Signal(int)
    ROW_LIMIT = 200
    TOTAL_ROW_LIMIT = 500
    DETAIL_LIMIT = 16384

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('dashboard')
        self.setWidgetResizable(True)
        self.setFrameShape(QFrame.Shape.NoFrame)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.content = QWidget()
        self.content.setObjectName('dashboardContent')
        self.layout = QVBoxLayout(self.content)
        self.layout.setContentsMargins(0, 0, 8, 8)
        self.layout.setSpacing(14)
        self.setWidget(self.content)
        self.sections = []
        self._entries = []
        self._model = None
        self.filter_buttons = {}
        self._filter_grid = None
        self._card_grid = None
        self.clear()

    def _label(self, text, name='dashboardText'):
        label = QLabel(str(text)[:4096])
        label.setObjectName(name)
        label.setTextFormat(Qt.TextFormat.PlainText)
        label.setWordWrap(True)
        label.setMinimumWidth(0)
        label.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        return label

    def _reset(self):
        self._model = None
        self.sections = []
        self._entries = []
        self.filter_buttons = {}
        self._filter_grid = None
        self._card_grid = None
        while self.layout.count():
            widget = self.layout.takeAt(0).widget()
            if widget:
                widget.hide()
                widget.deleteLater()

    def clear(self, message='Bir görsel açın veya pencereye sürükleyin. Metadata taraması otomatik başlar.', state='empty'):
        self._reset()
        self.state = state
        titles = {'empty': 'Metadata ve Kaynak Durumu', 'loading': 'Metadata taranıyor',
                  'scanning': 'Metadata taranıyor', 'verifying': 'Kaynak kimliği doğrulanıyor',
                  'failed': 'Tarama hatası',
                  'error': 'Tarama tamamlanamadı', 'cancelled': 'Tarama iptal edildi',
                  'canceled': 'Tarama iptal edildi', 'cancel': 'Tarama iptal edildi',
                  'source_changed': 'Kaynak dosya değişti', 'sourcechanged': 'Kaynak dosya değişti'}
        frame = QFrame()
        frame.setObjectName('dashboardStatusCard')
        box = QVBoxLayout(frame)
        box.setContentsMargins(20, 20, 20, 20)
        self.headline = self._label(titles.get(state, 'Metadata ve Kaynak Durumu'), 'dashboardTitle')
        box.addWidget(self.headline)
        self.status_label = self._label(message, 'dashboardMuted')
        box.addWidget(self.status_label)
        button = QPushButton('Görsel Aç')
        button.setObjectName('dashboardAction')
        button.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_DialogOpenButton))
        button.clicked.connect(self.open_requested.emit)
        button.setEnabled(state not in ('loading', 'scanning', 'verifying'))
        box.addWidget(button, 0, Qt.AlignmentFlag.AlignLeft)
        self.layout.addWidget(frame)
        self.layout.addStretch()

    def set_state(self, state, message):
        self.clear(message, state)

    def show_scan(self, scan):
        from app.models.dashboard import build_dashboard
        self.show_model(build_dashboard(scan))

    def show_model(self, model):
        self._reset()
        self._model = model
        self.state = 'ready'
        self.headline = FileNameLabel(model.file_name)
        self.headline.setObjectName('dashboardFilename')
        self.layout.addWidget(self.headline)
        self.layout.addWidget(self._label(f'{model.format}  ·  {model.width} × {model.height}  ·  {model.size:,} bayt', 'dashboardMuted'))
        status = QFrame()
        status.setObjectName('dashboardStatusCard')
        status_layout = QGridLayout(status)
        status_layout.setContentsMargins(20, 18, 20, 18)
        status_layout.addWidget(self._label('Metadata ve Kaynak Durumu', 'dashboardEyebrow'), 0, 0)
        self.status_label = self._label(model.status_title, 'dashboardTitle')
        status_layout.addWidget(self.status_label, 1, 0)
        status_layout.addWidget(self._label(model.status_detail, 'dashboardMuted'), 2, 0)
        self.generator_label = self._label('Kaynak Kaydını Oluşturan Araç\n' + str(model.generator or 'Beyan bulunamadı'), 'dashboardGenerator')
        status_layout.addWidget(self.generator_label, 0, 1, 3, 1)
        status_layout.setColumnStretch(0, 3)
        status_layout.setColumnStretch(1, 1)
        self._status_grid = status_layout
        self.layout.addWidget(status)
        unknown_claims = 'verification_incomplete' in model.status_flags
        ai_text = 'Dosyada mevcut; kaynak kaydının beyanıdır' if model.ai_claim else 'Kontrol edilemedi' if unknown_claims else 'İncelenen kayıtta bulunamadı; AI yokluğu anlamına gelmez'
        watermark_text = ('SynthID geçen kayıtlı ifade: ' + model.watermark_claim + '\nBağımsız dedektörle doğrulanmadı; ifadenin olumlu/olumsuz anlamı yorumlanmadı.') if model.watermark_claim else 'Kontrol edilemedi; dedektör çalıştırılmadı' if unknown_claims else 'İncelenen kayıtta bulunamadı; dedektör çalıştırılmadı'
        self.layout.addWidget(self._label('AI kaynak beyanı: ' + ai_text + '\nKayıtlı filigran ifadesi: ' + watermark_text, 'dashboardMuted'))
        if 'c2pa_untrusted' in model.status_flags or 'verification_incomplete' in model.status_flags:
            self.layout.addWidget(self._label('Uyarı · Kaynak kaydının doğrulaması/güveni tamamlanamadı. Beyanlar güvenilir tespit sonucu değildir; imza, içerik ve sertifika durumlarını ayrı inceleyin.', 'dashboardNotice'))
        cards = QWidget()
        self._card_grid = QGridLayout(cards)
        self._card_grid.setContentsMargins(0, 0, 0, 0)
        self._cards = []
        for title, value, detail in (
                ('Metadata alanı', model.metadata_field_count, 'Çözümlenmiş alanlar'),
                ('Kapsayıcı', model.container_count, 'Alan sayısından ayrı'),
                ('Kategori', model.category_count, 'Gözlenen metadata grupları')):
            card = QFrame()
            card.setObjectName('dashboardCountCard')
            box = QVBoxLayout(card)
            box.addWidget(self._label(str(value) if value is not None else 'Bilinmiyor', 'dashboardCount'))
            box.addWidget(self._label(title, 'dashboardCardTitle'))
            box.addWidget(self._label(detail, 'dashboardMuted'))
            self._cards.append(card)
        self.layout.addWidget(cards)
        notice = '\n'.join(model.missing_summary)
        if model.warnings:
            notice += '\n' + '\n'.join(str(warning)[:512] for warning in model.warnings[:10])
        compact = ' · '.join(model.missing_summary[:2])
        self.notice_label = self._label(compact[:240] + ('…' if len(compact) > 240 else ''), 'dashboardMuted')
        self.layout.addWidget(self.notice_label)
        if notice:
            details_button = QPushButton('Tarama kapsamı ve bulunamayan alanlar')
            details_button.setObjectName('dashboardAction')
            details_button.setMinimumWidth(0)
            details_button.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Fixed)
            details_button.clicked.connect(lambda checked=False, text=notice: self._show_detail(Row('scope', 'Tarama kapsamı', text[:16384])))
            self.layout.addWidget(details_button)
        filters = QWidget()
        self._filter_grid = QGridLayout(filters)
        self._filter_grid.setContentsMargins(0, 0, 0, 0)
        categories = [('all', 'Tümü'), ('c2pa', 'C2PA'), ('exif', 'EXIF'),
                      ('xmp', 'XMP'), ('iptc', 'IPTC'), ('file', 'Dosya'),
                      ('icc', 'ICC'), ('privacy', 'Gizlilik'),
                      ('production', 'Üretim'), ('other', 'Diğer')]
        category_keys = {key for key, title in categories}
        categories += [(section.key, section.title) for section in model.sections if section.key not in category_keys]
        by_key = {section.key: section for section in model.sections}
        for key, title in categories:
            section = by_key.get(key)
            count = model.metadata_field_count if key == 'all' else len(section.rows) if section is not None and key in ('file', 'warnings') else section.field_count if section is not None else 0
            if key == 'c2pa' and section is not None and any(row.key == 'presence' and row.value == 'Bulunamadı' for row in section.rows):
                count = 0
            count_text = '?' if count is None else str(count)
            button = QPushButton(f'{title}  {count_text}')
            button.setObjectName('dashboardFilter')
            button.setCheckable(True)
            button.setChecked(key == 'all')
            button.setAccessibleName('Kategori filtresi: ' + str(title))
            button.clicked.connect(lambda checked=False, selected=key: self.set_filter(selected))
            self.filter_buttons[key] = button
        self.layout.addWidget(filters)
        controls = QWidget()
        control_layout = QGridLayout(controls)
        control_layout.setContentsMargins(0, 0, 0, 0)
        self._control_grid = control_layout
        self.expand_button = QPushButton('Tümünü Aç')
        self.collapse_button = QPushButton('Tümünü Kapat')
        for index, button in enumerate((self.expand_button, self.collapse_button)):
            button.setObjectName('dashboardAction')
            control_layout.addWidget(button, 0, index)
        self.expand_button.clicked.connect(lambda: self.set_expanded(True))
        self.collapse_button.clicked.connect(lambda: self.set_expanded(False))
        self.layout.addWidget(controls)
        self.filter_notice = self._label('Bu kategoride çözümlenmiş metadata bulunamadı; yokluğu içerik kaynağını kanıtlamaz.', 'dashboardNotice')
        self.filter_notice.hide()
        self.layout.addWidget(self.filter_notice)
        remaining = self.TOTAL_ROW_LIMIT
        for section in model.sections:
            limit = min(len(section.rows), self.ROW_LIMIT, remaining)
            remaining -= limit
            self._add_section(section, limit)
        actions = QWidget()
        actions_layout = QGridLayout(actions)
        actions_layout.setContentsMargins(0, 0, 0, 0)
        for index, (title, target) in enumerate((('Görsel Analizi', 1), ('Metadata Temizleyici', 2))):
            button = QPushButton(title)
            button.setObjectName('dashboardAction')
            button.clicked.connect(lambda checked=False, page=target: self.navigate_requested.emit(page))
            actions_layout.addWidget(button, index, 0)
        self.layout.addWidget(actions)
        self.layout.addStretch()
        self._responsive()
        if self.sections:
            self.sections[0][0].setChecked(True)

    def _add_section(self, section, limit):
        frame = QFrame()
        frame.setObjectName('dashboardSection')
        box = QVBoxLayout(frame)
        button = QToolButton()
        button.setObjectName('dashboardSectionToggle')
        count = 'Bilinmiyor' if section.field_count is None else str(section.field_count)
        button.setText(f'{section.title}  ·  {count} alan / {section.container_count} kapsayıcı')
        button.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextBesideIcon)
        button.setCheckable(True)
        button.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Fixed)
        button.setMinimumWidth(0)
        button.setToolTip('<qt>' + escape(button.text()) + '</qt>')
        button.setAccessibleName(str(section.title) + ' bölümünü aç/kapat')
        button.setArrowType(Qt.ArrowType.RightArrow)
        box.addWidget(button)
        body = QWidget()
        body_box = QVBoxLayout(body)
        body_box.setContentsMargins(0, 4, 0, 0)
        body.hide()
        box.addWidget(body)
        entry = {'key': section.key, 'frame': frame, 'button': button, 'body': body,
                 'section': section, 'limit': limit, 'table': None, 'built': False}
        self._entries.append(entry)
        self.sections.append((button, body))
        button.toggled.connect(lambda checked, item=entry: self._toggle(item, checked))
        self.layout.addWidget(frame)

    def _toggle(self, entry, checked):
        button = entry['button']
        button.setArrowType(Qt.ArrowType.DownArrow if checked else Qt.ArrowType.RightArrow)
        button.setAccessibleDescription('Açık' if checked else 'Kapalı')
        if checked and not entry['built']:
            self._build_rows(entry)
        entry['body'].setVisible(checked)

    def _build_rows(self, entry):
        entry['built'] = True
        section = entry['section']
        box = entry['body'].layout()
        if section.description:
            box.addWidget(self._label(section.description, 'dashboardMuted'))
        if section.limitation:
            box.addWidget(self._label(section.limitation, 'dashboardNotice'))
        count = entry['limit']
        if count:
            table = QTableWidget(count, 2)
            table.setObjectName('dashboardRows')
            table.setHorizontalHeaderLabels(['Alan', 'Değer'])
            table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
            table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
            table.setAlternatingRowColors(True)
            table.setWordWrap(False)
            table.setTextElideMode(Qt.TextElideMode.ElideRight)
            table.verticalHeader().hide()
            table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
            table.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
            table.setMinimumWidth(0)
            table.setFixedHeight(min(340, table.horizontalHeader().height() + count * table.verticalHeader().defaultSectionSize() + 6))
            for index, row in enumerate(section.rows[:count]):
                for column, value in enumerate((row.label, row.value)):
                    text = str(value)
                    item = QTableWidgetItem(text[:512] + (' …' if len(text) > 512 else ''))
                    item.setToolTip('Ayrıntı için çift tıklayın veya Enter tuşuna basın.')
                    table.setItem(index, column, item)
            table.cellActivated.connect(lambda row, column, current=section: self._show_detail(current.rows[row]))
            box.addWidget(table)
            entry['table'] = table
        else:
            box.addWidget(self._label('Gösterilecek çözümlenmiş alan yok.', 'dashboardMuted'))
        if len(section.rows) > count:
            box.addWidget(self._label(f'Gösterim sınırı: {len(section.rows)} satırın ilk {count} satırı. Kategori başına en fazla 200, toplam 500 satır gösterilir.', 'dashboardNotice'))

    def _show_detail(self, row):
        dialog = QDialog(self)
        dialog.setObjectName('dashboardDetail')
        dialog.setWindowTitle('Metadata alan ayrıntısı')
        dialog.resize(620, 420)
        box = QVBoxLayout(dialog)
        text = QPlainTextEdit()
        text.setReadOnly(True)
        value = '\n\n'.join(str(part)[:self.DETAIL_LIMIT] for part in (row.label, row.value, row.detail))
        encoded = value.encode('utf-8')
        text.setPlainText(encoded[:self.DETAIL_LIMIT].decode('utf-8', errors='ignore'))
        box.addWidget(text)
        if len(encoded) > self.DETAIL_LIMIT:
            box.addWidget(self._label('Ayrıntı ilk 16 KiB ile sınırlandı.', 'dashboardNotice'))
        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Close)
        buttons.rejected.connect(dialog.reject)
        box.addWidget(buttons)
        dialog.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        dialog.setWindowModality(Qt.WindowModality.WindowModal)
        dialog.open()

    def set_filter(self, key):
        if key not in self.filter_buttons:
            return
        for current, button in self.filter_buttons.items():
            button.setChecked(current == key)
        found = False
        for entry in self._entries:
            matches = key == 'all' or entry['key'] == key
            found = found or matches
            entry['frame'].setVisible(matches)
        if not found:
            if key in ('xmp', 'iptc'):
                self.filter_notice.setText(f'{key.upper()}: Semantik çözümleme desteklenmiyor; kapsayıcı envanterinde kayıt görülmemesi alanların yokluk kanıtı değildir. Tarama kapsamını inceleyin.')
            elif self._model is not None and 'verification_incomplete' in self._model.status_flags:
                self.filter_notice.setText('Bu kategori kontrol edilemedi veya tarama kapsamı sınırlı; metadata yokluğu sonucu çıkarılamaz. Tarama kapsamını inceleyin.')
            else:
                self.filter_notice.setText('Bu kategoride tarayıcının çözdüğü bir alan bulunamadı; eksik ayrıştırma veya kapsam sınırı olabilir. Metadata yokluğu garantisi değildir.')
        self.filter_notice.setVisible(not found)

    def set_expanded(self, expanded):
        for entry in self._entries:
            if not expanded or not entry['frame'].isHidden():
                entry['button'].setChecked(expanded)

    def _responsive(self):
        width = self.viewport().width()
        if self._card_grid is not None:
            columns = 3 if width >= 620 else 1
            for index, card in enumerate(self._cards):
                self._card_grid.addWidget(card, index // columns, index % columns)
        if self._filter_grid is not None:
            for index, button in enumerate((self.expand_button, self.collapse_button)):
                self._control_grid.addWidget(button, index if width < 420 else 0, 0 if width < 420 else index)
            columns = max(1, min(5, width // 160))
            for index, button in enumerate(self.filter_buttons.values()):
                self._filter_grid.addWidget(button, index // columns, index % columns)
            self._status_grid.removeWidget(self.generator_label)
            if width < 620:
                self._status_grid.addWidget(self.generator_label, 3, 0)
                self._status_grid.setColumnStretch(1, 0)
            else:
                self._status_grid.addWidget(self.generator_label, 0, 1, 3, 1)
                self._status_grid.setColumnStretch(1, 1)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._responsive()
