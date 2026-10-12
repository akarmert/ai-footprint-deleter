import pytest
from PIL import Image,PngImagePlugin
from app.services.workflow import Workflow
from app.models.schema import CleanOptions
from modules.reporting.exporter import report_dict


@pytest.mark.parametrize('compressed',[False,True])
def test_png_xmp_rights_protected_until_separate_consent(tmp_path,compressed):
    source=tmp_path/'rights.png'
    info=PngImagePlugin.PngInfo()
    info.add_itxt('XML:com.adobe.xmp','<rdf:Description dc:rights="Copyright Alice"/>',zip=compressed)
    Image.new('RGB',(16,16)).save(source,pnginfo=info)
    workflow=Workflow(); scan=workflow.scan(str(source))
    field=next(f for f in scan.fields if f.key.startswith('PNG text:'))
    assert not field.removable
    result=workflow.clean(str(source),str(tmp_path/'kept.png'),CleanOptions())
    assert not result.removed
    with pytest.raises(ValueError):
        workflow.clean(str(source),str(tmp_path/'denied.png'),CleanOptions('custom',(field.key,)))
    removed=workflow.clean(str(source),str(tmp_path/'consented.png'),CleanOptions('custom',(field.key,),remove_rights=True))
    assert field.key in removed.removed
    assert removed.checks['payload']==removed.checks['pixels']=='Verified'


def test_webp_flags_must_match_present_chunks(tmp_path):
    import struct
    from modules.metadata.containers import chunks
    source=tmp_path/'a.webp'
    Image.new('RGB',(8,8)).save(source,xmp=b'<xmp>private</xmp>')
    data=bytearray(source.read_bytes())
    assert data[12:16]==b'VP8X'
    data[20] &= ~4
    with pytest.raises(ValueError,match='bayrağı'):
        list(chunks(bytes(data),'WEBP'))
    data[20] |= 0x80
    with pytest.raises(ValueError,match='bayrakları'):
        list(chunks(bytes(data),'WEBP'))


@pytest.mark.parametrize('condition',['order','reserved_byte','duplicate','missing_image'])
def test_webp_structural_rejections(condition):
    import struct
    from modules.metadata.containers import chunks
    def chunk(kind,payload):
        return kind+struct.pack('<I',len(payload))+payload+b'\0'*(len(payload)%2)
    extended=chunk(b'VP8X',b'\0'*10)
    image=chunk(b'VP8 ',b'fixture')
    if condition=='order':
        body=image+extended
    elif condition=='reserved_byte':
        body=chunk(b'VP8X',b'\0\x01'+b'\0'*8)+image
    elif condition=='duplicate':
        body=extended+image+image
    else:
        body=extended
    body=b'WEBP'+body
    with pytest.raises(ValueError):
        list(chunks(b'RIFF'+struct.pack('<I',len(body))+body,'WEBP'))


def test_absent_c2pa_safe_report_keeps_separate_states(tmp_path):
    source=tmp_path/'a.png'; Image.new('RGB',(8,8)).save(source)
    result=Workflow().scan(str(source))
    c2pa=report_dict(result)['data']['c2pa']
    assert c2pa['presence']=='absent'
    for key in ('readability','signature','content_hash','trust'):
        assert c2pa[key]=='Not Applicable'
    assert c2pa['network']=='Static Configuration Verified'
