# AI Footprint Cleaner — Geliştirmeye Ara Verme ve Devir Özeti

**Hazırlanma:** 18 Kasım 2026, yerel saat (UTC+03:00).

**Güncelleme:** 18 Kasım 2026 — kaynak paketi (`AI-Footprint-Cleaner-KAYNAK-2026-11-18.zip`) dosya dosya okunarak gözden geçirildi. Eklenen ve düzeltilen kısımlar **„Güncelleme notu"** ile işaretlidir; yeni bulguların tamamı **14. bölümde**, yapılacaklar **15. bölümde**dir.

**Proje dizini:** `C:\_projectsmert\ai-footprint-deleter`

**Repository:** `https://github.com/akarmert/ai-footprint-deleter`

**Branch:** `main`; yerel Git bilgisine göre `origin/main` ile aynı noktada. Bu incelemede uzak sunucudan fetch yapılmadı.

**Kaynak anı / HEAD:** `302f531b7e74d11094ee23715ca243817378fa7f` — `feat(web): refine atmosphere starfield and dropzone styling`.

> Bu belge, geliştirmeye ara verilmeden önce mevcut kaynakları ve yerel dizin envanterini bir araya getiren güncel başvuru notudur. Eski belgelerdeki test sonuçları yeni bir test koşusu değildir. Bu görevde uygulama kodu değiştirilmedi; test, build, deploy veya tarayıcı kabul testi çalıştırılmadı. Özet ve yedek hazırlama işlemleri uygulamanın yayın kabulü anlamına gelmez.
>
> **Güncelleme notu:** Bu belgeden bağımsız olarak, 17 Kasım 2026'da aynı HEAD (`302f531`) üzerinde `npm test` Linux'ta bir kez çalıştırılmıştı (ayrıntı 10. bölümde). Build, deploy ve tarayıcı kabulü yine çalıştırılmadı.

## 1. Projenin amacı ve bugünkü yönü

AI Footprint Cleaner, medya dosyalarındaki metadata ve kaynak/provenance kayıtlarını incelemek ve desteklenen kayıtları doğrulanmış bir işlemle kaldırmak için geliştirilmiştir. Ana ürün artık `web/` içindeki web uygulamasıdır. Python/PySide6 masaüstü uygulaması korunur, ancak ileri masaüstü/EXE/installer geliştirmesi aktif planın dışındadır.

“AI izi” ifadesi burada desteklenen metadata, üretim beyanı ve gömülü C2PA kapsamındadır. Uygulama bir görselin AI üretimi olduğunu kesin olarak kanıtlamaz. Görünmez filigran/SynthID kaldırma, AI dedektörlerini yanıltma, tam anonimlik veya tüm izleri yok etme garantisi yoktur.

## 2. Dizin haritası

| Yol | İçerik ve rol |
|---|---|
| `web/` | Aktif React/TypeScript/Vite uygulaması, Node statik sunucu, testler ve Docker/Railway dosyaları. |
| `main.py` | Legacy masaüstü giriş noktası; uygulama sürümü `0.2.0b1`. |
| `app/models/` | Masaüstü veri modelleri ve dashboard sözleşmeleri. |
| `app/services/` | Tarama/temizleme workflow, dashboard taraması, geçici dosya yönetimi ve build smoke servisleri. |
| `app/workers/` | UI dışındaki masaüstü işler için worker katmanı. |
| `app/ui/` | Qt ana pencere, metadata, önizleme, analiz ve frekans panelleri. |
| `modules/metadata/` | PNG/JPEG/WebP kapsayıcı ayrıştırma ve yeniden kodlamasız blok kaldırma referansı. |
| `modules/c2pa/` | Python C2PA SDK adaptörü. |
| `modules/analysis/` | Piksel istatistikleri, histogramlar, FFT, DCT, RAPSD, bellek ve analiz sözleşmeleri. |
| `modules/reporting/` | JSON rapor dışa aktarımı. |
| `modules/quality/`, `modules/watermark/` | Kalite metriği ve watermark genişletme sözleşmeleri; tamamlanmış bir dedektör sistemi değildir. |
| `assets/themes/dark.qss` | Masaüstü koyu tema. |
| `tests/unit/`, `tests/integration/` | Python regresyonları ve Qt/workflow entegrasyon testleri. |
| `scripts/` | Benchmark ve masaüstü UI smoke araçları. |
| `docs/` | Mimari, matematiksel yöntemler, bellek/performans, güvenlik ve tarihsel test raporları. |
| `.kilo/` | Projeye ait geliştirme aracı yapılandırması, plugin, kayıtlar ve yerel bağımlılıklar. **Güncelleme notu:** Git'te `.kilo/plugin/kilo-agent-visualizer.js` ile birlikte `visual-events.jsonl`, `visual-events.1.jsonl` ve `visual-identities.json` oturum günlükleri de takip ediliyor (toplam ~6,5 MB). `.kilo/package.json` (`@kilocode/plugin 7.8.12`) ve `.kilo/.gitignore` ise takip edilmiyor. Günlüklerin depodan çıkarılması 15. bölümde. |
| `.git/` | Yerel Git geçmişi, branch ve remote bilgileri. |
| `.venv/` | Mevcut Windows Python sanal ortamı; başka bilgisayara taşınabilir kurulum kabul edilmemeli. |
| `build/`, `dist/` | Mevcut masaüstü paketleme ara çıktıları ve EXE dağıtımı. Güncel HEAD ile eşleşmeleri bu görevde doğrulanmadı. |
| `__pycache__/`, `.pytest_cache/` | Yeniden oluşturulabilir Python/test önbellekleri. |
| Kök PNG dosyaları | `c2pa-real-blocked-mobile.png`, `one-click-desktop.png`, `one-click-mobile-consent.png`: önceki UI çalışmalarından görsel kayıtlar. |
| `pr.txt` | Mevcut geçmiş çalışma/PR metni; güncel ürün sözleşmesinin yerine geçmez. |
| `AI-Footprint-Cleaner.spec` | Yerelde bulunan masaüstü PyInstaller yapılandırması; mevcut `git ls-files` listesinde yer almıyor, tam yedeğe dahil edilir. |

