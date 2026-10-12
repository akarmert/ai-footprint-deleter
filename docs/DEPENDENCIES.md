# Bağımlılıklar ve dağıtım yükümlülükleri — v0.1.1

Kontrol tarihi: 2026-10-10. Kurulu dağıtımlar `importlib.metadata` ile okundu; sürümler değiştirilmedi. Python 3.13.12 / Windows 11 x64 üzerinde mevcut wheel'ler çalıştı. Python 3.12–3.15 hedef aralığının tümü ayrıca test edilmedi.

| Paket | Sürüm | Python gereksinimi | Dağıtım metadata lisansı |
|---|---|---|---|
| Pillow | 12.3.0 | >=3.10 | MIT-CMU |
| PySide6 | 6.12.0 | >=3.10,<3.16 | LGPL-3.0-only OR GPL-2.0-only OR GPL-3.0-only |
| c2pa-python | 0.38.0 | >=3.10 | MIT OR Apache-2.0 |
| pytest | 9.1.1 | >=3.10 | MIT |
| PyInstaller | 6.22.3 | >=3.8,<3.16 | GPLv2+ ve uygulama dağıtımı bootloader istisnası |

PyInstaller bu çalışma için mevcut `dev` sürüm sabitlemesine uygun kuruldu; kullanıcı runtime bağımlılığı değildir. Benchmark RAM ölçümü Windows ctypes/PSAPI kullanır; psutil veya yeni runtime paketi eklenmedi. ExifTool eklenmedi.

## Ticari dağıtım

- Qt/PySide6 LGPL yükümlülüklerini karşılayan lisans bildirimleri, kullanılan Qt kaynaklarına erişim ve kitaplık değiştirme/yeniden bağlama imkânı gerekir; uygun ticari Qt lisansı alternatif olabilir.
- `onedir` yaklaşımı korunur; tek başına `onedir` kullanmak hukuki uygunluk garantisi değildir.
- Pillow, c2pa native DLL, cryptography/OpenSSL ve diğer transitif/native bileşenlerin lisans bildirimleri ve kaynak yükümlülükleri ayrıca envanterlenmelidir.
- PyInstaller istisnasının kapsamı paket metninden incelenmeli; uygulama lisansı kendiliğinden belirlenmez.
- CVE/advisory canlı veritabanı taraması bu denetimin kanıtı değildir; sürümün güncel olması güvenli olduğu anlamına gelmez.

## Birincil kaynaklar

Kurulu paketlerin `.dist-info/METADATA` ve lisans dosyaları ile sürüme özel PyPI sayfaları:
- https://pypi.org/project/Pillow/12.3.0/
- https://pypi.org/project/PySide6/6.12.0/
- https://pypi.org/project/c2pa-python/0.38.0/
- https://pypi.org/project/pytest/9.1.1/
- https://pypi.org/project/pyinstaller/6.22.3/
- https://www.qt.io/licensing/open-source-lgpl-obligations

Bu belge hukuki danışmanlık veya tamamlanmış SBOM/lisans uygunluk sertifikası değildir.
