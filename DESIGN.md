# DESIGN.md

Teknik tasarım. Çalışma kuralları: [`AGENTS.md`](AGENTS.md). Kurulum ve kullanım: [`README.md`](README.md).

## Sistem

Tarayıcıda çalışan tek sayfalı uygulama (`web/src`) ve yalnız derlenmiş dosyaları sunan küçük bir Node sunucusu (`web/server.mjs`). Medya işleme tamamen tarayıcıdaki Web Worker'larda yapılır; sunucuda medya yükleme, işleme veya analitik yoktur.

```
dosya seç/bırak → main.tsx → useMediaJob → Worker (inspect.worker | video.worker)
                                         ↓ tarama: kayıtlar, C2PA, AI beyanı, işlem planı
                    Tüm Metadata'yı Kaldır → Worker temizler → çıktıyı yeniden ayrıştırıp doğrular
                                         ↓ doğrulanmışsa
                    görsel: indirme (Blob URL)   |   video: kullanıcının seçtiği dosyaya yazma
```

## Dosyalar ve sorumluluklar (`web/src`)

| Alan | Dosya | Sorumluluk |
|---|---|---|
| Uygulama | `main.tsx` | Ekranı ve eylemleri bağlar; tek temizleme düğmesi, video kayıt hedefi. |
| | `hooks/useMediaJob.ts` | Worker yaşam döngüsü: seçim, tarama, işlem, 120 s işlem / 10 s iptal zaman aşımı, iptal edilemeyen disk yayınlama, kuşak sayacı, indirme URL'si. |
| | `hooks/useResultScroll.ts` | Sonuç paneline otomatik kaydırma. |
| | `app-state.ts` | Saf türetmeler: düğme uygunluğu, kaldırılacak kayıtlar, çıktı adları, boyut biçimi. |
| Arayüz | `components/Home.tsx`, `Workspace.tsx`, `AdvancedTools.tsx`, `Atmosphere.tsx`, `MetadataResults.tsx` | Ana ekran/SSS, sonuçlar, salt okunur ayrıntılar, yıldız alanı (azaltılmış hareket tercihine uyar), kayıt görünümü. `style.css` ve `styles/` tasarım belirteçlerini içerir. |
| Görsel motoru | `engine.ts` | JPEG/PNG/WebP kapsayıcı ayrıştırma, metadata politikası, `cleanAllMetadata`, çıktı doğrulama (`verifyOutput`). |
| | `footprints.ts`, `results.ts` | AI beyanı / ipucu / provenance ayrımı, işlem planı ve sonuç sınıfları. |
| | `ai-generator.ts`, `ai-source-types.ts` | Dosyada adı geçen AI aracını bulur (bilgilendirme; silme planını etkilemez), AI dijital kaynak türleri listesi. |
| | `c2pa.ts`, `c2pa-structure.ts`, `c2pa-types.ts`, `cbor.ts`, `xmp.ts` | C2PA okuma (JPEG APP11, PNG `caBX`, WebP `C2PA`), depo yapı doğrulama, CBOR, dar XMP alt kümesi. |
| | `inspect.worker.ts` | Görsel tarama ve temizleme Worker'ı. |
| Video | `video.ts` | MP4/MOV kutu ayrıştırma, aynı uzunlukta dönüşüm ve doğrulama. |
| | `video.worker.ts` | Geçici alan, doğrulama ve diske yazma. |
| | `output.ts` | Kullanıcı hareketiyle dosya ve klasör seçimi. |
| Ortak | `media.ts`, `protocol.ts` | Seçim doğrulama, biçim tespiti, parçalı okuma; ana ekran–Worker mesaj sözleşmesi (`scan`, `clean`). |
| Yayın | `server.mjs`, `scripts/precompress.mjs`, `Dockerfile`, `railway.toml` | Statik sunucu, derleme sonrası Brotli/gzip, Railway dağıtımı. |

## Görsel temizleme

- Kapsam: JPEG, PNG, WebP; en fazla 128 MiB ve 40 MP. Metadata bütçesi 16 MiB, en fazla 4096 parça; ayrıştırma ve okuma sınırları ayrıca uygulanır.
- `cleanAllMetadata`: C2PA deposu (ve ona bağlı tek yerel XMP kaynak işaretçisi) ile EXIF, XMP, IPTC, yorumlar, PNG metinleri ve hak/telif kayıtları tek doğrulanmış işlemde kaldırılır. ICC, JFIF, yönü 1 olmayan EXIF ve tanınmayan bloklar korunur ve sonuçta adlarıyla listelenir. MPF/Ultra HDR JPEG'de ikincil görseller bayt bayt korunur, MPF boyut/offset alanları güncellenir; ikincil görsellerin metadata'sı kaldırılmaz.
- Doğrulama: çıktı yeniden ayrıştırılır, kodlanmış görüntü yükleri çiftli karşılaştırılır, seçilen kayıtlar ve korunan bloklar kontrol edilir. Doğrulanamayan çıktı kullanıcıya verilmez. Sonuç sınıfları: `REMOVED_VERIFIED`, `PARTIALLY_REMOVED`, `BLOCKED`, `NOTHING_TO_REMOVE`, `VERIFICATION_FAILED`.
- Bilinmeyen/bozuk/belirsiz provenance, EXIF yönü belirsizse C2PA kaldırma ve harici veya çoğul XMP referansları engellenir.
- Bellek: motor tüm dosyayı belleğe alır; kaynak, çıktı ve doğrulama kopyaları nedeniyle kullanım dosya boyutunun katlarına çıkar (120 MiB PNG ≈ 1 GB). Mobil bellek garantisi yoktur.
- ICC kaldırılmaz; renk yönetimi korunur.

