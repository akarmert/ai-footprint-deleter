# AI Footprint Cleaner — Kapsamlı Proje Özeti

> Bu belge, mevcut proje kaynakları ile kök ve web README belgelerine dayanarak hazırlanmıştır. Web ürünü ile tarihsel masaüstü uygulaması birbirinden ayrılmıştır. Belgelerdeki eski test, benchmark ve yayın kayıtları güncel doğrulama sonucu olarak sunulmaz.

## 1. Projenin amacı ve güncel konumu

AI Footprint Cleaner, görsel ve desteklenen video dosyalarındaki metadata bilgilerini incelemeyi ve uygun kayıtları dosyayı yeniden kodlamadan kaldırmayı amaçlayan bir projedir.

**Birincil ve aktif ürün `web/` altındaki tarayıcı uygulamasıdır.** Web paketinin sürümü `0.1.0` olarak tanımlıdır. Python/PySide6 masaüstü uygulaması referans olarak korunur; yeni EXE, PyInstaller veya installer geliştirmesi ileri planın dışındadır.

Projenin adı tüm AI izlerini kaldırdığı anlamına gelmez: metadata temizliği, C2PA kaynak beyanı okuma, piksel/frekans analizi ve görünmez filigran tespiti farklı işlemlerdir.

### Temel ilkeler

- Medya web sunucusuna yüklenmez; tarayıcıdaki Worker içinde yerel işlenir.
- Node sunucusu yalnız statik uygulama dosyalarını sunar; medya işleyen backend veya upload API'si yoktur.
- Kaynak dosya değiştirilmez; temizlenmiş çıktı ayrı üretilir.
- Doğrulama başarısızsa başarılı temizlik sonucu veya indirilebilir doğrulanmış çıktı sunulmaz.
- Bilinmeyen veya güvenle işlenemeyen yapılar temizlenmiş gibi gösterilmez.
- C2PA varlığı tek başına AI üretimi kanıtı değildir.
- Kullanıcı yalnız kaldırma yetkisi bulunan dosyalarda işlem yapmalıdır; uygulama onayı hukuki uygunluk garantisi değildir.

## 2. Aktif web ürününün özellikleri

| Özellik | Mevcut kapsam |
|---|---|
| Dosya seçimi | Tek dosya seçici ve sürükle-bırak ile JPEG, PNG, WebP, MP4 ve MOV kabul edilir. |
| Görsel taraması | Kapsayıcı yapısı ve desteklenen metadata blokları Worker içinde ayrıştırılır. |
| Sonuç görünümü | Dosya bilgileri, metadata kategorileri, AI üretim beyanı durumu ve okunabilen C2PA kaynak alanları gösterilir. |
| Güvenli Mod | Varsayılan moddur; ICC renk profili, yön bilgisi ve güvenle kaldırılamayan kayıtlar korunur. |
| Kapsamlı Temizlik | Açık seçimle desteklenen JPEG ICC/JFIF ve WebP ICC kayıtlarının kaldırılmasına izin verir; PNG ICC korunur. |
| Hak/telif onayı | Motorun uygun bulduğu hak içerebilen bloklar için işlem öncesi tek onay penceresi gösterilir. |
| Görsel çıktısı | Seçili bloklar kaldırılır; çıktı yeniden ayrıştırılır ve sıkıştırılmış görüntü yükü eşitliği doğrulanır. |
| Video çıktısı | Desteklenen metadata aynı boyutta boşaltılır; geçici yerel çıktı yeniden taranıp tüm baytları beklenen dönüşümle karşılaştırıldıktan sonra ayrı hedefe yazılır. |
| İptal ve dosya değişimi | Worker yaşam döngüsü yönetilir; eski sonuçlar ve indirme bağlantıları geçersiz kılınır. |
| Responsive arayüz | Ortak tasarım token'larıyla masaüstü ve mobil düzenler, klavye odağı ve azaltılmış hareket tercihi desteklenir. |

### Normal kullanım akışı

1. Dosya seçilir veya çalışma alanına bırakılır.
2. Gerçek format ve yerel güvenlik sınırları kontrol edilir; tarama başlar.
3. Dosya bilgileri ile bulunan, temizlenebilir ve korunan kayıt sayıları görünür.
4. Güvenli Mod veya Kapsamlı Temizlik seçilir; kaynak metadata sonuçları incelenebilir.
5. Temizleme başlatılır; gerekiyorsa hak/telif onayı alınır.
6. Çıktı doğrulanır; görsel için indirme, video için doğrulanmış disk kaydı sonucu sunulur.

