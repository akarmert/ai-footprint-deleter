import numpy as np
from modules.analysis.frequency_engine import spectrum_preview
from modules.analysis.spectrum_visualization import display_spectrum


def test_dc_hide_is_pooled_cell_only_display_operation():
    raw=np.zeros((512,512));raw[256,256]=10;raw[257,257]=7
    original=raw.copy(); pooled=spectrum_preview(raw,'power'); before=pooled.copy()
    assert pooled[128,128]==17
    result=display_spectrum(pooled,log=False,exclude_dc=True,manual_range=(0,17))
    assert result.image[128,128]==0
    np.testing.assert_array_equal(raw,original)
    np.testing.assert_array_equal(pooled,before)
