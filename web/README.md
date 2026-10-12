# Tarayıcı tabanlı web temeli

Bu dizin Windows masaüstü uygulamasından bağımsız React/Vite web temelidir. Node sunucusu yalnızca derlenmiş `dist` dosyalarını sunar; Python, ExifTool, kullanıcı dosyası depolama veya yükleme API'si çalıştırmaz. Bu temel henüz metadata temizleme yapmaz; analiz/önizleme bir temizleme sonucu değildir. Temizlenmiş gibi gösterilen sahte çıktı üretilmemelidir.

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

Video üst sınırı ondalık **1 GB = 1.000.000.000 bayt**, görüntü üst sınırı **128 MiB = 134.217.728 bayt** olarak uygulanmalıdır; bunlar sunucu upload limitleri değil tarayıcı kabul sınırlarıdır. Sınırlar mobil/bellek performansı garantisi değildir.

Worker tarafında `Blob.slice()` ile en fazla 64 KiB başlık okunur. `src/media.ts` ayrıca sıralı, geri basınçla tüketilebilen parçalı okuma iteratorü sağlar; tüm videoyu `arrayBuffer()` ile belleğe almak uygun değildir. Kontrol yalnız imza/başlık ön kontrolüdür; tam kapsayıcı doğrulaması değildir. MP4 için tanınan başlangıç `ftyp` major brand gerekir; MOV için `qt  ` major brand gerekir. Başlangıç `ftyp` içermeyen eski MOV ve listede olmayan MP4 markaları bu fazda reddedilir. MIME bilgisine güvenilmez. `src/output.ts` kullanıcı etkileşimiyle alınan File System Access handle üzerine parçaları sıralı yazma, close ve hata halinde abort sözleşmesini içerir; UI bu hazırlık kodunu çağırmaz. İleride File System Access API destekleyen tarayıcılarda akışlı çıktı planlanır; bugün temizleme veya akışlı çıktı desteği varmış gibi sunulmaz. Desteklenmeyen tarayıcılar için bellek/boyut sınırları ve güvenli reddetme davranışı ayrıca tasarlanmalıdır.

## Masaüstü kurallarının yeniden kullanımı

`../modules/metadata/containers.py` davranış referansıdır; bu Python dosyası web sunucusunda çalıştırılmaz. Gelecek TypeScript portu PNG CRC/chunk sırası ve animasyon reddini, JPEG marker/frame/scan ve sondaki ek veri kontrollerini, WebP RIFF uzunluğu/padding/VP8X bayrakları ve animasyon reddini korumalıdır. `classify`, `inventory`, `payload_hashes`, `strip` kuralları; ICC/APP1/APP2/APP11 koruması, yalnızca seçili metadata kaldırımı, WebP bayrak düzeltmesi ve sıkıştırılmış görüntü yükünün hash eşitliğiyle doğrulanması dahil aktarılmalıdır. Bilinmeyen kapsayıcılar sessizce yeniden yazılmamalıdır.

Referans regresyonlar `../tests/unit/test_hardening.py`, `../tests/unit/test_workflow.py` ve `../tests/unit/test_review_regressions.py` içindedir. Proje kökünde Windows kontrolleri:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pip check
```

## Faz 1 doğrulama — 12 Ekim 2026

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