Temizleme sonrasında metadata sonuçları kaynak dosyanın taramasını göstermeye devam eder; çıktı doğrulaması ayrı alanda gösterilir.

## 3. Web sayfaları, bölümleri ve pencereleri

Web uygulaması çok sayfalı bir site değil, tek HTML girişine sahip bir React SPA'dır. Aşağıdaki çapa bağlantıları ayrı HTML sayfaları değil, aynı sayfanın bölümleridir.

### Ana sayfa ve gezinme bölümleri

| Sayfa / bölüm | Adres veya kaynak | Bir cümlelik görev açıklaması |
|---|---|---|
| HTML giriş sayfası | `web/index.html` | React uygulamasının bağlandığı kök HTML kabuğunu sağlar. |
| Ana uygulama | `web/src/main.tsx` | Tek sayfalık arayüzü ve dosya tarama, temizleme, iptal ve çıktı durumlarını birleştirir. |
| Üst gezinme | `web/src/components/Home.tsx` — `Header` | Marka ve ana bölüm bağlantılarını masaüstü navigasyonu veya mobil menü olarak sunar. |
| Tanıtım alanı | `web/src/components/Home.tsx` — `Hero` | Uygulamanın dosya inceleme ve yerel metadata temizleme amacını açıklar. |
| Dosya analiz alanı | `/#workspace` | Dosya seçimi ile analiz ve temizleme işlemlerinin yürütüldüğü etkileşimli çalışma alanını açar. |
| Nasıl çalışır? | `/#how-it-works` | Dosya seçme, metadata inceleme ve temizleme/kaydetme sürecini üç adımda anlatır. |
| Gizlilik | `/#privacy` | Yerel işleme yaklaşımını, kaynak dosyanın korunmasını ve geçici video depolama sınırlarını açıklar. |
| Sık sorulan sorular | `/#faq` | Metadata, formatlar, görüntü kalitesi, AI izleri ve C2PA hakkında temel soruları yanıtlar. |
| Teknik sınırlamalar | `/#technical-limits` | Temizleme garantilerinin ve video kaydı için gereken tarayıcı/disk özelliklerinin sınırlarını belirtir. |
| Alt bilgi | `web/src/components/Home.tsx` — `Footer` | GitHub bağlantısını, uygulama sürümünü ve teknik sınırlamalar notunu gösterir. |

### Çalışma alanında açılan ekran parçaları

| Ekran / bileşen | Kaynak | Bir cümlelik görev açıklaması |
|---|---|---|
| Dosya seçimi | `web/src/components/Workspace.tsx` — `FileDropzone` | Desteklenen tek dosyanın seçici veya sürükle-bırak ile alınmasını sağlar. |
| Seçili dosya bilgileri | `web/src/components/Workspace.tsx` — `FileDetails` | Dosya adını, boyutunu ve taramayla doğrulanan format bilgisini gösterir. |
| İşlem durumu | `web/src/components/Workspace.tsx` — `ScanStatus` | Tarama, temizleme, disk kaydı ve ilgili işlem durumlarını bildirir. |
| Metadata sayım özeti | `web/src/components/Workspace.tsx` — `ScanSummary` | Bulunan, temizlenebilir ve korunan metadata bloklarının sayılarını gösterir. |
| Temizleme seçenekleri | `web/src/components/Workspace.tsx` — `CleaningModeSelector` | Güvenli Mod ile Kapsamlı Temizlik arasında seçim yapılmasını sağlar. |
| Doğrulanmış çıktı | `web/src/components/Workspace.tsx` — `VerificationResult` | Temizleme sonucunu ve görsellerde doğrulanmış dosyayı indirme eylemini sunar. |
| Metadata sonuçları | `web/src/MetadataResults.tsx` | Kaynak taramasının AI beyanı durumunu, sayaçlarını ve kategorilere ayrılmış metadata değerlerini gösterir. |
| Tarama kapsamı ve sayımlar | `web/src/MetadataResults.tsx` içindeki açılır bölüm | Sayaçların anlamını, önizleme sınırlarını ve desteklenmeyen alanları açıklar. |
| C2PA manifest görünümü | `web/src/MetadataResults.tsx` içindeki salt okunur alan | Okunabilen manifest, Claim Generator, Actions ve Digital Source Type bilgilerini doğrulanmamış beyan olarak gösterir. |
| Temizleme politikası ve doğrulama ayrıntıları | `web/src/main.tsx` içindeki açılır bölüm | Kayıt bazında kaldırma/koruma gerekçelerini ve mevcutsa çıktı payload hash bilgisini gösterir. |
| Geçici video alanı ve disk sınırları | `web/src/main.tsx` içindeki video bölümü | OPFS veya kullanıcı seçimiyle geçici klasör kullanımını ve disk sınırlarını yönetir. |
| Hak/telif onay penceresi | `web/src/components/ConsentDialog.tsx` | Uygun hak veya ICC kayıtlarını kaldırmadan önce açık yetki onayı ister. |
| Dekoratif arka plan | `web/src/components/Atmosphere.tsx` | Ana ekran arka planını çizer ve işlem ya da azaltılmış hareket tercihinde animasyonu duraklatır. |

