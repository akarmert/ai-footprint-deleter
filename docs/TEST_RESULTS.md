# v0.1.1 Doğrulama sonuçları — 2026-10-10

## Başlangıç ve ortam

Windows11 build26200 x64, Python3.13.12; Pillow12.3.0, PySide6 6.12.0, c2pa-python0.38.0/nativeSDK0.91.0, pytest9.1.1, PyInstaller6.22.3. Runtime bağımlılıkları yükseltilmedi.

Değişiklik öncesi `python -m pytest -q`: **18 passed,1.71s**. Başlangıç ZIP proje dışında korundu. İki eski test dosyasının SHA256'ları başlangıç ZIP ile karşılaştırıldı: **byte-identical**, testler değiştirilmedi.

## Gerçek komutlar

Yerel yorumlayıcı `.venv\Scripts\python` kullanıldı:

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m pip check
.\.venv\Scripts\python -m compileall -q app modules main.py tests
```

Son takip kontrolü (2026-10-10 23:05): **78 passed,6.76s**; başarısız0, skipped0. Başlangıca göre60 yeni parametrik/normal test vakası. `pip check`: **No broken requirements found**. Compileall exit0. Son kabul kontrolünde aynı komutlar tekrar yürütülür; farklı son sayı/süre varsa final rapor üstün gelir.

Editör LSP ortamında PySide6/Pillow/c2pa çözümlenemeyen import uyarıları görüldü; gerçek `.venv` runtime import/test/build geçti. Tam statik typecheck/lint konfigürasyonu bulunmuyor; typecheck temizliği iddia edilmez.

## Takip kontrolü — kaynak seçimi bütünlüğü

76 testle başlayan tekrar kontrolde, kullanıcı analizinden sonra değişen dosyanın eski Custom kapsayıcı seçimiyle işlenebildiği gösterildi. Yeni regresyon düzeltme öncesi `DID NOT RAISE` ile başarısız oldu. `CleanOptions.expected_source_sha256` ve UI hash bağı eklendi; uyuşmazlık temp/çıktı oluşturulmadan yeniden analiz hatası verir. Çekirdek ve gerçek Qt UI testi geçti; kaynak korunur ve çıktı yayınlanmaz. Üç üretim dosyasının kesin diff'i takip başlangıcı ZIP'iyle doğrulandı. Odaklı senior kaynak incelemesi APPROVE; reviewer testleri bağımsız çalıştırmadı.

Onedir EXE düzeltmeyle yeniden üretildi; smoke exit0, source_preserved=true ve payload/pixel/ICC/orientation kontrolleri geçti. Kanıt: `C:\Users\Mert\AppData\Local\Temp\kilo\afc-review-fix-a96ilnzu`. Önceki ağ/platform kapsam boşlukları değişmedi.

## Kapsam

- PNG/JPEG/WebP pixel ve sıkıştırılmış payload SHA256 eşitliği; progressive/multi-scan JPEG, scan sonrası COM, EOI trailing reddi; unknown PNG chunk/JPEG APP11 koruması.
- PNG CRC/chunk türü/sırası/animasyon; WebP RIFF/VP8X uzunluğu/animasyon ve sınır kontrolleri.
- ICC, alpha, çözünürlük, orientation; XMP orientation değişiminde çıktı yayınlamama.
- Yanlış uzantı/header/bozuk dosya, dosya boyutu/MP limitleri, decompression warning-as-error, geçersiz yol.
- Mevcut hedef/orijinal overwrite reddi, publish race, başka sahip dosyasını koruma, disk flush failure, temp cleanup, kaynak değişikliği, checkpoint cancel/no publish.
- Copyright EXIF ve PNG text, XMP hak grupları, compressed/uncompressed PNG iTXt XMP: default koruma, onaysız custom reddi, ayrı consent ile kaldırma.
- SDK mock sözleşme testleri: trusted/valid structure, untrusted, hash failure, incomplete/malformed/error; corrupt PNG embedded + gerçek native corrupt JPEG/WebP C2PA failclosed.
- Post-clean C2PA regression/unknown durumunda çıktı yayınlamama; JPEG JUMBF protected ve kaldırma yasağı.
- Privacy-Safe Report ham değer/yol/hash/manifest redaksiyonu; Standard Report açık onay ve overwrite reddi; absent C2PA ayrı NotApplicable durumları ve ağ kategorisi korunması.
- Qt gerçek event loop worker tamamlanması, hata popup/recovery, cancel/close/run-tail lifetime, rapor geçmişi20, rights Custom seçilebilirlik, stale temp uyarısı.
- Asenkron1600px preview: off-GUI decode, hızlı20 yükleme/stale sonuç, pending clear, hatalı/oversized görüntü, parent destroy sırasında güvenli worker referansları.

## C2PA gerçek fixture

Önceki çalışma sırasında dış temp klasörüne alınmış resmî `contentauth/c2pa-python/tests/fixtures/C.jpg` tekrar yerel SDK ile okundu; yeni download yapılmadı. Güncel sonuç: presence=present, readability=Verified, signature=Verified, content_hash=Verified, **trust=Failed**, genelstatus=Failed. Untrusted test sertifikası başarılı/güvenilir gösterilmedi. JPEG kaldırma yasağı korunur. Mock trusted testi gerçek ticari trust-store/sertifika testi yerine geçmez.

## Ağ kanıtı

- **Static Configuration Verified:** nativeSDK0.91.0 `core.allowed_network_hosts=[]`, `verify.remote_manifest_fetch=false`, `verify.ocsp_fetch=false` ayarlarını kabul etti.
- **Runtime Network Tested — yalnız Python sınırı:** socket.connect/create_connection hata verecek şekilde guard edildi; yerel scan/clean geçti ve Python bağlantı girişimi gözlenmedi.
- **Not Tested:** native CAWG resolver/sertifika yollarının tümü, Windows packet capture ve firewall deny-all. Sistem firewall kuralları değiştirilmedi. Python guard native soketleri göremez; evrensel offline iddiası yoktur.

## Windows build

PyInstaller onedir üretimi başarıyla tamamlandı; assets, Qt pluginleri ve c2pa binary toplandı. İlk frozen EXE smoke `--smoke-test <disposable-dir>` exit0: native `qt_platform=windows`, Türkçe dosya adı, scan/clean/privacy-safeJSON, kaynak hash korunması, payload/pixel/ICC/orientation kontrolleri geçti. Native UI screenshot doğrudan incelendi: Türkçe metinler ve sekiz bölümlü koyu UI okunabilir. Son kaynak değişikliklerinden sonra build yeniden tamamlandı; final frozen smoke exit0. Kanıt klasörü (proje dışında): `C:\Users\Mert\AppData\Local\Temp\kilo\afc-v011-final-d8e3wq73`. Final screenshot da doğrudan incelendi; absent C2PA safe raporunda ayrı NotApplicable alanları ve StaticConfigurationVerified ağ durumu mevcut.

Build warning dosyası incelendi: platform/optional modüller (posix/numpy/olefile vb.) uyarıları vardır; tüm opsiyonel codec yolları test edilmiş sayılmaz. TemizWindows, Windows10, installer/kodimzalama **Not Tested**.

## Performans ve eksik kapsam

4 çözünürlük için gerçek PSAPI peak working-set ve UI timer ölçümleri [PERFORMANCE.md](PERFORMANCE.md) / `benchmark-v011-final.json` içinde. Uniform PNG tek koşu; gerçek fotoğraf corpus'u, bütün formatlar,20 farklı büyük dosya soak ve p95 ölçülmedi.

Symlink/reparse ayrıcalık gerektiren tüm Windows varyantları, SMB/FAT/NTFS matris, gerçek diskdolması/powerloss, tam C2PA corpus ve native ağ izleme yapılmadı. Hata enjeksiyonları gerçek fiziksel disk arızası kanıtı değildir. Tüm UI mouse/keyboard/zoom/pan akışları otomatik kapsamda değildir.

## Sonuç

**PARTIAL:** Test kapsamındaki v0.1.1 güvenlik/stabilite kontrolleri geçmiştir; ağ ve platform kanıt boşlukları nedeniyle tam kapsam/ticari release-ready iddiası yoktur. Bağımsız kaynak incelemesinde PNG XMP hak koruma ve C2PA safe-report durum kaybı tespit edilip regresyonlarla düzeltildi; son kaynak incelemesi APPROVE WITH CHANGES bildirdi: maddi blocker yok, nonblocking belge güncelliği ve WebP regresyon kapsamı istendi. Belgeler final kanıtla güncellendi; VP8X order/reserved byte/duplicate/missing image ve flag mismatch testleri eklendi. Reviewer komutları bağımsız çalıştırmadı; test ve final frozen smoke yürütme kanıtı ana ajan tarafından toplandı.