Kökte `README.md`, `PROJE_OZETI.md`, `SESSION_HANDOFF.md`, `CHANGELOG.md`, `pyproject.toml`, `requirements.txt` ve `.gitignore` bulunur. Bu incelemede kök `AGENTS.md` bulunmadı.

**Güncelleme notu:** Kökte `CLAUDE.md` de yok ve `.github/workflows/` (CI) bulunmuyor. Bunlar için hazırlanan `claude-setup.patch` henüz uygulanmadı. `CHANGELOG.md` yalnız masaüstü sürümlerini (0.1.0 – 0.2.0b1) içeriyor; web 0.1.0 ve sonraki C2PA/footprint işleri için kayıt yok.

## 3. Aktif web mimarisi

### Teknoloji ve sürümler

- Paket adı `ai-footprint-cleaner-web`, ürün paket sürümü `0.1.0`.
- `web/package.json` Node `>=24 <25` ister.
- Yerelde gözlenen araçlar: Node `v24.19.0`, npm `12.2.0`, Python `3.13.12`.
- Manifest aralıkları: React/React DOM `^19.2.0`, TypeScript `^5.9.3`, Vite `^7.1.9`.
- `web/package-lock.json` içindeki çözümlenmiş sürümler: React/React DOM `19.3.0`, TypeScript `5.9.3`, Vite `7.3.7`. Manifest aralığı ile lockfile sürümünün farklı yazılması tek başına tutarsızlık değildir.

### Akış ve dosya sorumlulukları

1. `web/src/main.tsx` dosya seçimini, taramayı, onayları, Worker yaşam döngüsünü ve doğrulanmış çıktıyı koordine eder.
2. `components/Home.tsx`, `Workspace.tsx`, `ConsentDialog.tsx` ve `Atmosphere.tsx` ekran bileşenlerini oluşturur.
3. `MetadataResults.tsx` metadata/kaynak sonuçlarını, filtreleri ve ayrıntıları gösterir.
4. `inspect.worker.ts` görsel tarama ve temizlemeyi; `video.worker.ts` video tarama ve disk çıktı akışını yürütür.
5. `protocol.ts` ana ekran ile Worker arasındaki istek/yanıt sözleşmesidir. `scan`, `clean`, `clean-c2pa`, `clean-footprints` ayrı işlemlerdir.
6. `engine.ts` görsel kapsayıcıları, metadata politikası, çıktı doğrulaması ve temizleme API'lerini içerir.
7. `footprints.ts` açık AI beyanı, metadata ipucu ve provenance kanıtlarını ayırır; onaylara göre işlem planı üretir.
8. `c2pa.ts`, `cbor.ts`, `c2pa-types.ts` kaynak beyanlarını okur; `c2pa-structure.ts` desteklenen gömülü deponun yapısını kontrol eder. **Güncelleme notu:** `readC2pa()` manifest içeriğini (Claim Generator, Actions, AI beyanı) **yalnız JPEG** için okur. PNG `caBX` ve WebP `C2PA` depoları yapısal olarak doğrulanıp kaldırılabilir, ama içerikleri okunmaz; bu dosyalarda AI beyanı olsa bile ekran „Dijital kaynak kaydı bulundu" (`PROVENANCE_ONLY`) gösterir.
9. `xmp.ts` dar XML/XMP alt kümesini ve yerel provenance referansı işlemlerini ele alır.
10. `media.ts` seçim, format ve parçalı okuma yardımcılarını; `output.ts` dosya sistemi çıktı yardımcılarını sağlar.
11. `video.ts` MP4/MOV box/table ayrıştırma, aynı uzunlukta dönüşüm ve doğrulamayı içerir.
12. `styles/tokens.css`, `global.css`, `components.css` tasarımı tanımlar; `style.css` bunları birleştirir.

**Güncelleme notu — kaynakta görülen ek ayrıntılar:**

- `main.tsx` (~27 KB) tek `App` bileşenidir: 16 `useState`, 15 `useRef` ve iç içe `busy`/`saving`/`committing`/`videoDone`/`operation` korumaları içerir.
- `inspect.worker.ts` video seçilirse hâlâ „Video işleme Faz 2 kapsamında değil" hatası verir. UI videoyu zaten `video.worker.ts`'e yönlendirdiği için bu mesaj normal akışta görünmez, ama eskidir.
- `inspect.worker.ts` meşgulken gelen mesajı sessizce yok sayar (`if (working) return`). UI bunu iptal/terminate ile yönettiği için bugün sorun çıkarmaz.
- `tsconfig.json` test dosyalarını (`src/*.test.ts`) hariç tutar; `npm run build` testleri tip denetiminden geçirmez.
- `npm test` içindeki test dosyası listesi elle yazılmıştır; yeni test dosyası eklenip listeye yazılmazsa çalışmaz.
- Lint/format aracı (ESLint, Prettier) yoktur; bazı satırlar 900 karakteri aşar.

### Sunucu ve gizlilik sınırı

`web/server.mjs`, yalnız derlenmiş `web/dist` içeriğini sunar. Medya upload endpoint'i, medya işleyen backend, Python runtime entegrasyonu veya uygulama analitiği yoktur. Dosya işleme tarayıcıdadır. Bu, video işlemlerinde yerel geçici disk kullanımı olmadığı anlamına gelmez.