### Metadata sonuç kategorileri

| Kategori | Bir cümlelik görev açıklaması |
|---|---|
| C2PA / Kaynak Bilgisi | Mevcut veya belirsiz provenance ile okunabilen kaynak beyanlarını toplar. |
| Dosya Bilgileri | Ad, boyut, format, çözünürlük, megapiksel, yön ve alpha gibi dosya özelliklerini gösterir. |
| Diğer Metadata | Diğer sınıflara girmeyen okunabilir metadata bloklarını listeler. |
| Gizlilik Verileri | EXIF, GPS, IPTC ve benzeri kişi/cihaz/konum bilgisi içerebilen kayıtları toplar. |
| Renk Profili | ICC ve diğer renk yorumlama kayıtlarını gösterir. |
| AI / Üretim Beyanları | Üretim parametresi veya araç ipuçları içeren kayıtları toplar ancak bunları tek başına AI kanıtı saymaz. |

Yalnız kayıt içeren kategoriler için filtre düğmeleri gösterilir; `Tümü`, `Tümünü Aç` ve `Tümünü Kapat` sonuçların görünümünü yönetir.

### Sunucu yolları

| Yol | Bir cümlelik görev açıklaması |
|---|---|
| `/` | Derlenmiş tek sayfa uygulamasını sunar. |
| `/workspace` gibi uygun uzantısız yollar | SPA fallback ile aynı uygulama HTML'ini sunar; ayrı React sayfası tanımlamaz. |
| `/healthz` | Sürecin yanıt verdiğini `ok` metniyle bildiren sağlık kontrolüdür. |
| `/assets/...` | Derlenmiş JavaScript, CSS ve Worker gibi statik dosyaları sunar. |
| `/api`, `/upload`, `/uploads` | Medya API'si olarak uygulanmaz ve eksik dosyalarda SPA fallback dışında tutulur. |

Sunucu yalnız GET/HEAD kabul eder; diğer yöntemler 405 ile reddedilir.

## 4. Teknoloji ve veri akışı

### Web teknoloji yığını

- **React / React DOM:** Arayüz ve bileşenler.
- **TypeScript:** Uygulama, parser ve Worker sözleşmeleri.
- **Vite:** Geliştirme sunucusu ve production build.
- **Node.js 24:** Statik sunucu ve test çalışma ortamı; paket engine aralığı `>=24 <25`.
- **Web Worker:** Ana arayüzden ayrı medya tarama ve temizleme yürütmesi.
- **Web Crypto / SHA-256:** Sıkıştırılmış görüntü yükü bütünlük kontrolleri.
- **File System Access / OPFS:** Desteklenen tarayıcılarda video geçici alanı ve doğrudan disk çıktısı.
- **CSS:** Harici UI kütüphanesi yerine ortak token, genel stil ve bileşen stilleri.

### Temel kaynak dosyaları

