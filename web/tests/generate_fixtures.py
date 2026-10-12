from pathlib import Path
from PIL import Image, ImageCms, PngImagePlugin

root = Path(__file__).parent / 'fixtures'
root.mkdir(exist_ok=True)
for fmt, ext in [('JPEG', 'jpg'), ('PNG', 'png'), ('WEBP', 'webp')]:
    for orientation in [1, 6]:
        image = Image.new('RGBA' if fmt != 'JPEG' else 'RGB', (24, 16), (30, 80, 120, 100) if fmt != 'JPEG' else (30, 80, 120))
        exif = Image.Exif()
        exif[274] = orientation
        exif[305] = 'Fixture software'
        exif[315] = 'Fixture creator'
        exif[272] = 'Fixture model'
        kwargs = {'exif': exif, 'icc_profile': ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()}
        if fmt == 'PNG':
            info = PngImagePlugin.PngInfo()
            info.add_text('parameters', 'prompt: sample; seed: 42')
            info.add_text('Comment', 'keep me')
            kwargs['pnginfo'] = info
        image.save(root / f'image-{orientation}.{ext}', **kwargs)
    if fmt == 'WEBP':
        image.save(root / 'lossless.webp', lossless=True)
Image.new('RGB', (24, 16), 'blue').save(root / 'progressive.jpg', progressive=True)
Image.new('P', (24, 16)).save(root / 'palette.png', transparency=0)
