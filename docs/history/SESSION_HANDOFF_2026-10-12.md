# Session Handoff — AI Footprint Cleaner

Son güncelleme: 12 Ekim 2026. Repository: https://github.com/akarmert/ai-footprint-deleter

## Durum ve amaç

Mevcut Windows uygulamasını koruyarak, medyayı yalnız kullanıcının tarayıcısında işleyen ve Railway'de statik olarak yayınlanabilen web uygulaması geliştiriliyor. Faz 1 web temeli ve Faz 2 JPEG/PNG/WebP metadata motoru tamamlandı; `main` dalına push edildi. Faz 3 video geliştirmesine **başlanmadı**.

- Faz 1 commit: `5b6e7d6497d04df195c10dce741538da2e1ba33b` — `Add browser-only web foundation for Railway`
- Faz 2 / mevcut HEAD: `047ff2ee6a23b325b0664bc7743478594e4d1e34` — `Add verified browser-only image metadata cleaning`
- Push sonrası uzak `main` SHA ve GitHub API üzerinden `web/src/engine.ts` erişimi doğrulandı.
- Bu handoff oluşturulmadan önce çalışma ağacı temizdi. Bu belge ayrıca commit/push edilmedi.

## Mimari, teknolojiler ve önemli yollar

Proje kökü: `C:\_projectsmert\ai-footprint-deleter`. Windows 11 x64, Python 3.13.12 ve proje `.venv` ortamı mevcut.

- Mevcut masaüstü: Python/PySide6; `app/`, `modules/`, `tests/`, `main.py`. Metadata kapsayıcı referansı: `modules/metadata/containers.py`; workflow: `app/services/workflow.py`.
- Web tamamen ayrı `web/`: React, TypeScript, Vite; Node 24.x. Kilitli sürümler: React/React DOM 19.3.0, Vite 7.3.7, TypeScript 5.9.3. Faz 2 yeni medya işleme bağımlılığı eklemedi.
- `web/src/engine.ts`: görsel kapsayıcı ayrıştırma, metadata sınıflandırma, kayıpsız temizleme ve bağımsız çıktı doğrulama.
- `web/src/inspect.worker.ts`, `protocol.ts`: yalnız tarayıcıda tarama/temizleme; tipli mesaj sözleşmeleri. Worker orijinal görsel baytlarını tutar.
- `web/src/main.tsx`, `style.css`: Türkçe responsive koyu UI, seçim/onay/iptal ve doğrulanmış Blob indirmesi.
- `web/src/media.ts`: Faz 1 format/boyut ve sınırlı başlık okuma yardımcıları; `Blob.slice()` tabanlı 64 KiB parçalı iterator. Faz 2 UI tam görsel motorunu çağırır, video yardımcıları UI'da etkin değildir.
- `web/src/output.ts`: gelecekteki File System Access akışlı çıktı için kullanıcı etkileşimiyle handle alma, sıralı write/close/abort sözleşmesi; mevcut UI bunu çağırmaz.
- `web/server.mjs`: bağımlılıksız statik Node sunucusu; yalnız `dist/`, SPA fallback, `/healthz`, `0.0.0.0`, `PORT` (varsayılan 3000). Medya işleme backend'i yok.
- `web/Dockerfile`, `.dockerignore`, `railway.toml`: çok aşamalı build, non-root runtime. `web/README.md`: kullanım, gizlilik, deployment ve destek sınırları.
- `web/src/*test.ts`, `web/server.test.mjs`; `web/tests/fixtures/`: 9 gerçek PIL görüntüsü, geçerli sRGB ICC profilleri; üretici `web/tests/generate_fixtures.py`.
- `web/tests/browser-acceptance.js`: Playwright browser_run_code ile çalıştırılan fonksiyon; bağımlılık yüklemez, `npm test` kapsamında değildir. Fixture kök yolu farklı checkout'ta düzenlenmelidir.

## Çalışan Faz 2 özellikleri