| Dosya | Görevi |
|---|---|
| `web/src/main.tsx` | Dosya seçimi, Worker, izin/onay, iptal ve çıktı akışlarını koordine eder. |
| `web/src/engine.ts` | JPEG/PNG/WebP ayrıştırma, metadata politikası, temizleme ve çıktı doğrulamasını uygular. |
| `web/src/inspect.worker.ts` | Görsel tarama/temizleme isteklerini Worker içinde yürütür. |
| `web/src/video.ts` | MP4/MOV box ve tablo kontrollerini, parçalı temizlemeyi ve video doğrulamasını uygular. |
| `web/src/video.worker.ts` | Video staging, disk yazımı, commit, iptal ve cleanup yaşam döngüsünü yürütür. |
| `web/src/media.ts` | Dosya seçimi sınırlarını, format başlığı kontrollerini ve parça okuma yardımcılarını sağlar. |
| `web/src/output.ts` | Hedef dosya ve geçici klasör seçimini, sıralı yazma sözleşmesini sağlar. |
| `web/src/protocol.ts` | UI ile Worker arasındaki istek, yanıt ve doğrulanmış çıktı tiplerini tanımlar. |
| `web/src/c2pa.ts` | Desteklenen JPEG APP11, PNG `caBX` ve WebP `C2PA` depolarındaki JUMBF/CBOR alt kümesinden salt okunur C2PA alanlarını çıkarır. |
| `web/src/cbor.ts` | C2PA okuyucusunun kullandığı sınırlandırılmış CBOR çözümlemesini sağlar. |
| `web/src/c2pa-types.ts` | C2PA raporu ve manifest veri tiplerini tanımlar. |
| `web/src/results.ts` | Tarama verilerini kategori, sayaç ve AI beyanı görünümüne dönüştürür. |
| `web/src/style.css` | Ortak stil dosyalarını birleştirir. |
| `web/src/styles/tokens.css` | Renk ve ortak görsel değerleri tanımlar. |
| `web/src/styles/global.css` | Genel yerleşim, tipografi, kontroller ve odak stillerini sağlar. |
| `web/src/styles/components.css` | Ekran bileşenlerinin ve responsive düzenlerin stillerini sağlar. |
| `web/server.mjs` | Medya işlemeyen, güvenlik başlıkları ve yol kontrolleri olan statik HTTP sunucusudur. |
| `web/Dockerfile` | Web build ve statik sunucu için iki aşamalı container tanımıdır. |

### Görsel veri akışı

`File → seçim/format kontrolü → Worker → kapsayıcı taraması → politika ve onay → blok kaldırma → yeniden tarama + payload doğrulaması → doğrulanmış Blob → indirme`

### Video veri akışı

`File → parçalı tarama → politika ve onay → geçici yerel dosya → yeniden tarama + tüm baytların karşılaştırılması → ayrı hedefe sıralı yazma → close() → başarı`

Video temizliği medya yeniden kodlaması yapmaz; aynı uzunlukta boşaltma ile offset tabloları ve dosya boyutu korunur.

## 5. Destek sınırları ve güvenlik yaklaşımı

### Görsel sınırları

- Dosya üst sınırı **128 MiB = 134.217.728 bayt**.
- Çözünürlük üst sınırı **40 megapiksel**.
- Tek parça üst sınırı **64 MiB**, toplam metadata üst sınırı **16 MiB**, parça sayısı üst sınırı **4096**.
- Kayıt metni önizlemesi **512 karakter** ile sınırlıdır; arayüzde gösterilen bu metin ayrıca üç noktayla kısaltılmadan sarılır.
- Görsel motoru tüm dosyayı Worker belleğine alır; kaynak/çıktı/hash kopyaları nedeniyle bellek maliyeti dosya boyutunun birkaç katına çıkabilir.
- Görsel piksel decode veya canvas yeniden kodlaması temizleme yolunun parçası değildir.
- Animasyon, bozuk yapı ve güvenle ayrıştırılamayan format varyantları reddedilebilir.

### Video sınırları

- Dosya üst sınırı **1.000.000.000 bayt**; bu 1 GiB değildir.
- Dar codec/sample-entry kapsamı H.264 `avc1`, MJPEG `jpeg`, AAC `mp4a` ve klasik MOV PCM `sowt` içerir; bu codec adları her dosyanın kabul edileceği anlamına gelmez.
- Fragmented/encrypted MP4, HEVC, AV1, ProRes ve bilinmeyen/özel yapılar temizleme kapsamı dışındadır.
- Video parçalı işlenir; çıktı için Blob indirme alternatifi yoktur.
- Disk kaydı desteklenen masaüstü Chrome/Edge, HTTPS veya localhost ve ilgili dosya sistemi API'lerini gerektirir.
- Kota tahmini gerçek kapasite garantisi değildir; çökmede geçici medya kalabilir.
- Commit başladıktan sonra sonucu belirsiz bırakabilecek iptal/geri alma garantisi verilmez.

