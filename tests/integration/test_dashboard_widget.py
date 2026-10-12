import os
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
from dataclasses import replace
from html import escape
from pathlib import Path

import pytest
from PySide6.QtCore import QCoreApplication, QEvent, Qt
from PySide6.QtWidgets import QApplication, QDialog, QLabel, QPlainTextEdit, QPushButton

from app.models.dashboard import DashboardModel, Row, Section
from app.ui.metadata_overview import MetadataOverview


@pytest.fixture(scope='session')
def app():
    return QApplication.instance() or QApplication([])


@pytest.fixture
def view(app):
    widget = MetadataOverview()
    yield widget
    widget.close()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
    widget.deleteLater()
    QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)


@pytest.fixture
def model():
    return DashboardModel(source_sha256='a' * 64, path='C:/private/source.png',
                          file_name='source.png', format='PNG', width=64, height=48,
                          size=1024, status_title='Kaynak beyanı bulunamadı',
                          status_detail='Bu bir AI tespit sonucu değildir.', status_flags=(),
                          generator=None, ai_claim=False, watermark_claim=None,
                          sections=(Section('c2pa', 'C2PA', 'Kaynak kaydı',
                                            (Row('presence', 'Manifest varlığı', 'Bulunamadı'),), None),
                                    Section('exif', 'EXIF', 'Çözümlenmiş alanlar',
                                            (Row('make', 'Üretici', '<b>literal</b>'),), 1)),
                          metadata_field_count=1, container_count=1, category_count=1,
                          missing_summary=('XMP bulunamadı; yokluğu AI yokluğu değildir.',), warnings=())


def test_empty_open_and_atomic_states(app, model, view):
    events = []
    view.open_requested.connect(lambda: events.append('open'))
    view.findChild(QPushButton).click()
    assert events == ['open']
    for state in ('loading', 'error', 'cancelled', 'source_changed', 'empty'):
        view.show_model(model)
        view.set_state(state, 'Yeni durum')
        assert view._model is None
        assert view.sections == []
        assert not view._entries
        assert view.state == state
        assert view.status_label.text() == 'Yeni durum'


def test_filter_and_expand_only_visible_then_collapse_all(app, model, view):
    view.show_model(model)
    assert view._entries[0]['table'] is not None
    assert view._entries[1]['table'] is None
    view.set_filter('exif')
    assert view._entries[0]['frame'].isHidden()
    view.set_expanded(True)
    assert view._entries[1]['button'].isChecked()
    view.set_expanded(False)
    assert all(not button.isChecked() for button, body in view.sections)
    view.set_filter('xmp')
    assert not view.filter_notice.isHidden()
    assert all(item['frame'].isHidden() for item in view._entries)
    view.set_filter('all')
    assert view.filter_notice.isHidden()
    assert all(not item['frame'].isHidden() for item in view._entries)
    assert view._model is model
    view.close()


def test_plain_text_long_filename_and_responsive_width(app, model, view):
    model = replace(model, file_name='<b>' + 'long-name-' * 100 + '.png',
                    generator='<img src="https://invalid">')
    view.setStyleSheet((Path(__file__).parents[2] / 'assets/themes/dark.qss').read_text(encoding='utf-8'))
    view.show_model(model)
    view.resize(900, 700)
    view.show()
    app.processEvents()
    view.resize(340, 640)
    app.processEvents()
    assert view.content.width() <= view.viewport().width()
    assert view.horizontalScrollBar().maximum() == 0
    assert view.headline.toolTip() == '<qt>' + escape(model.file_name) + '</qt>'
    assert len(view.headline.text()) < len(model.file_name)
    assert all(label.textFormat() == Qt.TextFormat.PlainText for label in view.findChildren(QLabel))
    view.set_expanded(True)
    assert view._entries[1]['table'].item(0, 1).text() == '<b>literal</b>'
    assert view._status_grid.getItemPosition(view._status_grid.indexOf(view.generator_label))[0] == 3
    view.close()


def test_lazy_row_limits_and_cell_bounds(app, model, view):
    rows = tuple(Row(str(index), 'Label' * 300, '<script>' + 'v' * 2000, 'detail') for index in range(700))
    sections = tuple(Section(str(index), 'Category', '', rows, 700) for index in range(5))
    view.show_model(replace(model, sections=sections))
    assert sum(entry['table'] is not None for entry in view._entries) == 1
    view.set_expanded(True)
    tables = [entry['table'] for entry in view._entries if entry['table'] is not None]
    assert [table.rowCount() for table in tables] == [200, 200, 100]
    assert sum(table.rowCount() for table in tables) == 500
    assert all(len(table.item(0, column).text()) <= 514 for table in tables for column in (0, 1))
    assert all(table.editTriggers() == table.EditTrigger.NoEditTriggers for table in tables)
    view.close()


def test_detail_is_plain_and_utf8_bounded(app, model, view):
    view.show_model(model)
    captured = []

    def inspect_dialog():
        dialog = view.findChild(QDialog)
        editor = dialog.findChild(QPlainTextEdit)
        captured.append(editor.toPlainText())
        assert editor.isReadOnly()
        dialog.reject()

    view._show_detail(Row('key', '<b>Label</b>', 'ü' * 20000, '<script>alert(1)</script>'))
    inspect_dialog()
    assert captured[0].startswith('<b>Label</b>')
    assert len(captured[0].encode('utf-8')) <= 16384
    view.close()


def test_navigation_signals(app, model, view):
    view.show_model(model)
    targets = []
    view.navigate_requested.connect(targets.append)
    for button in view.findChildren(QPushButton):
        if button.text() in ('Görsel Analizi', 'Metadata Temizleyici'):
            button.click()
    assert targets == [1, 2]
    view.close()