Sunucu GET/HEAD dışındaki yöntemleri 405 ile reddeder; `/healthz` için `ok` döndürür. Dotfile, traversal ve symlink kontrolleri; CSP `connect-src 'none'`, `worker-src 'self'`; `nosniff`, frame reddi, referrer, COOP/CORP ve cache başlıkları bulunur. Bunlar kaynak incelemesidir; bu görevde canlı HTTP testi yapılmadı. Altyapının statik erişim logları tutmadığı iddia edilmez.

## 4. Görsel işleme davranışı ve sınırları

- Desteklenen temizleme formatları JPEG, PNG ve WebP'dir. Görsel üst sınırı 128 MiB, çözünürlük sınırı 40 megapikseldir.
- Kapsayıcı blokları kaldırılır; canvas/piksel yeniden kodlaması yapılmaz. Çıktı yeniden ayrıştırılır ve sıkıştırılmış görüntü payload hash'leri karşılaştırılır.
- Güvenli Mod varsayılandır. Kapsamlı mod, açık seçim ve gerekli hak onayıyla yalnız desteklenen JPEG ICC/JFIF ve WebP ICC alanlarını kaldırabilir. PNG ICC korunur.
- ICC kaldırılması renk yönetimini/görünümü değiştirebilir; “yeniden kodlama yok” renk görünümünün değişmeyeceği garantisi değildir.
- Orientation belirsizse veya 1 dışında ise ilgili kayıtlar korunur. Bilinmeyen/bozuk/şüpheli provenance sessizce temizlenmez.
- Normal metadata temizliğinin `cleaningBlocked` engeli korunur. Ayrı C2PA işlemi bu engeli genel olarak kaldırmaz.
- Metadata bütçesi 16 MiB, parça sayısı 4096; ayrıştırma ve okuma alt sınırları ayrıca uygulanır. Önizleme tüm metadata'nın eksiksiz okunması demek değildir.
- Görsel motoru tam dosyayı belleğe alır; kaynak, çıktı ve hash/Blob kopyaları nedeniyle bellek dosya boyutunun katlarına çıkabilir. Mobil bellek garantisi yoktur.

### Birleşik AI footprint akışı

Dosya seçimi otomatik taramayı başlatır. Ana `Remove AI Footprint` işlemi ayrı bir modal açmadan Worker'a `{ type: 'clean-footprints', c2paConsent: true, rightsConsent: false }` gönderir. Bu düğmenin kapsam açıklaması C2PA kaldırma içindir; ayrı hak onayı gerektiren metadata varsayılan korunur. Sonuç başarılı doğrulanırsa indirme ayrıca `Download` ile yapılır; dosya adı `orijinal-isim-removed.uzanti` biçimindedir.

**Güncelleme notu — onay tutarsızlığı:** Ana `Remove AI Footprint` düğmesi C2PA onayını koddan sabit `true` olarak gönderir ve pencere açmaz. Aynı C2PA deposunu kaldıran gelişmiş „Yalnız C2PA'yı Kaldır" düğmesi ise hâlâ „Yetkim var" onay penceresi ister. SSS'deki „C2PA kayıtları doğrulanıyor mu?" yanıtı da C2PA'nın „ayrı onayla" kaldırıldığını söyler; bu, ana akış için artık doğru değildir. Görsel çıktısı `-removed`, gelişmiş C2PA çıktısı `-c2pa-kaldirildi`, metadata çıktısı `-temiz`, video çıktısı `-temiz` sonekini kullanır.

Motor sonuçları `REMOVED_VERIFIED`, `PARTIALLY_REMOVED`, `BLOCKED`, `NOTHING_TO_REMOVE`, `VERIFICATION_FAILED` olarak ayrılır. `REMOVED_VERIFIED` yalnız desteklenen metadata dönüşümünün doğrulanmasıdır. Kalan kanıt veya eksik inceleme varsa kısmi sonuç bildirilir. Çıktı üretilmemesi gereken durumlar başarılı temizlik sayılmaz.

### C2PA ve XMP

Web motoru kriptografik imza, sertifika güveni veya manifest içerik hash doğrulaması yapmaz. Kaynak beyanları doğrulanmamış olarak ele alınır. C2PA varlığı tek başına AI üretimi sayılmaz; standart Digital Source Type gibi açık beyanlar ile araç adı/metin ipuçları ayrılır.

Desteklenen üst düzey depolar JPEG APP11, PNG `caBX`, WebP `C2PA` yapılarıdır. Gerekli koşullarda yalnız depoya tam bağlanan tek yerel XMP provenance alanı da birlikte kaldırılabilir. Uzak/çoğul/belirsiz referanslar, desteklenmeyen yapı ve bozuk metadata reddedilir. Depodaki üretici, telif, lisans ve Actions bilgileri de kaldırma kapsamında kaybolabilir. Harici manifestler ve görünmez filigranlar etkilenmez.

Gelişmiş `clean-c2pa` ve metadata temizleme işlemlerinin ayrı onay akışları vardır. C2PA onayı ile hak/telif onayı birbirinin yerine geçmez.

**Güncelleme notu — tanıma ve uyumluluk sınırları (kaynaktan):**