## C2PA ve AI bilgisi

- C2PA manifest içeriği (Claim Generator, Actions, AI beyanı) JPEG, PNG ve WebP için okunur. İmza, sertifika zinciri ve içerik bağı doğrulanmaz; beyanlar doğrulanmamıştır.
- Açık AI beyanı (standart Digital Source Type), araç/parametre ipucu ve yalnız C2PA kaynak kaydı ayrı kanıt türleridir; kullanıcıya aynı başlıkla, farklı açıklama cümleleriyle gösterilir.
- Harici manifestler ve piksel içi filigranlar (SynthID vb.) kapsam dışıdır.

## Video

- MP4/MOV, en fazla 1.000.000.000 bayt. Dar destek: H.264 `avc1`, MJPEG `jpeg`, AAC `mp4a`, MOV PCM `sowt`; fragmented/encrypted, HEVC/AV1/ProRes ve harici medya referansları desteklenmez.
- Kaldırılabilir kutular aynı uzunlukta `free` kutusu/sıfırlama ile boşaltılır; medya ve `stco/co64` offsetleri kaymaz.
- Kullanıcı önce kayıt dosyasını seçer (kullanıcı hareketi gerekir). Geçici çıktı OPFS'ye veya kullanıcının seçtiği geçici klasöre yazılır, yeniden taranır, tüm baytlar beklenen dönüşümle karşılaştırılır; ancak sonra hedefe yazılır.
- `uuid`, `jumb`, `c2pa` kutusu veya provenance metni bulunursa video temizliği tamamen engellenir.
- File System Access API gerekir (güvenli bağlam, masaüstü Chrome/Edge). Desteklenmeyen tarayıcıda Blob indirme alternatifi yoktur. Kota garantisi yoktur; çökme geçici dosya bırakabilir.

## Sunucu ve güvenlik sınırı

- `server.mjs` yalnız `web/dist`'i sunar; GET/HEAD dışındaki yöntemler 405, `/healthz` `ok` döndürür. Dotfile, path traversal ve symlink istekleri reddedilir.
- Başlıklar: CSP `connect-src 'none'`, `worker-src 'self'`; `nosniff`, çerçeve reddi, referrer, COOP/CORP.
- Önbellek: hash'li `/assets/*` bir yıl `immutable`; `index.html` ve diğer yanıtlar `no-store`. Sıkıştırma `scripts/precompress.mjs` ile derlemede yapılır; sunucu yalnız hazır `.br`/`.gz` kopyayı seçer.
- Railway: kök dizin `/web`, `web/Dockerfile`, health check `/healthz`, `PORT` değişkeni; secret/volume gerekmez.

## Test yapısı

- Birim testleri `src/**/*.test.ts` ve `server.test.mjs` (Node test runner). Fixture görselleri `web/tests/fixtures` altındadır; `generate_fixtures.py` (Pillow) bunları üretir.
- Video testleri `ffmpeg` (libx264) ile örnek dosya üretir.
- Playwright (`web/tests/e2e`): AI görseli tek tık temizleme ve doğrulanmış indirme, EXIF'li fotoğraf, ayrıntılar, okunamayan dosya, ağ isteği olmaması, dar ekran, MP4 tarama, animasyon kabulü. Video uçtan uca testi gerçek video Worker'ını çalıştırır; yalnız yerel kaydetme penceresi, OPFS dosya tutamacı döndüren bir `showSaveFilePicker` ile değiştirilir. Kaydedilen dosya diskten okunup motorla (`verifyVideo`) ve `ffmpeg` ile (çözülebilirlik, metadata yokluğu) bağımsız doğrulanır; kayıt penceresinin iptali ayrıca denenir.
- `web/tests/footprints-fixtures.mjs` + `c2pa-sdk-check.py`: 11 halka açık C2PA örneğini ve resmî SDK'yı kullanan ölçüm; `npm test` ile çalışmaz.

## Açık doğrulamalar

- Canlı yayın (Railway dağıtımı, HTTPS, `/healthz`, önbellek ve sıkıştırma başlıkları, ağdan medya çıkmadığı) bağımsız doğrulanmadı.
- Video: uçtan uca akış e2e'de kapsanıyor, ancak yerel kaydetme penceresi (gerçek dosya seçici), geçici klasör seçimi ve büyük videolar elle denenmedi.
