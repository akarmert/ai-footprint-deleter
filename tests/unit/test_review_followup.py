import pytest
from PIL import Image, PngImagePlugin
from app.models.schema import CleanOptions
from app.services.workflow import Workflow


def test_clean_rejects_source_changed_since_user_scan(tmp_path):
    source=tmp_path/'source.png'
    info=PngImagePlugin.PngInfo(); info.add_text('Author','reviewed author')
    Image.new('RGB',(12,12),'red').save(source,pnginfo=info)
    scan=Workflow().scan(str(source))
    key=next(f.key for f in scan.fields if f.removable)
    replacement=PngImagePlugin.PngInfo(); replacement.add_text('Comment','different selected container')
    Image.new('RGB',(12,12),'blue').save(source,pnginfo=replacement)
    target=tmp_path/'out.png'
    options=CleanOptions(mode='custom',remove_keys=(key,),expected_source_sha256=scan.sha256)
    with pytest.raises(ValueError,match='yeniden analiz'):
        Workflow().clean(str(source),str(target),options)
    assert not target.exists()