- Açık AI beyanı olarak yalnız IPTC `trainedAlgorithmicMedia` tanınır (C2PA Actions ve XMP `Iptc4xmpExt:DigitalSourceType`). `compositeWithTrainedAlgorithmicMedia` (AI ile düzenlenmiş) ve `algorithmicMedia` gibi diğer değerler AI beyanı sayılmaz.
- Metin ipuçları sabit bir araç listesine dayanır (Stable Diffusion, ComfyUI, AUTOMATIC1111, Midjourney, DALL·E, Adobe Firefly, „AI generated"; sonuç ekranında ayrıca „generated by ChatGPT"). Gemini, Imagen veya Google adları hiçbir listede yoktur. SynthID yalnız bir metadata/C2PA metninde „applied SynthID watermark" geçerse uyarı metni olarak gösterilir.
- JPEG'de MPF (`APP2 MPF`, çoklu görüntü — birçok telefon kamerası kullanır) varsa C2PA kaldırma desteklenmez.
- EXIF yön bilgisi bozuk, çoklu veya belirsizse (`orientation === null`) C2PA kaldırma `BLOCKED_MALFORMED_METADATA` ile engellenir (Truepic örneğinde görülen durum). Geçerli bir yön değeri (ör. 6) C2PA kaldırmayı engellemez; yalnız EXIF bloğunun silinmesini engeller.
- Remove akışında metadata yalnız „ayrı üretim parametresi" bloğu ise kaldırılır (PNG `parameters` metni, JPEG `AI parameters:` yorumu). EXIF ve XMP içindeki AI beyanları bütün blok olarak korunur; bu nedenle sonuç çoğu zaman `PARTIALLY_REMOVED` olur.

## 5. Video akışı

- MP4/MOV, en fazla 1.000.000.000 bayt (ondalık 1 GB).
- Dar destek: H.264 `avc1`, MJPEG `jpeg`, AAC `mp4a`, klasik MOV PCM `sowt`. Her bu codec dosyası kabul edilir anlamına gelmez.
- Fragmented/encrypted, HEVC/AV1/ProRes, harici medya referansı ve bilinmeyen yapılar genel destek kapsamında değildir.
- Parçalı okuma/yazma kullanılır. Metadata aynı uzunlukta `free` box/sıfırlama ile boşaltılır; medya ve `stco/co64` offsetleri kaydırılmaz. Dosya küçülmek zorunda değildir.
- Geçici çıktı OPFS'ye veya kullanıcının ayrıca seçtiği geçici klasöre yazılır; yeniden taranır ve tüm baytlar beklenen dönüşümle karşılaştırılır. Ancak bundan sonra ayrı hedefe yazılır; başarı hedef `close()` tamamlanınca gösterilir.
- File System Access ve ilgili disk API'leri gerekir. HTTPS/localhost ve uygun masaüstü Chrome/Edge temel hedeftir. Desteklenmeyen tarayıcıda video Blob indirme alternatifi yoktur.
- Kota tahmini garanti değildir. Geçici dosya ve hedef yazma kopyası ek alan gerektirir. Sekme/tarayıcı çökmesi geçici medya bırakabilir; otomatik cleanup garantisi yoktur.
- Native picker, gerçek normal profilde büyük video, Linux/Docker ve production kabulü ayrı açık doğrulama kapılarıdır. Önceki test adaptörü veya kota override başarısı bunların yerine geçmez.
- **Güncelleme notu:** Videoda `uuid`, `jumb` veya `c2pa` kutusu ya da provenance metni bulunursa video temizliğinin tamamı engellenir; videoda C2PA kaldırma ve „Remove AI Footprint" akışı yoktur (düğme yalnız görsellerde gösterilir).

## 6. Legacy Python masaüstü

Python gereksinimi `>=3.12,<3.16`; sabitlenen runtime bağımlılıkları `Pillow==12.3.0`, `PySide6==6.12.0`, `c2pa-python==0.38.0`, `numpy==2.5.4` olarak tanımlıdır.

Qt UI, servis/worker katmanı üzerinden metadata tarama ve kapsayıcı temizlemeyi yürütür. JPG/JPEG, PNG, WebP ve salt okunur TIFF incelemesi bulunur. Privacy/Advanced/Custom temizleme modları vardır. Masaüstünde JPEG C2PA kaldırma engellenir; PNG/WebP için desteklenen farklı politika vardır. Web ve masaüstü C2PA yetenekleri eşit kabul edilmemelidir.

`modules/c2pa/reader.py`, resmî SDK üzerinden manifest/imza/hash/trust incelemesi yapar; offline ayarlar kullanır. Bu SDK web runtime'ının parçası değildir. Piksel analizi ve frekans analizi masaüstü tarafındadır: histogramlar, tiled FFT, 8×8 DCT, RAPSD. Frekans sonuçları AI üretim kanıtı veya metadata sayımı değildir.

JSON raporlar Privacy-Safe ve açık onaylı Standard olarak ayrılır. Görsel İşleme/Toplu İşleme sayfaları ve watermark/quality sözleşmeleri tamamlanmış ürün yeteneği sayılmamalıdır.

Mevcut EXE yolu: `dist\AI-Footprint-Cleaner\AI-Footprint-Cleaner.exe`. EXE'nin güncel kaynaklardan yeniden derlendiği bu devir görevinde doğrulanmadı.

## 7. Yeniden çalışmaya başlama komutları

### Web — `web/` dizininde

```powershell
npm ci
npm test
npm run build
npm start
```

`npm ci` lockfile'a göre bağımlılıkları yeniden kurar ve ağ erişimi gerektirebilir. `npm test`, Node test runner ile medya/Worker/sunucu testlerini çalıştırır. Video fixture testleri yerel ffmpeg gerektirebilir. `npm run build`, `tsc --noEmit && vite build` çalıştırır. Ayrı lint scripti tanımlı değildir. `npm start` üretim build'ini sunar; varsayılan adres `http://localhost:3000`, ortam değişkeni `PORT` desteklenir. Geliştirme sunucusu için `npm run dev` vardır. Her iki sunucu da `0.0.0.0` dinleyebilir; yerel ağa açıklık göz önünde tutulmalıdır.

