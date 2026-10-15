# Tarayıcı tabanlı web temeli

Bu dizin Windows masaüstü uygulamasından bağımsız React/Vite web temelidir. Node sunucusu yalnızca derlenmiş `dist` dosyalarını sunar; Python, ExifTool, kullanıcı dosyası depolama veya yükleme API'si çalıştırmaz. Faz 2 motoru JPEG, PNG ve WebP kapsayıcılarını tarar, seçilen desteklenen metadata bloklarını yeniden sıkıştırmadan kaldırır ve çıktıyı yeniden ayrıştırıp doğrular. Faz 3 MP4/MOV motoru sınırlı, parçalı video taraması ve doğrulanmış doğrudan disk çıktısı ekler. Doğrulama başarısızsa indirme sunulmaz.

## Yerel çalışma ve kontroller

Node.js 24 ve npm kullanın. Aşağıdaki komutları `web` dizininde çalıştırın; React/Vite paketinin `package.json` ve `package-lock.json` dosyalarının mevcut olması gerekir:

```sh
npm ci
npm run build
npm test
npm start
```

`npm run build`, `tsc --noEmit && vite build` çalıştırır ve `web/dist` üretir. `npm start`, `node server.mjs` çalıştırır. Sunucu `0.0.0.0` üzerinde `PORT` ortam değişkenini, yoksa `3000` portunu kullanır. `npm test` hem TypeScript medya testlerini hem sunucu testlerini çalıştırır. Docker imajı testleri kendiliğinden çalıştırmaz.

```sh
docker build -t ai-footprint-web .
docker run --rm -p 3000:3000 ai-footprint-web
```

İki aşamalı Node 24 Alpine imajında `npm ci` ve derleme build aşamasındadır. Çalışma aşamasına yalnızca `dist` ve `server.mjs` kopyalanır; uygulama `node` kullanıcısı olarak çalışır. Çalışma zamanı npm bağımlılığı yoktur. İmaj etiketi hareketlidir; tekrarlanabilir üretim sürümü için doğrulanmış digest sabitlemesi ayrıca yapılmalıdır.

## Railway

1. Depoyu Railway servisine bağlayın; **Root Directory** değerini `/web` yapın.
2. **Railway Config File** yolunu `/web/railway.toml` olarak belirtin. Bu yol root directory ayarına göre göreli değildir.
3. Dockerfile builder ve `Dockerfile` yolunu seçin. Docker CMD `node server.mjs` olduğundan ek build/start override gerekmez.
4. Healthcheck yolu `/healthz`, zaman aşımı 30 saniyedir. Railway'in sağladığı `PORT` değerini kullanın ve public domain oluşturun.

`/healthz` işlemin çalıştığını bildirir; bütün frontend dosyalarının doğruluğunu veya temizleme işlevini doğrulamaz. Bu çalışma herhangi bir deploy veya domain oluşturmaz.

