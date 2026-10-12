"""Opt-in native dashboard layout diagnostic using a local file, no uploads."""
import argparse
from pathlib import Path
import sys
import time
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from PySide6.QtWidgets import QApplication
from PySide6.QtCore import Qt
from app.ui.main_window import MainWindow


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('source'); parser.add_argument('output')
    args=parser.parse_args()
    output=Path(args.output).resolve(strict=True)
    app=QApplication([]); window=MainWindow(); window.show(); window.scan_path(args.source)
    deadline=time.monotonic()+30
    while window._tasks:
        app.processEvents(); time.sleep(.005)
        if time.monotonic()>deadline:raise RuntimeError('scan timeout')
    if window.scan_result is None:raise RuntimeError('scan failed')
    view=window.metadata_overview
    for width,height in [(1320,900),(980,720)]:
        window.resize(width,height); app.processEvents()
        view.set_expanded(True); app.processEvents()
        window.grab().save(str(output/f'dashboard-{width}.png'))
        bar=view.verticalScrollBar(); bar.setValue(bar.maximum()); app.processEvents()
        window.grab().save(str(output/f'dashboard-bottom-{width}.png'))
        bar.setValue(0)
    print('platform',app.platformName(),'sourcebound',view._model.source_sha256==window.scan_result.sha256,
          'fields',view._model.metadata_field_count,'containers',view._model.container_count,
          'scroll',view.verticalScrollBar().maximum(),flush=True)
    window.close(); app.processEvents()


if __name__=='__main__':main()
