from pathlib import Path
import sys
from PySide6.QtWidgets import QApplication
from app.ui.main_window import MainWindow


def main():
    application = QApplication(sys.argv)
    application.setApplicationName('AI Footprint Cleaner')
    application.setOrganizationName('AI Footprint Cleaner')
    application.setApplicationVersion('0.2.0b1')
    root = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    theme = root / 'assets' / 'themes' / 'dark.qss'
    if theme.exists():
        application.setStyleSheet(theme.read_text(encoding='utf-8'))
    window = MainWindow()
    window.show()
    smoke_timer = None
    if '--smoke-test' in sys.argv:
        from app.services.build_smoke import run_smoke
        index = sys.argv.index('--smoke-test')
        if len(sys.argv) <= index + 1:
            raise ValueError('--smoke-test mevcut boş bir çıktı klasörü gerektirir.')
        smoke_timer = run_smoke(application, window, sys.argv[index + 1])
    return application.exec()


if __name__ == '__main__':
    sys.exit(main())