`web/tests/*-acceptance.js` tarayıcı kabul betikleri `npm test` tarafından kendiliğinden çalıştırılmaz. Playwright/tarayıcı ve çalışan build/sunucu ile ayrı yürütülür.

### Python — proje kökünde

```powershell
.\.venv\Scripts\python.exe main.py
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check
```

Yeni ortamda Python kurulduktan sonra `.venv` yeniden oluşturulup `requirements.txt` kurulmalıdır. Mevcut `.venv` yedeği aynı makinede kurtarma kolaylığı içindir; başka yola/OS'ye kopyalama garantisi değildir. Test/build araçları runtime gereksinimlerinden ayrı olabilir; `docs/DEPENDENCIES.md` ve ilgili araçları kontrol edin.

### Docker — `web/` dizininde

```powershell
docker build -t ai-footprint-web .
docker run --rm -p 3000:3000 ai-footprint-web
```

Dockerfile iki aşamalı Node 24 Alpine build kullanır. Runtime yalnız statik içerik ve sunucuyu taşır; Docker build testleri kendiliğinden çalıştırmaz.

## 8. Railway / yayın durumu

Belgelenen hedef halka açık web yayınıdır; login, üyelik, şifre veya erişim kısıtı eklemek kapsamda değildir. Root Directory `/web`; Dockerfile otomatik algılama; build/start override boş; healthcheck `/healthz`; Railway `PORT` desteği kullanılır. Uygulama için medya volume'u veya frontend secret gerekmez.

`web/railway.toml` mevcut eski uyumluluk dosyasıdır; yeni kurulumun tek dayanağı olarak kullanılmaması belgelenmiştir. Dashboard ayarları için `web/README.md` esas alınmalıdır. Oradaki Railway hizmet yaşam döngüsü bilgileri tarihli kayıtlardır; yeniden deploy öncesi resmî belgelerden tekrar kontrol edilmelidir.

Bu incelemede Railway'e bağlanılmadı, deploy yapılmadı ve gerçek production URL doğrulanmadı. Çalışan SHA, HTTPS domain, HTTP başlıkları ve production browser gizlilik/çıktı kabulü yeniden kaydedilmelidir.

## 9. Son geliştirme çizgisi

En yeni commit'lerden geriye doğru:

| Commit | İş |
|---|---|
| `302f531` | Uzay arka planı yıldız alanı ve upload kartı görünümü. |
| `ff7ae6b` | Footprint özet UI'si ve sonuçlara otomatik kaydırma. |
| `76582d1` | Doğrudan C2PA kaldırma ve onaya göre filtreleme. |
| `780895d` | Birleşik AI footprint tespit ve doğrulanmış kaldırma. |
| `5ce9b9c` | Kilo görsel olay/kimlik kayıtları. |
| `bd62965` | Yerel XMP provenance referanslarının atomik kaldırılması. |
| `b84fcd1` | Yapısal doğrulamalı gömülü C2PA store kaldırma. |
| `769bcf9` | Modüler bileşenler ve koyu temalı web UI. |

Son görsel çalışmada yıldız yoğunluğu yaklaşık %40 artırılmış, upload kartı daha belirgin yapılmıştır. Hareket/azaltılmış hareket tercihleri mevcut uygulama kapsamındadır; bu görevde görsel kabul yeniden yapılmadı.

## 10. Test kanıtları ve açık işler

### Geçmiş kanıtlar — bu görevde yeniden çalıştırılmadı

- Python belgelerinde 322 başarılı test ve `pip check` başarısı kayıtlıdır.
- Web belgelerinde farklı eski kaynak anlarına ait test sayıları ve Windows symlink atlamaları vardır. Bunlar güncel HEAD için tek bir doğrulama sonucu olarak birleştirilemez.
- 15 Kasım tarihli sabit fixture ölçümünde 11 girdi, 7 çıktı ve bağımsız SDK kontrolleri belgelenmiştir. Bazı girdiler güvenli biçimde engellenmiş, çıktılar kısmi sonuç olmuştur; genel üretici uyumluluğu iddiası değildir.
- Bu fixture ölçümünün `report.json` dosyası repository dışında geçici dizindedir. Proje ZIP'i onu içermez. Yol ve ölçüm ayrıntısı `web/README.md` içindedir.
- Bazı eski aşamalarda iki bağımsız reviewer, Linux symlink, native picker ve production kabulü tamamlanamamıştır. Sonraki geliştirmeler eski aşamaların eksik kapılarını kendiliğinden kapatmaz.

### Güncelleme notu — 17 Kasım 2026 Linux test koşusu