### C2PA ve AI yorumlama sınırları

- Web uygulaması C2PA imzasını, sertifika güvenini, assertion bağlantılarını veya içerik hash'ini kriptografik olarak doğrulamaz.
- Algılanan veya belirsiz provenance, normal metadata temizliğini engeller.
- Web, desteklenen gömülü C2PA depolarını (JPEG APP11, PNG `caBX`, WebP `C2PA`) yapısal doğrulamadan sonra kaldırabilir: `Remove AI Footprint` akışında veya gelişmiş `Yalnız C2PA’yı Kaldır` ile, ayrı onay penceresi olmadan. Harici/çoğul referanslar ve bozuk yapılar desteklenmez; çoklu görüntü (MPF/Ultra HDR) JPEG'lerde ikincil görüntüler bayt bayt korunur, yalnız MPF boyut/konum alanları güncellenir; videoda C2PA kaldırma yoktur.
- C2PA okuyucusu JPEG APP11, PNG `caBX` ve WebP `C2PA` depolarındaki JUMBF/CBOR alt kümesiyle sınırlıdır; video C2PA içeriğini çözümlemez.
- `trainedAlgorithmicMedia` gibi desteklenen standart kaynak beyanları ile araç/prompt ipuçları ayrı değerlendirilir.
- XMP beyanı araması ilk 512 karakterlik önizlemeyle sınırlıdır ve tam yapısal XML doğrulaması değildir.
- “AI üretim beyanı bulunamadı” ifadesi dosyanın AI üretimi olmadığını kanıtlamaz.
- SynthID sözcüğünün bulunması görünmez filigranın algılandığı veya kaldırıldığı anlamına gelmez.
- Tek gerçek üretici örneği, bütün üreticiler veya bütün dosyalar için uyumluluk kanıtı değildir.

### Sunucu ve gizlilik

Sunucu upload endpoint'i, hesap sistemi, medya depolama veya analytics içermez. CSP içindeki `connect-src 'none'` ağ bağlantılarını sınırlar; Worker yalnız aynı origin'den yüklenir. Dotfile, traversal ve symlink kontrolleri uygulanır. Altyapı statik isteklerin erişim loglarını tutabilir; bu nedenle “hiçbir yerde log yoktur” iddiası yapılmaz.

## 6. Legacy masaüstü uygulamasındaki bütün ana ekranlar

Masaüstü uygulaması `main.py` ile başlatılan PySide6/Qt uygulamasıdır; ana pencere `app/ui/main_window.py` içinde sekiz ana sayfayı yönetir. Aşağıdaki ekranlar web sayfası değildir ve aktif web ürünüyle aynı özellik kapsamına sahip değildir.

| Ekran | Kaynak | Bir cümlelik görev açıklaması |
|---|---|---|
| Genel Bakış | `app/ui/main_window.py` — `_build_dashboard` | Seçilen görselin tarama durumunu, metadata/kapsayıcı sayaçlarını ve kategori filtreli özetini gösterir. |
| Görsel Analizi | `app/ui/main_window.py` — `_build_analyzer` | Görsel önizlemesi, metadata tablosu, C2PA ayrıntıları ve analiz raporu eylemlerini sunar. |
| Meta Veri Temizliği | `app/ui/main_window.py` — `_build_cleaner` | Gizlilik/Gelişmiş/Özel profilleri, hak/C2PA onayları ve önce/sonra önizlemeyle ayrı çıktı üretimini yönetir. |
| AI İz Analizi | `app/ui/main_window.py` içindeki sekmeli ekran | Piksel/histogram ve FFT/DCT/radyal analizlerini iki alt sekmede sunar. |
| Görsel İşleme | `app/ui/main_window.py` — `_build_future` | Yeniden boyutlandırma ve piksel düzenlemenin desteklenmediğini belirten yer tutucu ekranı gösterir. |
| Toplu İşleme | `app/ui/main_window.py` — `_build_future` | Klasör taraması ve toplu çıktının desteklenmediğini belirten yer tutucu ekranı gösterir. |
| Raporlar | `app/ui/main_window.py` — `_build_reports` | Son 20 oturum raporunu görüntüler ve Privacy-Safe veya açık onaylı Standard JSON dışa aktarımını sağlar. |
| Ayarlar | `app/ui/main_window.py` — `_build_settings` | Oturum ayarlarını, varsayılan temizleme profilini ve sabit güvenlik sınırlarını gösterir. |