- JPEG/PNG/WebP seçimi, sürükle-bırak, dosya/format/boyut/çözünürlük/alpha/orientation bilgisi.
- EXIF, XMP, IPTC/APP13, PNG metin blokları, ICC ve bilinen C2PA/provenance kayıtlarının blok bazlı envanteri. Software/CreatorTool/model/prompt/seed gibi mevcut değerler sınırlı düz metin önizlemede gösterilir; AI kökeni tahmini yapılmaz.
- Temizlenebilir / Korunan / Desteklenmeyen sınıfları; hak onayıyla seçilebilir bloklar, kaldırılan/korunan/desteklenmeyen sayıları.
- Yeniden sıkıştırmadan seçili blok kaldırımı. Orijinal değişmez; ICC, yön bilgisi, alpha, çözünürlük ve kodlanmış görüntü payload'ı korunur.
- PNG CRC/chunk sırası, JPEG marker/frame/scan ve ek veri kontrolleri, WebP RIFF/padding/VP8X bayrak ve animasyon kontrolleri.
- `cleanImage()` yalnız `verifyOutput()` sonrasında döner: seçili kaldırımı, kalan blok sırası/tam baytları, format/çözünürlük/alpha/orientation, payload birebir eşitliği ve SHA-256 kontrol edilir. Yalnız gerekli WebP EXIF/XMP bayrakları ve RIFF uzunluğu değişebilir.
- Doğrulama/hash hatasında başarılı sonuç/indirilebilir Blob sunulmaz. İptal/yeni kaynak Worker'ı sonlandırır; eski yanıtlar Worker kimliğiyle reddedilir. Seçim/onay değişimleri eski çıktıyı geçersiz kılar; object URL'ler bırakılır. İşlem timeout'u 120 saniye.

## Korunacak teknik ve güvenlik kararları

1. Medya, metadata ve dosya adları sunucuya gönderilmez. Upload endpoint'i, medya depolama, uzak işleme SDK'sı, analitik veya otomatik IndexedDB/localStorage yazımı yoktur. Sunucu URL/dosya adı loglamaz; hosting altyapısının statik erişim logları ayrı konudur.
2. CSP korunmalı: özellikle `connect-src 'none'`, `worker-src 'self'`, dış script/SDK yasağı. Sunucu GET/HEAD dışındaki yöntemleri gövdeyi beklemeden reddeder; yol/symlink/MIME güvenlik kontrolleri vardır.
3. Görsel sınırı 128 MiB; 40 megapiksel; tek chunk 64 MiB; toplam metadata 16 MiB; 4096 parça; 512 karakter önizleme. Görseller Worker içinde tam okunur; input/output/hash scratch/Blob nedeniyle toplam bellek dosya boyutunun birkaç katıdır, 128 MiB toplam bellek garantisi verilmez.
4. ICC daima korunur. EXIF yönü belirsiz veya 1 dışında ise ilgili blok hak onayıyla dahi kaldırılamaz. Duplicate/belirsiz EXIF güvenli korumaya alınır.
5. Blok düzeyinde kaldırma uygulanır; alt alan düzenleme yoktur. İlk motor EXIF/XMP/IPTC/metin bloklarının telif bilgisi içerebileceğini varsayar; uygun bloklar açık yetki onayına kadar korunur. Bu sınıflandırma telif varlığının kesin tespiti değildir. Onay ICC/yön/C2PA/desteklenmeyen blok korumalarını aşamaz.
6. C2PA/JUMBF/APP11 veya belirsiz provenance durumunda **dosyanın tüm temizliği engellenir**. İmza/zincir güvenilirliği doğrulanmaz, C2PA kaldırılmaz; saptanmaması yokluk garantisi değildir.
7. Sıkıştırılmış PNG metni, >1 MiB metin, gömülü raw profil, bilinmeyen/extended APP1 ve yorumlanamayan XMP kaynak belirsizliği nedeniyle tüm temizliği engeller. XMP yalnız muhafazakâr UTF-8 alt kümesi: UTF-16/32, bozuk UTF-8, NUL, farklı encoding bildirimi, DTD/entity/`&` belirsizliği engellenir; literal Orientation içeren XMP korunur.
8. Faz 1 video yardımcı sınırı ondalık 1 GB = 1.000.000.000 bayt; Faz 2 UI videoyu **okumadan reddeder**. Gelecekte video tüm dosya RAM'e alınarak işlenmemeli; parçalı okuma/Worker ve destekli doğrudan disk çıktısı gerekir.
9. Metadata/C2PA ile frekans analizi ayrı sorumluluklardır. FFT/DCT, Noise/Texture veya frekans sonuçlarını AI üretim kanıtına dönüştürme bu kapsamda yoktur.

## Doğrulama ve düzeltilen hatalar

