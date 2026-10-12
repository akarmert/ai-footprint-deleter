"""Explicit native Qt frequency layout diagnostic; disposable synthetic input."""
import sys,time,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import numpy as np
from PIL import Image
from PySide6.QtWidgets import QApplication,QScrollArea
from PySide6.QtCore import QCoreApplication,QEvent
from app.ui.main_window import MainWindow


def main():
    directory=Path(sys.argv[1]).resolve(strict=True)
    yy,xx=np.indices((256,256)); sample=np.stack(((127+80*np.sin(2*np.pi*xx/17)).astype('uint8'),(yy%256).astype('uint8'),(xx%256).astype('uint8')),axis=-1)
    source=directory/'spectral.png';Image.fromarray(sample).save(source)
    app=QApplication([]);window=MainWindow();window.show();window.scan_result=window.workflow.scan(source)
    window.navigation.setCurrentRow(3);window.start_frequency()
    deadline=time.monotonic()+30
    while window._tasks:
        app.processEvents();time.sleep(.002)
        if time.monotonic()>deadline:raise RuntimeError('timeout')
    if window.frequency_result is None:raise RuntimeError('analysis failed')
    for w,h in [(1320,900),(980,720)]:
        window.resize(w,h);app.processEvents()
        assert (window.width(),window.height())==(w,h), 'Requested window size not achieved'
        for index,name in enumerate(('fft','dct','radial')):
            window.frequency_pane.tabs.setCurrentIndex(index);app.processEvents()
            scroll=window.frequency_pane.findChild(QScrollArea)
            assert scroll.horizontalScrollBar().maximum()==0, 'Horizontal clipping'
            window.grab().save(str(directory/f'{name}-controls-{w}.png'))
            scroll.verticalScrollBar().setValue(scroll.verticalScrollBar().maximum());app.processEvents()
            window.grab().save(str(directory/f'{name}-{w}.png'))
            scroll.verticalScrollBar().setValue(0);app.processEvents()
    print('platform',app.platformName(),'status',window.frequency_result.status,'dir',directory)
    window.close();app.processEvents()
    QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)
    window.deleteLater();QCoreApplication.sendPostedEvents(None,QEvent.Type.DeferredDelete)


if __name__=='__main__':main()