### Masaüstü alt ekranları ve pencereleri

| Ekran / pencere | Kaynak | Bir cümlelik görev açıklaması |
|---|---|---|
| Metadata özet panosu | `app/ui/metadata_overview.py` | Genel Bakış ekranının kartlarını, tablolarını ve filtreleme davranışını oluşturur. |
| Metadata alan ayrıntısı | `app/ui/metadata_overview.py` — `_show_detail` | Seçilen metadata değerinin ilk 16 KiB'lik içeriğini düz metin modal pencerede gösterir. |
| Görsel önizleme | `app/ui/image_preview.py` | Yakınlaştırma, kaydırma ve sığdırma destekli kontrollü görsel önizlemesi sağlar. |
| Piksel ve Histogram sekmesi | `app/ui/analysis_pane.py` | Ham kanal istatistikleri ve 256 kutulu histogramları gösterir. |
| FFT / DCT / Radyal sekmesi | `app/ui/frequency_pane.py` | Y/Cb/Cr frekans ısı haritaları, radyal güç spektrumu ve görünüm kontrollerini sunar. |
| Dosya açma/kaydetme pencereleri | `app/ui/main_window.py` — `QFileDialog` çağrıları | Kaynak görsel, ayrı temizlenmiş çıktı ve JSON rapor dosyası seçimini sağlar. |
| Onay ve hata pencereleri | `app/ui/main_window.py` — `QMessageBox` çağrıları | İşlem hataları, hak/C2PA onayları ve kullanıcı uyarılarını gösterir. |

Masaüstünde JPEG/PNG/WebP temizliği ve TIFF salt analizi bulunur; frekans sonuçları AI tespiti veya metadata sayımı değildir. Masaüstündeki SDK tabanlı C2PA yetenekleri web okuyucusuyla karıştırılmamalıdır.

## 7. Dizin haritası

| Dizin / dosya | Açıklama |
|---|---|
| `web/` | Aktif web uygulaması, statik sunucu, testler ve dağıtım dosyalarını içerir. |
| `app/` | Legacy masaüstü UI, model, servis ve worker katmanlarını içerir. |
| `modules/` | Legacy metadata, C2PA, analiz ve frekans işleme modüllerini içerir. |
| `tests/` | Python unit/integration regresyonlarını ve test yardımcılarını içerir. |
| `scripts/` | Fixture, benchmark ve ilgili geliştirme yardımcılarını içerir. |
| `docs/` | Teknik mimari, yöntem, sınır ve tarihsel doğrulama belgelerini içerir. |
| `assets/` | Legacy uygulamanın tema ve ilgili kaynaklarını içerir. |
| `main.py` | Legacy Qt giriş noktasıdır. |
| `requirements.txt`, `pyproject.toml` | Python bağımlılık ve proje/test yapılandırmasını içerir. |
| `AI-Footprint-Cleaner.spec` | Tarihsel PyInstaller paketleme tanımıdır. |
| `build/`, `dist/` | Yerel masaüstü build/dağıtım çıktılarıdır; güncel kaynak doğrulamasının yerine geçmez. |
| `.venv/`, `__pycache__/`, `.pytest_cache/` | Yerel Python ortamı ve üretilmiş önbelleklerdir. |
| `.kilo/` | Geliştirme agent/configuration ve yerel araç durumunu içerir; ürün sayfası değildir. |
| `.git/`, `.gitignore` | Sürüm geçmişi ve izleme dışı dosya kurallarını içerir. |
| `one-click-desktop.png`, `one-click-mobile-consent.png` | Yerel arayüz ekran görüntüleridir; uygulama sayfası veya runtime bağımlılığı değildir. |
| `pr.txt` | Kök dizinde bulunan yardımcı metin dosyasıdır; bu özette içeriği ve güncelliği doğrulanmamıştır. |