Son sabit Faz 2 sürümünde:

- `web/` içinde `npm run build`: TypeScript + production Vite başarılı.
- `npm test`: **39 başarılı, 1 atlandı**. Windows symlink oluşturma izni olmadığı için güvenlik testi atlandı; Linux'ta yeniden koşulmalı.
- `npm audit`: geliştirme bağımlılıkları dahil **0 bildirilen açık**; tam güvenlik garantisi değildir.
- Proje kökünde `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider`: **322 başarılı**. Bağımlılık tutarlılığı komutu: `.\.venv\Scripts\python.exe -m pip check`.
- Gerçek PIL JPEG/PNG/WebP, progressive JPEG, lossless WebP, palette alpha; EXIF/XMP/IPTC, yön 1/6, bozuk kapsayıcı, hak onayı, C2PA engeli, sınırlar, CRC-repaired kötü çıktı ve hash hata regresyonları mevcut.
- Production Chromium'da üç format tarama/onay/temizleme/indirme başarılı. Bağımsız PIL decode: indirilen dosyalarda piksel, boyut, geçerli sRGB ICC ve orientation orijinalle aynı.
- Ağ kaydı yalnız üç aynı-origin Worker JS GET isteği, request body yok; medya/metadata içeren istek yok. localStorage/sessionStorage/IndexedDB sayıları 0.
- Geciktirilmiş gerçek Worker ile scan/clean iptali, kaynak değişimi; onay geri çekimi, timeout/onerror/onmessageerror; gerçek emitted Worker'da hash reddi testleri geçti. Hata sonrası eski indirme sunulmuyor.
- `/healthz` ve SPA `/workspace` başarılı; CSP runtime'da korunuyor. 1320×900 ve 390×844 ekranlar görsel incelendi, yatay taşma yok.
- Bağımsız Senior Review: UTF-16/32 XMP yön koruması ve provenance erken dönüş hataları bulundu, düzeltildi, son motor/Worker/UI için **APPROVE** alındı. Faz 1 FileList'in erken temizlenmesi ve prototype uzantı allowlist kusurları da önceden düzeltilmişti; tekrar açılmamalı.

## Sınırlamalar, deployment ve sıradaki işler

- Bilinen açık yüksek/orta güvenlik bulgusu son incelemede kalmadı; bu genel kusursuzluk iddiası değildir.
- Tam codec bitstream decode, kapsamlı alt alan ayrıştırma, C2PA kriptografik doğrulama ve tüm kişisel verilerin kaldırılması garantisi yoktur. Metadata önizlemesi 512 karakterdir.
- Gerçek 128 MiB bellek/stres profili, native OS dosya seçici diyaloğu ve tüm tarayıcılar test edilmedi.
- **Gerçek Railway deployment yapılmadı.** Docker CLI yoktu; Docker build/run denenmedi. Railway root directory `/web`, config path `/web/railway.toml`, health `/healthz`; güncel Railway belgesi TOML config'i deprecated işaretlediği için dashboard eşdeğer ayarları README'de belgelendi.
- Devam eden geliştirme veya beklenen deploy/CI yok. Kullanıcı yetkilendirmesiyle sonraki işler: Linux Docker/symlink testi, gerçek Railway yayın ve HTTPS smoke/network testi, büyük görsel bellek ve tarayıcı uyumluluğu testleri. Destek kapsamı genişletilecekse sıkıştırılmış metadata/XML/C2PA için güvenlik sözleşmeleri yeniden incelenmeli.
- Faz 3 video yalnız açık yeni talep sonrasında başlatılmalı. Otomatik sonraki faza geçilmemeli.

## Değiştirilmemesi gereken çalışan sistemler

- Windows/Python/PySide6 uygulaması, mevcut metadata motoru ve 322 regresyon; Faz 1/2 boyunca bunlara dokunulmadı.
- Mevcut EXE yolu: `dist\AI-Footprint-Cleaner\AI-Footprint-Cleaner.exe` (web çıktısı ayrı `web/dist/`).
- No-upload/no-persistence/CSP sınırları, fail-closed doğrulama, ICC/orientation/payload korumaları ve C2PA/hak onay politikası.
- `package-lock.json`, ayrı web klasörü ve mevcut Railway/statik sunucu yapısı gereksiz bağımlılık/backend eklenerek değiştirilmemeli.