12 Ekim 2026 tarihinde kontrol edilen resmi belgeler:
- [Monorepo / Root Directory ve config yolu](https://docs.railway.com/guides/monorepo)
- [Config as Code ve Dockerfile/healthcheck alanları](https://docs.railway.com/reference/config-as-code)

İkinci belge Config as Code özelliğini deprecated olarak işaretliyor ve mevcut dosyaların legacy servislerde 1 Aralık 2026'ya kadar çalışacağını belirtiyor. Bu nedenle istenen `railway.toml` uyumluluk dosyasıdır; yeni serviste destek garanti edilmez. Gerekirse aynı Dockerfile ve healthcheck ayarlarını dashboard üzerinden uygulayın; Infrastructure as Code geçişi bu temelin kapsamı dışındadır.

## Gizlilik ve sunucu sınırı

- Seçilen dosyanın içeriği ve adı tarayıcıda kalmalıdır; adı URL, query string, telemetry, hata raporu veya sunucu isteğine eklenmemelidir. Sunucu dosya adı/URL loglamaz; upload endpoint içermez. GET/HEAD dışındaki yöntemler gövdeyi beklemeden veya buffer'a almadan 405 ile kapatılır.
- Railway altyapısının erişim logları statik istek URL'lerini görebilir. Bu, altyapı düzeyinde hiç log tutulmadığı iddiası değildir. Uygulama kullanıcı dosya adlarını hiçbir isteğe eklememelidir; kullanıcı elle hassas bilgi içeren URL açarsa bu statik sunucu bunu altyapıdan gizleyemez.
- CSP `connect-src 'none'` ile fetch/WebSocket bağlantılarını engeller ve `worker-src 'self'` ile aynı origin'den derlenmiş worker kullanımına izin verir. Inline script/style ve blob worker izinli değildir. Yeni frontend bu kısıtlarla uyumlu olmalıdır.
- Sunucu MIME türleri, HEAD, uzantısız SPA rotaları, güvenli hata yanıtları ve dotfile/traversal/symlink reddi sağlar; eksik asset ve `/api`, `/upload`, `/uploads` rotaları SPA'ya dönüşmez. Çalışma dizini güvenilir, deploy sonrası değiştirilmez statik içerik olmalıdır. Eşzamanlı kötü niyetli yerel dosya sistemi değişikliklerine karşı izolasyon garantisi verilmez; servis kullanıcısına yazma erişimi verilmemelidir.

## Yerel işleme sınırları ve sonraki aşama

Video sınırı ondalık **1 GB = 1.000.000.000 bayt**; Faz 3 UI MP4/MOV kabul eder. Görsel üst sınırı **128 MiB = 134.217.728 bayt**, boyut sınırı **40 megapiksel**, tek parça **64 MiB**, toplam metadata **16 MiB**, parça sayısı **4096**, kayıt önizlemesi **512 karakter**. Bunlar sunucu upload limitleri değil yerel güvenlik sınırlarıdır. Sınırlar mobil/bellek performansı garantisi değildir.

Faz 1'deki sınırlı başlık okuma yardımcıları `src/media.ts` içinde korunur; Faz 2 görsel motoru yalnız <=128 MiB görsel için Worker içinde tam dosyayı okur. Orijinal, çıktı ve hash scratch/Blob kopyaları nedeniyle toplam bellek dosya boyutunun birkaç katına çıkabilir; mobil bellek garantisi yoktur. Görsel piksel decode veya canvas yeniden kodlaması yapılmaz. İptal/kaynak değişimi Worker'ı sonlandırır; eski yanıtlar kimlik kontrolüyle yok sayılır ve indirme URL'leri bırakılır. Worker 120 saniyede sonuçlanmazsa iptal edilir. Bu tam dosya belleği davranışı videoya uygulanmaz. `src/media.ts` ayrıca sıralı, geri basınçla tüketilebilen parçalı okuma iteratorü sağlar; tüm videoyu `arrayBuffer()` ile belleğe almak uygun değildir. Eski `inspect()` yardımcısı yalnız başlık ön kontrolüdür; Faz 2 UI bunun yerine tam görsel kapsayıcı motorunu çağırır. MIME bilgisine güvenilmez; uzantı ve gerçek görsel formatı eşleşmelidir. MP4/MOV için ayrı video Worker kullanılır. `src/output.ts` kullanıcı etkileşimiyle File System Access handle alır. Video Blob indirme alternatifi yoktur; desteklenmeyen tarayıcıda tarama yapılabilir ama video kaydı açık hatayla reddedilir. Görsel çıktısı doğrulanmış Blob ile indirilir.

## Faz 3 video çıktı ve gizlilik sözleşmesi

- MP4/MOV artımlı `Blob.slice()` ile Worker içinde işlenir. Tüm videoyu/çıktıyı RAM'e alma, medya decode veya yeniden kodlama yoktur.
- Güvenli metadata temizliği aynı uzunlukta `free` box/yerinde sıfırlama kullanır; dosya uzunluğu, `moov` konumu ve `stco/co64` tabloları kaydırılmaz. Bilinmeyen/güvenle desteklenmeyen kapsayıcılar reddedilir; tüm metadata temizlendi iddiası yoktur.
- Kaydetme butonu kullanıcı hareketiyle ayrı adlı hedef seçtirir. Varsayılan olarak origin-private file system (OPFS), isteğe bağlı olarak ayrı bir kullanıcı tıklamasıyla seçilen yerel geçici klasör kullanılır. OPFS öncesi `navigator.storage.estimate()` çağrılır; tahmini kullanılabilir alan `source.size + 1 MiB` altındaysa veya tahmin bilinmiyorsa işlem yazmadan durur. Tahmin kapasite garantisi değildir. Kullanıcı klasörü seçilirse OPFS kullanılmaz; yerel diskin boş alanını sorgulayan standart API olmadığı için yerel kapasite garantisi verilmez. Seçilen alanda geçici dosya yazılır, yeniden taranır ve beklenen dönüşümle tüm baytları parçalı karşılaştırılır. Ancak doğrulama başarılıysa hedefe sıralı yazılır ve `close()` sonrası başarı gösterilir. Commit öncesi hata/iptalde hedef `abort()` edilir; doğrulama başarısızsa hedefe yazılmaz. `close()` başladıktan sonra iptal ve kaynak değişimi kapatılır, gerçek disk sonucu beklenir; yayınlama 120 saniyeyi aşarsa bekleyen/belirsiz sonuç uyarısı gösterilir ve sonradan gelen gerçek sonuç izlenir. Kullanıcı bu belirsizliği açıkça kabul ederek izlemeyi bırakıp seçimi sıfırlayabilir; bu geri alma/iptal değildir. Cleanup beklemesi 10 saniyeyle sınırlıdır; timeout uyarısı başarılı hedef kaydını gizlemez. close/abort hatasında sonuç belirsiz olarak bildirilir. İptal kapanışı 10 saniyede sonuçlanmazsa Worker sonlandırılır ve olası hedef/geçici dosya için belirsizlik uyarısı verilir. Kaynak File handle kimliği mevcut değildir: aynı adlı hedef reddedilir ama yeniden adlandırılmış kaynak kimliği saptanamaz; ayrı hedef seçin ve kaynağı işlem sırasında taşımayın/yeniden adlandırmayın. Tarayıcının dosya seçicisi boş hedef oluşturabilir; bu başarılı çıktı değildir.
- Bu işlem için yeterli yerel disk/kota gerekir (geçici dosya ve tarayıcının hedef yazma kopyası nedeniyle dosya boyutunun birkaç katı). RAM/bellek sınırları tarayıcı uygulamasının iç buffer'ları için garanti değildir. Yalnız bu işlemin UUID adlı geçici dosyası normal başarı/hata/iptalde silinmeye çalışılır; kullanıcı klasöründeki silme/kimlik hatası uyarısı tam geçici dosya adını verir. Mevcut ada çakışma ve hedefle aynı kimlikte silme/yazma reddedilir. API exclusive-create sağlamadığından UUID varlık kontrolü ile oluşturma arasında teorik yarış sınırı vardır. Sekme/tarayıcı çökmesinde OPFS veya seçilen klasörde, seçilmeyen metadata'yı hâlâ içeren geçici medya kalabilir; kullanıcı klasöründeki dosya elle kaldırılmalıdır. Artık dosyalar diğer etkin sekmelerle çakışmamak için otomatik silinmez; tarayıcı site verileri temizlenerek kaldırılabilir. Bu, önceki fazların kalıcı depolama kullanmama davranışından video kaydetmeye özgü açık bir farktır; kaynak dosya sunucuya gönderilmez.
- Güncel masaüstü Chrome/Edge üzerinde HTTPS veya localhost ve File System Access + OPFS gerekir; özellik tespiti yapılır. Native dosya seçici/izin ve tarayıcı sürümü davranışı cihazda ayrıca doğrulanmalıdır. [Chrome resmi File System Access belgesi](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), 12 Ekim 2026 kontrolü: kullanıcı hareketi, secure context ve yazıların `close()` ile yayınlanması.
- Telif/hak alanları varsayılan korunur. C2PA/UUID/belirsiz provenance temizliği engeller; imza doğrulama veya kaldırma yapılmaz. Görünmez filigran kaldırma ya da AI dedektörlerini yanıltma garantisi yoktur.

## Masaüstü kurallarının yeniden kullanımı

`../modules/metadata/containers.py` davranış referansıdır; bu Python dosyası web sunucusunda çalıştırılmaz. `src/engine.ts` PNG CRC/chunk sırası ve animasyon reddini, JPEG marker/frame/scan ve sondaki ek veri kontrollerini, WebP RIFF uzunluğu/padding/VP8X bayrakları ve animasyon reddini uygular. `classify`, `inventory`, `payload_hashes`, `strip` kuralları; ICC/APP1/APP2/APP11 koruması, yalnızca seçili metadata kaldırımı, WebP bayrak düzeltmesi ve sıkıştırılmış görüntü yükünün hash eşitliğiyle doğrulanması dahil aktarılmalıdır. Bilinmeyen kapsayıcılar sessizce yeniden yazılmamalıdır.

Referans regresyonlar `../tests/unit/test_hardening.py`, `../tests/unit/test_workflow.py` ve `../tests/unit/test_review_regressions.py` içindedir. Proje kökünde Windows kontrolleri:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check
```

## Faz 2 kullanım ve güvenlik politikası

1. Tek JPEG/PNG/WebP seçin; dosya adı ve metadata yalnız yerel UI'da gösterilir. `Yerel metadata ayrıntısı` düz metindir; XML/HTML yürütülmez.
2. Liste kapsayıcı/blok bazlıdır; EXIF/XMP alt alanları bağımsız düzenlenmez. Mevcut Software/CreatorTool/model/prompt/seed değerleri yalnız mevcut kayıt metninden gösterilir; AI model/üretim tahmini yapılmaz.
3. Temizlenebilir blokları seçin. ICC daima korunur. İlk motor sürümü EXIF/XMP/IPTC/metin bloklarının telif/üretici bilgileri içerebileceğini varsayar; güvenli kaldırılabilir blokların tamamı hak onayı verilene kadar korunur. Bu, blokta telif kaydı bulunduğunun kesin tespiti değildir. Orientation belirsiz veya 1 dışında ise ilgili yön bilgisini taşıyan blok korunur. Bilinmeyen veya güvenli ayrıştırılamayan kayıtlar korunur.
4. Telif/hak yönetimi kayıtları varsayılan korunur. `Telif/hak kayıtlarını kaldırmaya yetkiliyim` onayı yalnız motorun uygun bulduğu hak bloklarının seçimine izin verir; C2PA veya desteklenmeyen bloklara yetki vermez. Bu onay hukuki uygunluk garantisi değildir.
5. C2PA/JUMBF veya opak kaynak kaydı saptanan dosyada tüm temizleme engellenir. Sıkıştırılmış PNG metni, >1MiB metin/gömülü raw profil, bilinmeyen APP1 ve güvenle çözülemeyen XMP kodlaması/DTD/entity içerikleri de kaynak belirsizliği nedeniyle tüm temizlemeyi engeller. UTF-16/32 XMP ve UTF-8 dışı/bozuk kodlamalar desteklenmez; literal Orientation içeren XMP korunur. C2PA kayıt varlığı ile kriptografik doğrulama farklıdır: SDK/imza/zincir doğrulaması ve C2PA kaldırma yoktur. Bilinmeyen/uzak/alışılmadık kayıtların yokluğu garanti edilmez.
6. `Seçilenleri temizle` sonrası çıktı yeniden ayrıştırılır; seçili blokların kaldırılması, kalan bloklar, format/çözünürlük/alpha/orientation ve görüntü payload eşitliği doğrulanır. Payload SHA-256 gösterilir. Codec bitstream tam decode edilmez; sıkıştırılmış payload aynı tutulur.
7. Yalnız doğrulanmış Blob `İndir` ile ayrı adla indirilir. Kaynak değiştirilmez, otomatik kaydetme yoktur. İptal, yeni dosya ve seçim/politika değişimleri eski çıktıyı geçersiz kılar.

## Faz 3 destek kapsamı ve kabul — 12 Ekim 2026

- Dar codec/sample-entry kapsamı: H.264 `avc1`, MJPEG `jpeg`, AAC `mp4a`, klasik MOV PCM `sowt`. Bu allowlist tüm bu codec dosyalarının kabul edileceği anlamına gelmez; kapsayıcı/tablo/brand/handler sınırları da uygulanır. HEVC, AV1, ProRes, fragmented/encrypted MP4, harici medya referansları, legacy/özel MOV varyantları ve bilinmeyen box temizliği desteklenmez.
- `moov` başta/sonda, `mdat`, track `udta`, full-box `meta`/`ilst`, bilinen başlık/üretici/tarih/konum/hak tag'leri ve `mvhd/tkhd/mdhd` oluşturma/değiştirme zamanları taranır. mdta/keys, kapak görseli gibi opak/UTF-8 dışı kayıtlar güvenli temizleme alt kümesinde değildir. Zaman sıfırlama süre/timescale alanlarını değiştirmez. Aynı boyutta boşaltma dosyayı küçültmez.
- Motor limitleri: 1.000.000.000 bayt; okuma/yazma parçaları en fazla 1 MiB; 16 MiB toplam metadata, tek metadata 1 MiB, 16.384 box, 200.000 toplam tablo kaydı, 16 track ve 12 nesting derinliği. Daha büyük/geçersiz tablolar reddedilir. Desteklenmeyen kayıtlar korunur ve tüm temizlemeyi engeller.
- `npm test`: **116 başarılı, 1 Windows symlink izin atlaması**; TypeScript/Vite production build başarılı. `npm audit`: **0 bildirilen açık**. Windows Python regresyonu **322 başarılı**, `pip check` başarılı; Windows kaynakları değiştirilmedi.
- Gerçek kısa ffmpeg H264/AAC MP4 + MJPEG/PCM MOV dosyaları moov başta/sonda temizlendi; bağımsız ffmpeg tüm video/ses `framemd5` değerleri aynı. Bozuk sınır/tablo/ofset, `stco/co64`, v1 timestamp, rotasyon, provenance, hak onayı, iptal callback'i ve 1 MiB sınırını aşan metadata patch testleri geçti. Gerçek fixture testleri için yerel ffmpeg gerekir; bulunmazsa test başarısız olur (otomatik indirme yoktur).
- Production Chromium'da gerçek MP4 tarama/seçim/onay/Worker temizleme ve gerçek OPFS hedef handle ile disk yazımı geçti; çıktı 16.844 bayt, geçici staging dosyası kalmadı. Native picker yerine gerçek disk handle döndüren test adaptörü kullanıldı. Browser çıktısı bağımsız ffprobe + ffmpeg decode ile doğrulandı. Ağ kaydı yalnız aynı-origin video Worker GET, medya/metadata request body yok. Production UI'da bozuk MP4 reddi ve File System Access yokluğunda kayıt/Blob indirme engeli doğrulandı.
- Bilinen sabit leaf box'larda (`vmhd/smhd/pasp/btrt/fiel/colr`) boyut/flags/desteklenen varyant kontrolleri uygulanır; AVC/AAC descriptor sınırları da kontrol edilir. Worker kaynak kodunu kontrollü disk adaptörleriyle çalıştıran testlerde doğrulama hatasında hedef hiç açılmadı; yazma/close hataları ve iptalde abort/temizlik var, başarı yanıtı yok. Production gerçek Worker iptalinde terminal iptal onayı ve sıfır staging kalıntısı görüldü. Commit mesajı sonrası input/iptal butonlarının kilitlendiği ve sonra gerçek başarıya dönüldüğü geciktirilmiş terminal yanıtla doğrulandı. Mevcut görsel production browser kabul scripti (üç format indirme, iptal/değiştirme/timeout/hata/hash reddi) yeniden geçti.
- **PARTIAL:** Gerçek 1 GB video testi yapılmadı. Parçalı okuma sınırı ve tam-dosya okuma reddi test edildi; gerçek 1 GB RAM/OS disk/kota profili ölçülmedi. Native işletim sistemi dosya seçici izin akışı, diğer Chrome/Edge sürümleri ve sekme çökmesi sonrası temizlik test edilmedi. Railway deployment yapılmadı.
- `tests/video-browser-acceptance.js` yeniden üretilebilir küçük gerçek MP4/Worker/disk kabul scriptidir; fixture komutu ve native-picker test sınırı dosyada yazılıdır. `npm test` browser scriptlerini çalıştırmaz.

## Faz 3 büyük video profili — 15 Ekim 2026

**Sonuç: PARTIAL.** Başlangıç `cf2401e`; bağımlılık/deployment yok. Parser fiziksel okumaları 64 KiB tek pencereyle birleştirildi; kabul düzeltmesinde kota ön kontrolü ve isteğe bağlı yerel geçici klasör eklendi. `stsz` ve diğer tabloların mantıksal kontrolleri, iptal callback'leri, 1 MiB akış limiti ve çıktı doğrulaması korunur. Kalıcı parser penceresi 64 KiB'dır; dönen subarray referansları eski pencereleri geçici olarak canlı tutabilir. Bu toplam tarayıcı RAM garantisi değildir.

Ortam: Windows, Node 24.19.0, ffmpeg 9.0, otomasyonun izole **HeadlessChrome 155.0.8059.40** tarayıcısı. Bu, kurulu interaktif Chrome/Edge veya native picker testi değildir. Medya gerçek H.264 yuv420p CBR (~32 Mbit/s), 1280×720/30 fps ve AAC 48 kHz olarak ffmpeg ile üretildi; 500 MB/1 GB örnekleri stream-copy döngüsüyle uzatıldı, `moov` başa alındı. Yapay `mdat` padding kullanılmadı. İlk lossless H264 fixture `avcC trailing bytes` nedeniyle güvenli reddedildi; destek genişletilmedi.

| Gerçek girdi (bayt) | Süre | Tarama / fiziksel slice | Temizle-doğrula-kaydet | Sonuç |
|---|---:|---:|---:|---|
| 250.468.444 | ~62,6 sn | baseline 7.369,8 ms / 10.310; pencere 23,9 ms / 1 | baseline 32.344,9 ms; pencere 6.279,6 ms | PASS, OPFS hedef |
| 500.134.583 | 124,954688 sn | 25,6 ms / 11 | 10.260,4 ms (önceki koşu ~10 sn) | PASS, OPFS hedef |
| 999.865.324 | 249,830729 sn | 40 ms / 15 | 28.157,7 ms, kota reddi | FAIL: hedef kopyası tamamlanmadı |

Bunlar tek koşu gözlemleridir; disk/OS cache kontrol edilmedi, dağılım veya genel hız garantisi yoktur. Worker scriptine yalnız testte `Blob.prototype.slice` sayacı ve terminal zaman damgası eklendi; uygulama telemetrisi eklenmedi. 250 MB baseline 10.295 adet <=16 bayt okuma yaptı; pencere sonrası fiziksel küçük okuma 0. `stsz sizeAt()` her örnekte 4 bayt slice açıyordu; pencere aynı şekilde diğer komşu tablo okumalarını da birleştirir. Tam süreç kümülatif slice sayısı 250 MB için 960, 500 MB için 1.952; bunlara kaynak/staging doğrulaması ve hedef kopya okumaları dahildir.

### RAM ve OPFS ölçüm sınırları

- `navigator.storage.estimate()` 100 ms örneklendi: ilk kota 10.737.418.240 bayt. Yaklaşık tepe kullanım 250 MB overwrite koşusunda 741.061.424 bayt, 1 GB başarısız koşusunda 1.811.463.780 bayt. Kota tahmini mevcut dosya kullanımına bağlı değişti (~10,74–11,24 GB); bu sayı yazmanın mutlaka başarılı olacağını göstermedi. 1 GB iki koşuda da target-copy sırasında `QuotaExceededError` verdi; ilk ölçümde neden ayrıştırılmamıştı; aşağıdaki kabul düzeltmesi deneyinde gerçek origin kotası ve ikinci OPFS kopyası neden olarak doğrulandı. Kota kontrolünü gevşetme/Blob fallback yapılmadı.
- 500 MB tekrarında CDP `SystemInfo.getProcessInfo` ile doğrulanan benchmark browser PID'lerinin toplam Windows WorkingSet64 değeri 100 ms örneklendi: **1.598.521.344 bayt gözlenen tepe** (browser/renderer/GPU/network/storage toplamı; sadece uygulama heap'i değil). Yeni PID'ler dinamik keşfedilmedi ve alt-100 ms zirveler kaçabilir; tam peak RAM değildir. 250 MB/1 GB için güvenilir, izole peak RAM alınmadı. Tüm makinedeki chrome süreçlerini toplayan ilk ölçüm başka sekmeleri içerdiğinden geçersiz sayıldı ve performans kanıtı olarak kullanılmadı.

### Disk güvenliği ve bütünlük

- Hedef native picker yerine gerçek OPFS FileSystemFileHandle ile seçildi; gerçek disk-backed staging/target stream çalıştı. 250/500 MB başarıları sonrası `afc-video-*` kalıntısı yoktu. 500 MB iptalinde staging temizlendi ve önceki 500.134.583 bayt hedef kaldı. 1 GB kota hatasında staging temizlendi; var olan 500 MB hedefin boyutu korundu. Hedef kaldırılarak tekrarlandığında hata sonrası 0 bayt boş hedef kaldı; başarı sunulmadı. Boyut kontrolü tek başına mevcut hedefin byte-bütünlüğü kanıtı değildir.
- 500 MB browser çıktısı test amacıyla diske indirildi; bağımsız ffmpeg `-map 0:v -map 0:a -c copy -f streamhash -hash sha256` karşılaştırması tüm sıkıştırılmış video ve ses akışlarında aynı sonucu verdi: video `e4db68558930cda10328a7780f7a86b885126d2549f521a997d23d4e106fcce1`, ses `23f5eacc6cf4c8a21065d4738d6e3e22ad841f7cfefee22ba40bdaa02168c714`. ffprobe çıktı boyutu/süresi 500.134.583 bayt / 124,954688 sn. 1 GB doğrulanmış çıktı yoktur; başarılı sayılmaz.
- **YAPILMADI:** Native işletim sistemi dosya seçici/izin, native mevcut hedef overwrite/abort, interaktif Chrome ve Edge karşılaştırması, gerçek tarayıcı çökmesi/restart, her boyutta bağımsız çıktı hash'i, tüm boyutlarda izole peak RAM. Görünür browser bağlantısı bu oturumda yok; OPFS testini bunların yerine PASS saymıyoruz. Çökmede OPFS artık bırakma riski önceki fazdaki gibi sürüyor.
- Regresyon: web **117 PASS, 1 Windows symlink SKIP**, TypeScript/Vite build PASS; Windows **322 PASS**, `pip check` PASS. Yeni pencere testi fiziksel okuma sayısını, iptal hatasının yayılmasını ve kısa fiziksel okuma reddini denetler; cache-hit sonrası kontrole özgü davranışı tek başına kanıtlamaz. Lint scripti yok; build `tsc --noEmit` içerir. Büyük fixture'lar geçici dizinde, Git'e eklenmez.

## Faz 3 kabul düzeltmesi — 15 Ekim 2026

**Genel sonuç: PARTIAL.** Medya sunucuya gönderilmedi, Faz 4/deployment yok. Başlangıçta yalnız `web/README.md`, `web/src/video.ts`, `web/src/video.test.ts` değiştirilmişti; kullanıcıya ait `.kilo/*` ve `SESSION_HANDOFF.md` untracked dosyaları korunmuştur.

- **PASS — kök neden:** fiziksel C: boş alanı 125.533.949.952 bayt iken izole HeadlessChrome 155.0.8059.40 origin kotası CDP `Storage.getUsageAndQuota` ile **1.811.779.944 bayt** ölçüldü. `estimate()` kullanılabilir alanı **10.737.418.240 bayt** gösterdi. Tek 1.000.341.504 bayt OPFS dosyası başarılı; ikinci dosyaya kopya **810.549.248 bayttan sonra** kota hatası verdi. Toplam ~1,811 GB sınırı aşılıyordu; hata staging kapasitesi veya fiziksel disk doluluğu değil, aynı origin'deki staging + test hedefi kopyasıydı. Ürünün native disk hedefi aynı OPFS kotasını paylaşmaz. [Chromium resmi açıklaması](https://groups.google.com/a/chromium.org/g/blink-dev/c/7q0YGQNVkjs), 15 Ekim 2026 kontrolü: gizlilik nedeniyle bildirilen kota gerçek uygulanan kotadan yüksek olabilir; hata yönetimi zorunludur.
- **PASS — güvenli akış:** OPFS tahmini yetersiz/bilinmezse yazmadan ret; kullanıcı seçimiyle ayrı geçici klasör; sessiz fallback yok. Klasör picker'ı kayıt picker'ından ayrı kullanıcı hareketiyle açılır. En fazla 1 MiB parçalar, yeniden tarama + tüm baytların beklenen dönüşümle karşılaştırılması, ardından hedef açma/yazma/close ve başarı sırası korunur. Cache durumu kısa/başarısız okumadan sonra değiştirilmez; önceki iki test/bellek iddiası düzeltildi.

| Gerçek video | Kaydetme süresi | Gözlenen OPFS tepe kullanım | Gözlenen browser process WorkingSet tepe | Bütünlük |
|---|---:|---:|---:|---|
| 500.134.583 bayt / 124,954688 sn | 13.605,3 ms | 991.458.595 bayt | 1.563.578.368 bayt | PASS: video/ses stream SHA-256 aynı |
| 999.865.324 bayt / 249,830729 sn | 28.413,8 ms; tekrar 23.003,7 ms | 1.982.381.660; tekrar 1.991.818.872 bayt | tekrar 2.628.722.688 bayt | PASS yalnız test kotasında: video/ses stream SHA-256 aynı |

- **Test sınırı:** Bu tabloda iki koşu da açık **CDP 4.000.000.000 bayt kota override** ile yapıldı; bu ürün kodunda yoktur, native diskte 1 GB kabul kanıtı değildir. İlk override denemesinde CDP bağlantısı erken ayrıldığından varsayılan kota hatası tekrarlandı; bağlantı korunarak başarı elde edildi. Sonda override kaldırıldı, gerçek kota 1.811.779.944 ve kullanım 0 doğrulandı. Varsayılan izole kotada 1 GB ikinci OPFS kopyası **FAIL** olarak kalır. Kalıcı tarayıcı profil denemesi kurulu otomasyon executable'ı erişilemediği için yapılamadı; yazılım kurulmadı.
- Süreler tek/iki koşu gözlemidir, kontrollü performans dağılımı değildir. RAM 100 ms aralıkla CDP'nin bildirdiği yedi benchmark PID'sinin Windows WorkingSet64 toplamıdır; yeni PID'ler dinamik keşfedilmedi, kısa zirveler kaçabilir. OPFS izole profilde bellek destekli olabilir; bu değerler uygulamanın tüm dosyayı RAM'e aldığını veya native disk RAM davranışını kanıtlamaz. OS fiziksel dosya sistemi tepe alanı ölçülmedi; disk ölçümü OPFS mantıksal kullanımına aittir.
- 1 GB bağımsız ffmpeg streamhash: video `905f0101bbdc90bc59aaf772a6d579fb86ffff397ed1f685c1cf93d5a92967ed`, ses `c8c14f3f4abcd30b6a5a6f79d1d271895064ee56ab564174a3281abb6bfb5511`; kaynak ve çıktı eşit. 500 MB hash'leri önceki profille aynı. ffprobe iki çıktıda boyut/süreyi doğruladı. Büyük medya yalnız geçici test dizinindedir, Git'e eklenmez.
- **PASS — regresyon ve güvenlik:** web 125 PASS / 1 Windows symlink SKIP; build/TypeScript PASS; Python 322 PASS; `pip check` PASS; lint scripti yok. Worker testleri düşük/bilinmeyen kota, staging kota hatası, hedef açılmadan ret, isim çakışması, aynı handle, kimlik sorgusu reddi, yalnız sahip olunan dosyanın temizliği ve cleanup uyarısını kapsar. Production image/video browser kabul scriptleri geçti. Gerçek küçük OPFS directory handle, yeni klasör seçimi adaptörüyle Worker'a structured-clone edildi; çıktı 16.844 bayt ve klasör boş kaldı. Seçici iptalinde doğrulanmış çıktı yok. Bu adaptör native izin testi değildir.
- **PARTIAL — inceleme/platform:** birinci reviewer başlangıçta `APPROVE WITH CHANGES`, bulgular giderildikten sonraki tek tekrar incelemede **APPROVE** verdi; README, kimlik reddinde uyarı ve kota sonrası yeniden seçim bulguları çözüldü. Ayrı ikinci reviewer yeniden denendi fakat sağlayıcı `404 NOT_FOUND` verdi; birinci reviewer'ın tekrar incelemesi ikinci bağımsız görüş yerine sayılmaz. Native dosya/klasör seçici, gerçek yerel klasörde 500 MB/1 GB, yerel disk-dolu/izin iptali, interaktif Chrome/Edge ve gerçek crash/restart yapılmadı. Bu eksikler PASS sayılmaz.

## Faz 2 doğrulama — 12 Ekim 2026

- Production TypeScript/Vite build başarılı; yeni medya işleme bağımlılığı eklenmedi. `npm test`: **39 başarılı, 1 Windows symlink izin atlaması**. `npm audit`: bildirilen açık **0**. Senior Review, XMP kodlama/yön ve provenance erken dönüş bulguları düzeltildikten sonra incelenen motor/Worker/UI kaynaklarına onay verdi.
- Gerçek PIL JPEG/PNG/WebP fixture'ları, progressive JPEG, lossless WebP, palette alpha; orientation 1/6, ICC, EXIF Software/Artist/Model, XMP CreatorTool/prompt/model/seed ve Photoshop IPTC copyright testleri mevcut. Metadata kaynakları gerçek kodlanmış görüntülere enjekte edilir; AI üretimi iddiası içermez.
- Bozuk CRC/sıra/RIFF/bayrak/padding, animasyon, eksik/ek veri, TIFF döngüsü, duplicate EXIF, bilinmeyen/oversized metadata ve kayıt/önizleme sınırları test edilir. Kalan bloklar/payload byte eşitliği ve SHA-256 doğrulanır.
- Production Chromium'da üç formatın seçimi, onay, temizlik, download çalıştı. JPEG/PNG/WebP sırasıyla 1/3/1 blok kaldırıldı, ICC korundu. İndirilen dosyalar bağımsız PIL decode ile karşılaştırıldı: pikseller, boyut, ICC ve orientation eşit.
- Ağ kaydı üç aynı-origin Worker JavaScript GET isteği dışında medya isteği içermedi; request body boş, localStorage/sessionStorage/IndexedDB sayıları 0.
- `tests/browser-acceptance.js`, browser_run_code aracıyla çalıştırılan yeniden üretilebilir Playwright fonksiyonudur (fixture yolu checkout'a göre düzenlenir). Ek paket gerekmez; `npm test` bu browser fonksiyonunu çalıştırmaz. Gerçek Worker yanıtı geciktirilerek scan/clean iptali ve kaynak değişimi; onay geri çekilince çıktı iptali; kontrollü timeout/onerror/onmessageerror testleri geçti. İkinci temizlemede kontrollü hata sonrası eski indirme sunulmadığı ayrıca tarayıcıda kontrol edildi. Gerçek emitted Worker scriptinde SHA-256 reddi enjekte edildi: hata mesajı gösterildi, hiçbir doğrulanmış sonuç veya indirilebilir Blob UI'ya ulaşmadı.
- 1320×900 / 390×844 metadata ayrıntı görselleri incelendi; yatay taşma yok. Üç formatta orientation6 EXIF seçimi kapalı; sahte PNG ret ve indirme engeli doğrulandı.
- Windows regresyonları 322 başarılı. Python/PySide6 kaynakları değiştirilmedi. Editörün fixture scriptinde PIL import uyarısı ayrı interpreter seçimine bağlıdır; proje `.venv` ortamındaki PIL fixture üretimi ve bağımsız decode başarılıdır.
- Symlink testi Windows izinleri nedeniyle atlanır. Gerçek 128MiB bellek/stres profili, native OS seçici diyaloğu, tüm tarayıcılar ve gerçek C2PA sertifika zinciri doğrulaması denenmedi. Docker CLI yok; Docker build/run ve gerçek Railway deploy yapılmadı.

## Faz 1 doğrulama — 12 Ekim 2026 (önceki sürüm)

- `npm run build`: TypeScript ve production Vite build başarılı.
- `npm test`: 12 başarılı, 1 atlandı. Symlink güvenlik testi Windows symlink oluşturma izni olmadığından atlandı; Linux üzerinde yeniden çalıştırılmalı.
- `npm audit`: geliştirme bağımlılıkları dahil bildirilen açık sayısı 0 (bu tam güvenlik garantisi değildir).
- Windows regresyonu: 322 test başarılı; görev sonunda mevcut tracked dosyalarda değişiklik yok, yalnız `web/` eklendi.
- Production sunucusu üzerinde Chromium: yerel canvas ile üretilmiş gerçek PNG seçimi, aynı dosyayı tekrar seçme, seçimi kaldırma ve sürükle-bırak çalıştı. Input testleri File/DataTransfer ve change olayıyla yapıldı; native OS dosya seçici diyaloğu otomatik test edilmedi.
- SVG ve sahte PNG reddedildi. 1.000.000.001 bayt video sınırı sentetik File.size ile tarayıcıda; tam sınır ve sınır+1 unit testte doğrulandı. Gerçek 1 GB video kullanılmadı.
- Son seçim/tekrar seçim/drop ağ kaydında yalnız 3 adet aynı-origin worker JavaScript GET isteği vardı, request body yoktu; dosya adı/medya içeriği içeren istek görülmedi. localStorage, sessionStorage ve IndexedDB sayıları 0 kaldı. Bu yerel Chromium kanıtıdır, bütün tarayıcılar veya Railway edge trafiği için paket yakalama değildir.
- `/healthz` 200 ve uzantısız `/workspace` SPA 200 doğrulandı. 1320×900 ve 390×844 görselleri incelendi; yatay taşma yok. File System Access API yokluğu simüle edilince açık uyarı göründü.
- Docker CLI mevcut değil: imaj build/run denenmedi. Railway hesabına deploy/domain oluşturulmadı. Gerçek diske yazma izni/çıktısı ve diğer tarayıcılar denenmedi; output sözleşmesinde sıralı yazma/close/abort unit testleri var.

Python kurallarının bulunması web portunun doğrulandığı anlamına gelmez; eşdeğer TypeScript testleri ve gerçek dosya testleri ayrıca gereklidir. Metadata/C2PA envanteri frekans analizinden ayrıdır ve AI üretim kanıtı olarak yorumlanmaz. Uzak imzalar, sertifika zinciri ve C2PA güvenilir değerlendirmesi ertelenmiştir; mevcut temel doğrulanmış provenance veya güvenilir imza iddiasında bulunmaz.