Üretilmiş çıktılar, bağımlılıkların kendi README dosyaları ve araçların iç durum kayıtları sayfa envanterine dahil edilmemiştir.

## 8. Dizindeki belge sayfaları ve tek cümlelik açıklamaları

### Kök ve web belgeleri

| Belge | Bir cümlelik görev açıklaması |
|---|---|
| `README.md` | Aktif web ürününü, temel çalıştırma adımlarını ve ayrı işaretlenmiş tarihsel masaüstü referansını tanıtır. |
| `web/README.md` | Web mimarisini, kullanım/güvenlik sınırlarını, yerel komutları, dağıtım ayarlarını ve tarihsel kabul kayıtlarını açıklar. |
| `CHANGELOG.md` | Legacy masaüstü sürümlerinin değişiklik geçmişini kaydeder. |
| `SESSION_HANDOFF.md` | Erken web fazlarına ait tarihsel devir notlarını ve teknik kararları özetler; güncel kodla birebir eşdeğer sayılmaz. |
| `PROJE_OZETI.md` | Projenin güncel kapsamını, mimarisini, ekranlarını ve dokümantasyon haritasını bir araya getirir. |

### `docs/` teknik belgeleri

Bu belgeler ağırlıklı olarak legacy masaüstü dönemine aittir; içlerindeki test ve performans sonuçları web ürününün güncel kabul sonucu değildir.

| Belge | Bir cümlelik görev açıklaması |
|---|---|
| `docs/ANALYSIS_ARCHITECTURE.md` | Phase 2A piksel analiz motorunun Qt'den bağımsız veri akışını ve mimari sınırlarını açıklar. |
| `docs/ANALYSIS_PERFORMANCE.md` | Piksel analizi benchmarklarının süre ve bellek ölçümlerini raporlar. |
| `docs/ANALYSIS_TEST_RESULTS.md` | Phase 2A geliştirmesinin test başlangıç ve kabul kayıtlarını içerir. |
| `docs/CHROMA_ANALYSIS.md` | YCbCr dönüşüm formüllerini, aralık politikasını ve alpha/gri ton kurallarını tanımlar. |
| `docs/DASHBOARD_ARCHITECTURE.md` | Genel Bakış ekranının salt okunur veri akışını ve kaynak geçerliliği kontrollerini anlatır. |
| `docs/DASHBOARD_TEST_RESULTS.md` | Dashboard test sonuçlarını ve kanıt sınırlarını kaydeder. |
| `docs/DCT_GRID_ALIGNMENT.md` | Global 8×8 DCT hizalamasını, kenar doldurmayı ve blok sahipliği kurallarını açıklar. |
| `docs/DEPENDENCIES.md` | Legacy Python paket sürümlerini ve dağıtım lisans yükümlülüklerini listeler. |
| `docs/FFT_DCT_METHODS.md` | FFT/DCT hesaplama yöntemlerini, normalizasyonları ve enerji tanımlarını belgeler. |
| `docs/FREQUENCY_ARCHITECTURE.md` | Frekans motorunun bellek, karo ve UI önizleme mimarisini açıklar. |
| `docs/FREQUENCY_PERFORMANCE.md` | Frekans analizinin fotoğraf ve düşük bellek bütçesi senaryolarındaki ölçümlerini sunar. |
| `docs/FREQUENCY_TEST_RESULTS.md` | Frekans modülünün regresyon, UI ve frozen EXE kabul kayıtlarını raporlar. |
| `docs/KNOWN_LIMITATIONS.md` | Masaüstü analizinin ve dağıtımının bilinen teknik/platform sınırlarını listeler. |
| `docs/MEMORY_MODEL.md` | Analiz motorlarının dosya/çözünürlük sınırlarını, soft bellek bütçesini ve snapshot maliyetini açıklar. |
| `docs/PERFORMANCE.md` | Eski masaüstü tarama, temizleme ve önizleme performansını ve benchmark yöntemini belgeler. |
| `docs/RADIAL_POWER_SPECTRUM.md` | Radyal ortalama güç spektrumu hesaplamasını, bin yapısını ve yorumlama sınırlarını tanımlar. |
| `docs/SECURITY_AUDIT.md` | Eski masaüstü güvenlik denetimini ve veri bütünlüğü/hak koruması bulgularını özetler. |
| `docs/TEST_RESULTS.md` | Eski sürümün ortam bilgilerini ve doğrulama komut sonuçlarını kaydeder. |
| `docs/WINDOWING_AND_LEAKAGE.md` | Hann/Hamming/Blackman pencereleme yöntemlerini, spektral sızıntıyı ve yorumlama sınırlarını açıklar. |