- HEAD `302f531` üzerinde, `web/` dizininde Node test runner ile 13 test dosyasının tamamı çalıştırıldı.
- Ortam: Linux, Node **v22.23.4** (proje Node 24 ister; tür ayıklama Node 22'de de çalıştı).
- Sonuç: **214 test, 214 geçti, 0 hata, 0 atlandı.** Windows'ta atlanan symlink güvenlik testi Linux'ta çalıştı ve geçti.
- `npm ci`, `tsc --noEmit`, `vite build`, Docker ve tarayıcı kabulü çalıştırılmadı (bağımlılık kurulumu için ağ yoktu). Node 24 ile ve build dahil yeniden koşu CI'a bırakılmıştır.
- ZIP'teki kaynak, satır sonları dışında bu HEAD ile aynıdır; sonuç ZIP için de geçerlidir.

### Güncelleme notu — fixture kapsamı

- 11 fixture'ın hiçbiri `REMOVED_VERIFIED` sonucu vermedi: 7 `PARTIALLY_REMOVED`, 3 `BLOCKED`, 1 `NOTHING_TO_REMOVE`.
- Fixture'ların hiçbiri Google/Gemini, OpenAI veya başka bir son kullanıcı AI üreticisinin gerçek çıktısı değildir. Projenin bugünkü hedefi (Gemini görselleri) için uyumluluk kanıtı yoktur.
- Kabul betikleri ve fixture harness'i Windows'a özgü sabit yollar içerir (`C:/_projectsmert/...`, `C:/Users/Mert/AppData/Local/Temp/...`): `browser-acceptance.js`, `atmosphere-acceptance.js`, `video-browser-acceptance.js`, `ui-audit-acceptance.js`, `footprints-fixtures.mjs`. Başka makinede veya CI'da doğrudan çalışmazlar.

### Yeniden başlandığında önerilen sıra

> **Güncelleme notu:** Aşağıdaki sıra geçerliliğini korur; ayrıntılı ve önceliklendirilmiş hâli 15. bölümdedir.

1. `git status` ve HEAD'i kontrol ederek yedek sonrası değişiklikleri belirleyin.
2. Node 24 ve uygun Python ortamını doğrulayın; bağımlılıkları lockfile/sabit sürümlerle kurun.
3. Web test/build ve Python test/bağımlılık kontrollerini çalıştırın; yeni test sayılarını ve atlamaları kaydedin.
4. Gerçek tarayıcıda JPEG/PNG/WebP ana footprint akışını, gelişmiş onayları, kısmi/engelli sonuçları ve indirilen dosyayı kontrol edin.
5. Üretici uyumluluğu için gerçek/orijinal dosyalar kullanın. Sentetik veya SDK conformance fixture'larını son kullanıcı üretici uyumluluğu kanıtı saymayın.
6. Video için native picker/izin, normal profil kota, 500 MB/1 GB disk, kaynak/çıktı stream hash ve çökme/cleanup kabulünü ayrı ele alın.
7. Yayın yapılacaksa Docker/Linux, gerçek Railway SHA/domain ve production browser ağ/çıktı kabulünü tamamlayın.
8. Eski kök belgelerin güncellenmesini ayrı bir dokümantasyon işi olarak ele alın.

## 11. Belge okuma sırası ve eskimiş bilgiler

1. **Bu dosya:** Geliştirmeye ara verme anının birleştirilmiş özeti.
2. **Güncel kaynak ve lockfile:** Gerçek davranış ve bağımlılık sürümlerinin ilk kaynağı.
3. **`web/README.md`:** Güncel web sözleşmeleri, yeni footprint/C2PA akışı, sınırlar ve tarihli kabul raporları. İçindeki eski tarihli bölümler güncel başarı iddiası değildir.
4. **`README.md`, `PROJE_OZETI.md`:** Genel/legacy bağlam için yararlı, ancak sonraki C2PA/footprint gelişmelerinin tamamını yansıtmaz. Kök README'deki webin C2PA kaldırmadığı ifadesi artık dar destekli ayrı kaldırma akışını doğru anlatmaz.
5. **`SESSION_HANDOFF.md`:** Eski devir notudur. Video başlamadı veya C2PA kaldırma yok gibi eski durumlar güncel kabul edilmemelidir. Paket aralıkları ile lockfile sürümlerini karıştırmayın.
6. **`docs/`:** `ANALYSIS_ARCHITECTURE`, `DASHBOARD_ARCHITECTURE`, `FREQUENCY_ARCHITECTURE`, `MEMORY_MODEL`, `KNOWN_LIMITATIONS`, `SECURITY_AUDIT`, `DEPENDENCIES` ve ilgili test/performans belgeleri tarihsel masaüstü teknik başvurularıdır.

Eski belgeler bu görevde değiştirilmedi. Çelişkiler bu dosyada işaretlendi; güncel kaynak kazanır.

## 12. Yerel durum ve tam yedek kapsamı

Başlangıçta mevcut değişiklikler şunlardı; içerikleri değiştirilmedi:

```text
 M .kilo/visual-events.jsonl
 M .kilo/visual-identities.json
```

Bu görevde oluşturulan belge: `GELISTIRME_DEVIR_OZETI_2026-11-18.md`. Uygulama kaynaklarına müdahale edilmedi; commit/push yapılmadı.

İlk tam dosya envanteri **16.553 dosya / 1.768.710.169 bayt** ölçtü. Bu sayı belge oluşturulmadan öncedir; arşivleme anında yerel araç kayıtları değişebilir. Başlıca alanlar: `.venv` yaklaşık 1,125 GB, kök `dist` yaklaşık 491 MB, `.kilo` yaklaşık 62 MB, `web` yaklaşık 60 MB, `build` yaklaşık 24 MB (ondalık, sıkıştırılmamış).

ZIP, tüm proje dizininin yedeği olarak hazırlanır: kaynaklar, fixture'lar, belgeler, bu özet, `.git`, `.kilo`, `.venv`, bağımlılıklar, önbellekler ve mevcut build/EXE çıktıları dahildir. ZIP'in kendisi arşive eklenmez. Girdi dosyaları silinmez/taşınmaz. Haricî geçici klasörler, global Kilo ayarları, sistem araçları, tarayıcı OPFS alanı ve Railway servis durumu proje dizini dışında olduğundan dahil değildir.

**Güncelleme notu — iki ayrı arşiv:** Yukarıdaki tanım tam yedeğe aittir. Ayrıca paylaşılan `AI-Footprint-Cleaner-KAYNAK-2026-11-18.zip` farklı bir pakettir: 188 dosya, ~1,6 MB açılmış, ~0,8 MB sıkıştırılmış. İçinde `.git`, `.venv`, `build`, `dist`, `node_modules` ve `.kilo` günlükleri **yoktur**; kaynaklar, belgeler, fixture'lar, `.kilo/plugin`, `.kilo/package.json`, `AI-Footprint-Cleaner.spec`, `web/tsconfig.tsbuildinfo` ve bu özet vardır. İçerik HEAD `302f531` ile karşılaştırıldı: tek fark bazı dosyaların Windows satır sonlarıyla (CRLF) kaydedilmiş olması (`web/src/main.tsx` karışık CRLF/LF, `pr.txt`, `docs/*.json`). Kaydedilmemiş kod değişikliği yoktur. Git geçmişi bu pakette olmadığı için geri yüklemede GitHub'daki depo esas alınmalıdır.

**Gizlilik:** Bu tam arşiv kamuya dağıtılacak temiz kaynak paketi değildir. Git geçmişi, yerel araç kayıtları, makine yolları ve eski çalışma bilgilerini içerir; şifreli değildir. Dosya adı taramasında yalnız bağımlılıkların CA sertifikası `cacert.pem` örnekleri görüldü; bu bir sır taraması veya geçmişte hassas içerik bulunmadığı garantisi değildir. Güvenli/özel depolamada tutulmalıdır.

**Geri yükleme:** ZIP'i yeni/boş bir klasöre açın; mevcut çalışma dizininin üzerine körlemesine çıkartmayın. Arşiv proje kök klasörünü içerir. SHA-256 ve ZIP içerik/bütünlük doğrulama sonucu teslim mesajında verilir. Git geçmişi taşınır, ancak taşınan `.venv` ve eski build çıktıları yerine gerektiğinde ortamı yeniden kurup build alın.

## 13. Bu incelemenin kapsamı

Dizinin tamamı dosya sayısı/boyutu ve arşiv kapsamı bakımından tarandı. Kaynak mimarisi, manifestler, test listeleri, belgeler ve yakın Git geçmişi incelendi; masaüstü bölümü ayrıca salt okunur alt incelemeyle değerlendirildi. Bağımlılıkların, binary dosyaların ve bütün tarihsel kayıtların her satırı okunmadı. Tüm dosyaları arşivlemek ile tüm dosyaların içeriğine güvenlik denetimi yapmak farklıdır. Bu belge bir tam güvenlik audit'i veya yeniden çalıştırılmış ürün kabul raporu değildir.

## 14. Kaynak okuma bulguları (18 Kasım güncellemesi)

**Okunan kapsam:** `web/src` altındaki bütün kaynak dosyaları satır satır (`engine.ts`, `footprints.ts`, `results.ts`, `c2pa.ts`, `c2pa-structure.ts`, `cbor.ts`, `xmp.ts`, `media.ts`, `output.ts`, `protocol.ts`, `inspect.worker.ts`, `video.worker.ts`, `main.tsx`, `MetadataResults.tsx`, `components/*`); `video.ts` yapı ve sınır kontrolleri düzeyinde; `server.mjs`, `Dockerfile`, `railway.toml`, `index.html`, `tsconfig.json`, `package.json`, stil dosyaları; test dosyalarının kapsamı ve sayıları; kabul betikleri ile fixture harness'i; kök ve web belgeleri; legacy Python modüllerinin yapısı. Legacy Python testleri ve `docs/` altındaki tarihsel ölçümler yeniden çalıştırılmadı.

**Sağlam bulunanlar:**

- Kayıpsız temizlik zinciri tutarlı: her işlem çıktıyı yeniden ayrıştırıyor, tutulan blokları bayt bayt ve kodlanmış görüntü yükünü SHA-256 ile karşılaştırıyor; doğrulanmayan çıktı hiçbir yolda kullanıcıya verilmiyor.
- Ayrıştırıcılar sınırlı ve fail-closed: PNG CRC/sıra, JPEG marker/SOS, WebP RIFF/VP8X bayrakları, JUMBF derinlik/kutu sayısı, CBOR öğe/derinlik, XMP düğüm/ad alanı bütçeleri, C2PA okumada 250 ms süre sınırı.
- Statik sunucu ve CSP gizlilik iddiasıyla uyumlu (`connect-src 'none'`, yalnız GET/HEAD, symlink/traversal kontrolleri, istek zaman aşımları).
- Arayüz metinlerinin çoğu dürüst sınırları zaten söylüyor („tüm AI izlerini kaldırmaz", „görünmez filigranlar etkilenmez", „C2PA imzası doğrulanmaz").

**Düzeltilmesi gerekenler (önem sırasıyla):**

1. **Hedef ile kanıt arasındaki boşluk:** Proje Gemini görsellerini hedefliyor, ama gerçek Gemini/Google dosyasıyla hiç test yok; PNG/WebP C2PA içeriği okunmuyor; „AI beyanı" tanıması tek bir IPTC değerine dayanıyor.
2. **Onay ve metin tutarsızlıkları:** Ana Remove onaysız, gelişmiş C2PA kaldırma onaylı; SSS eski akışı anlatıyor; dosya adı sonekleri dört farklı.
3. **Dil karışıklığı:** Türkçe arayüzde İngilizce etiketler („Remove AI Footprint", „Download", „File Type", „Image Size / Width × Height", „Megapixels", „C2PA Status", „Content authenticity present but unverified").
4. **Doğrulama altyapısı:** CI yok; kabul betikleri ve fixture harness'i tek makineye bağlı; testler tip denetiminden geçmiyor; test listesi elle yazılı.
5. **Bakım yükü:** Tek parça `main.tsx`; lint/format yok; karışık satır sonları; belgeler kodun gerisinde (kök README, `PROJE_OZETI.md`, `SESSION_HANDOFF.md`, `CHANGELOG.md`).
6. **Performans ölçülmemiş:** `cleanFootprints` tek işlemde dosyayı 10'dan fazla kez ayrıştırıyor ve birden çok tam kopya oluşturuyor; 128 MiB sınırına yakın görsellerde süre ve bellek ölçülmedi.
7. **Yayın:** Docker/Linux, Railway ve production tarayıcı kabulü hâlâ yapılmadı; hash'li statik dosyalar da `no-store` ile sunuluyor; favicon yok.

## 15. Yapılacaklar

Öncelik sırasıyla. Her madde ayrı branch ve PR olarak ele alınmalı; CI yeşil olmadan birleştirilmemeli.

### P0 — Altyapı (önce bunlar)

- [ ] `claude-setup.patch`'i uygula (`CLAUDE.md`, `.github/workflows/web-ci.yml`, `.gitignore`).
- [ ] `.kilo` günlüklerini depodan çıkar: `git rm --cached .kilo/visual-events.jsonl .kilo/visual-events.1.jsonl .kilo/visual-identities.json`.
- [ ] Kökte `.gitattributes` oluştur (`* text=auto eol=lf`), ardından `git add --renormalize .` ile satır sonlarını tek tipe getir (ayrı commit).
- [ ] PR aç, CI'ın Node 24 ile `npm ci`, `npm test`, `npm run build` koşusunun yeşil olduğunu gör.
- [ ] Bu özeti `docs/history/` altına taşı; `SESSION_HANDOFF.md`'yi kaldır veya bu belgeye yönlendir.

### P1 — Kullanıcıya söylenenlerin doğruluğu

- [ ] Onay politikasına karar ver ve tek tip uygula: ana Remove ile „Yalnız C2PA'yı Kaldır" aynı kuralı izlesin.
- [ ] SSS'deki C2PA yanıtını güncel akışa göre yeniden yaz.
- [ ] Sonuç ekranına açık cümle ekle: „Piksel içi filigranlar (ör. SynthID) bu araçla kaldırılmaz."
- [ ] Başlıkları hizala: „AI ayak izi kaldırma sonucu hazır" yerine kaldırılanı tam söyleyen başlık.
- [ ] İngilizce etiketleri Türkçeleştir (veya bilinçli olarak İngilizce bırakma kararını `CLAUDE.md`'ye yaz).
- [ ] Çıktı dosya adı soneklerini tek kurala bağla (`-removed` / `-temiz` / `-c2pa-kaldirildi`).
- [ ] `inspect.worker.ts` içindeki eski „Faz 2" hata mesajını düzelt.
- [ ] Kök `README.md` ve `PROJE_OZETI.md`'deki „web C2PA kaldırmaz" ifadesini düzelt; `CHANGELOG.md`'ye web 0.1.0 ve sonraki işleri ekle.

### P2 — Motor (bugünkü hedefe göre)

- [ ] Gerçek dosya seti: kendi ürettiğin Gemini (ve kullanmayı düşündüğün diğer araç) görsellerinden yerel, hash'li bir liste; depoya ikili dosya koymadan. Her dosya için beklenen sonucu yaz.
- [ ] `readC2pa()`'yı PNG `caBX` ve WebP `C2PA` depolarını okuyacak şekilde genişlet (depo baytları `parse()` içinde zaten ayrılıyor).
- [ ] „AI beyanı" sayılacak `DigitalSourceType` değerlerini tek listede topla (`compositeWithTrainedAlgorithmicMedia` dahil); şu an `results.ts`, `footprints.ts`, `xmp.ts`, `c2pa.ts` içinde dağınık.
- [ ] JPEG MPF (telefon fotoğrafları) için C2PA kaldırma desteğini değerlendir.
- [ ] Fixture harness'i ve kabul betiklerindeki sabit Windows yollarını ortam değişkeni veya göreli yola çevir.

### P3 — Kod kalitesi

- [ ] ESLint + Prettier ekle; toplu biçimlendirmeyi ayrı commit yap.
- [ ] `npm test`'i glob'a çevir (`node --test "src/**/*.test.ts" server.test.mjs`).
- [ ] Testleri tip denetimine al (ayrı `tsconfig.test.json` + `tsc -p`).
- [ ] `main.tsx`'i `useReducer` tabanlı durum makinesine ve görsel / video / gelişmiş araçlar parçalarına böl.
- [ ] Playwright kabul testlerini `@playwright/test` ile CI'a bağla.
- [ ] 128 MiB'a yakın görsellerde `cleanFootprints` süre ve belleğini ölç; gerekirse tekrar eden ayrıştırmaları azalt.

### P4 — Yayın

- [ ] Linux'ta `docker build` / `docker run` ve `/healthz` kontrolü.
- [ ] Railway'e gerçek deploy; HTTPS'te başlıkları, CSP'yi ve medya içeren ağ isteği olmadığını kontrol et.
- [ ] Hash'li `/assets/*` için `Cache-Control: public, max-age=31536000, immutable`; `index.html` için `no-store` kalsın.
- [ ] Favicon / uygulama ikonu ekle.

### P5 — Depo ve ürün kararları

- [ ] Python masaüstünü `legacy/desktop/` altına taşı ya da bir git tag'iyle arşivleyip ana daldan çıkar.
- [ ] Kök PNG ekran görüntülerini ve `pr.txt`'yi `docs/` altına taşı.
- [ ] Ürün adı ve konumlandırma kararı: „AI Footprint Cleaner" mı, gizlilik/metadata aracı mı?