## 9. Çalıştırma, test ve dağıtım

### Web yerel kurulum

Node.js 24 ile `web/` dizininde:

```sh
npm ci
npm run build
npm start
```

Varsayılan adres `http://localhost:3000` olur; `PORT` ortam değişkeniyle değiştirilebilir.

```sh
npm run dev
npm test
```

- `npm run build`: `tsc --noEmit && vite build` ile TypeScript kontrolü ve üretim çıktısını oluşturur.
- `npm test`: Medya/C2PA/CBOR/sonuç sınıflandırma, video, Worker, çıktı ve statik sunucu testlerini çalıştırır.
- Ayrı lint scripti tanımlı değildir.
- `web/tests/*acceptance.js` tarayıcı fonksiyonları mevcut Playwright MCP üzerinden çalıştırılır; `npm test` bunları otomatik çalıştırmaz.
- Gerçek video fixture testlerinin bazıları yerel ffmpeg gerektirir; bağımlılıklar otomatik indirilmiş varsayılmamalıdır.

### Docker ve Railway

`web/` içinde belgelenen Docker komutları:

```sh
docker build -t ai-footprint-web .
docker run --rm -p 3000:3000 ai-footprint-web
```

Railway için Root Directory `/web`, sağlık kontrolü `/healthz` ve mevcut `web/Dockerfile` kullanılır. Yeni kurulum Dashboard ayarlarına dayanır; `railway.toml` yeni dağıtımın önkoşulu değildir. Yayın halka açık planlanmıştır; login, üyelik veya erişim kısıtı bu mimarinin parçası değildir.

Docker build, production domain ve native tarayıcı dosya seçici kabulü ayrı doğrulama kapılarıdır; yerel build başarısı bunları kanıtlamaz.

### Legacy komutlar

Aşağıdaki komutlar korunmuş Python uygulamasının referans çalışma ve regresyon komutlarıdır; aktif masaüstü yol haritası oluşturmaz:

```powershell
.\.venv\Scripts\python.exe main.py
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check
```

## 10. Doğrulama durumu ve açık konular

Bu özet hazırlanırken kaynak ve belge incelemesi yapılmıştır; yeni build, test, benchmark veya deploy çalıştırılmamıştır.

Bu konuşmadaki önceki UI çalışmasında web için 146 testin geçtiği, bir Windows symlink testinin atlandığı, build'in geçtiği ve MCP üzerinden responsive/temizleme kabul kontrollerinin tamamlandığı raporlanmıştır; bu kayıt bütün platformlar veya production için genel kabul değildir.

Ayrı doğrulanması gereken başlıca konular:

1. Docker/Linux çalışması ve Windows'ta atlanan symlink kontrolünün uygun ortamda çalışması.
2. Gerçek Railway deployment, HTTPS domain ve production güvenlik başlıkları.
3. Native Chrome/Edge dosya ve klasör seçicileri, izin reddi ve gerçek disk kayıt akışları.
4. Varsayılan koşullarda büyük videoların disk/kota/bellek davranışı ve crash sonrası artık dosyalar.
5. Farklı üreticilerin orijinal dosyalarıyla C2PA uyumluluğu; sentetik örnekler gerçek üretici kanıtı değildir.
6. Firefox/Safari ve mobil bellek/özellik sınırları için ayrı kabul kapsamı.

## 11. Kısa sonuç

Proje, aktif web ürünü ile korunmuş masaüstü referansını aynı depoda barındırır. Web ürününün odağı yerel metadata inceleme, güvenli kapsamda yeniden kodlamasız temizleme ve doğrulanmış çıktıdır. C2PA ve AI beyanları ihtiyatlı yorumlanır; uygulama tam anonimleştirme, güvenilir AI dedektörü veya görünmez filigran kaldırıcı olarak tanımlanmamalıdır.
