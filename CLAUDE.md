# AI Footprint Cleaner — çalışma notları

Medya dosyalarındaki desteklenen metadata ve gömülü C2PA/provenance kayıtlarını inceleyip doğrulanmış, yeniden kodlamasız bir işlemle kaldıran araç. Ürün `web/` altındadır (React + TypeScript + Vite, tamamen tarayıcıda çalışır). Eski Python masaüstü uygulaması ana daldan kaldırıldı; son hâli git geçmişinde `b41b838` commit'inde durur (`git show b41b838:main.py`).

Güncel ürün davranışı için `README.md`, kaynak kod ve testler esastır. `docs/history/` yalnız dönemin kararlarını ve eski devir belgelerini içerir; açık iş listesi olarak kullanılmaz.

Açık doğrulamalar: (1) canlı yayın (Railway dağıtımı, HTTPS, `/healthz`, önbellek ve sıkıştırma başlıkları, ağdan medya çıkmadığı); (2) videoda uçtan uca akış (hedef seçme, temizleme, diske yazma, kaydedilen dosyayı yeniden doğrulama) e2e'de tam kapsanmıyor.

## Komutlar (`web/` içinde, Node 24)

```bash
npm ci
npm test        # Node test runner (src/**/*.test.ts + server.test.mjs); video testleri PATH'te ffmpeg (libx264) ister
npm run typecheck:tests  # testleri de tip denetiminden geçirir (tsconfig.test.json, @types/node)
npm run lint    # ESLint (eslint.config.js)
npm run format  # Prettier yazar; CI npm run format:check çalıştırır
npm run build   # tsc --noEmit && vite build
npm run test:e2e  # Playwright (Chromium) tarayıcı testleri; önce npm run build. İlk kurulumda: npx playwright install chromium
npm start       # dist'i http://localhost:3000 üzerinde sunar
```

- `npm test` `src/**/*.test.ts` glob'unu kullanır; yeni test dosyası otomatik çalışır.
- `tsconfig.json` (build) testleri ve Node tiplerini hariç tutar; testler `tsconfig.test.json` ile ayrıca denetlenir (CI'da `npm run typecheck:tests`).
- `web/tests/footprints-fixtures.mjs` (C2PA örnek ölçümü) `npm test` ile çalışmaz; ayrıntı kök `README.md`.
- Tarayıcı testleri: `tests/e2e/app.spec.ts` güncel akışları (AI aracı kartı, başlıklar, Tüm Metadata'yı Kaldır + indirilen dosyanın motorla doğrulanması, ayrıntılar bölümünde ek temizleme denetimi olmaması, okunamayan dosya, ağ isteği olmaması, dar ekran, video tarama) kapsar. `tests/atmosphere-acceptance.js` (animasyon) `tests/e2e/acceptance.spec.ts` üzerinden çalışır.
- CI: `.github/workflows/web-ci.yml` (Node 24, ffmpeg, `npm ci` / `npm run lint` / `npm run format:check` / `npm run typecheck:tests` / `npm test` / `npm run build`; ayrı `e2e` işi: build + `npm run test:e2e`). CI yeşil olmadan birleştirme.

## Değişmez kurallar

- **Gizlilik sınırı:** Medya sunucuya gönderilmez. `server.mjs` yalnız `web/dist`'i sunar; CSP `connect-src 'none'`. Upload endpoint'i, analitik veya harici istek ekleme. Sunucu istek sırasında iş yapmaz: sıkıştırma derlemede (`scripts/precompress.mjs`) yapılır, `/assets/*` immutable, diğer yanıtlar `no-store`.
- **Kayıpsız ve fail-closed:** Piksel yeniden kodlanmaz; her çıktı yeniden ayrıştırılır ve kodlanmış görüntü yükü SHA-256 ile karşılaştırılır. Doğrulanmayan çıktı kullanıcıya verilmez. Bilinmeyen/bozuk/belirsiz yapı sessizce temizlenmez, engellenir.
- **Dürüst metin:** Uygulama AI üretimini kanıtlamaz; görünmez filigran (SynthID vb.) kaldırmaz; C2PA imzası doğrulanmaz. UI metinleri bu sınırları abartmamalı.
- Ayrıştırıcı bütçelerini (boyut, derinlik, öğe sayısı, süre) gevşetirken gerekçe ve test ekle.

## Kod haritası (`web/src`)

- `main.tsx` — `App`: ekranı ve eylemleri bağlar (tek temizleme düğmesi, video kayıt hedefi); `hooks/useMediaJob.ts` — Worker yaşam döngüsü (seçim, tarama, işlem başlatma, 120 s/10 s zaman aşımları, iptal, iptal edilemeyen disk yayınlama, kuşak sayacı, indirme URL'si).
- `app-state.ts` — saf UI türetmeleri (kaldırılacak kayıtlar, Tüm Metadata'yı Kaldır uygunluğu, çıktı dosya adları, boyut biçimi); `hooks/useResultScroll.ts` — sonuca otomatik kaydırma; `components/AdvancedTools.tsx` — salt okunur Ayrıntılar bölümleri (işlem sonucu, kayıt listesi, video geçici alanı).
- `inspect.worker.ts` / `video.worker.ts` — görsel ve video işleri; sözleşme `protocol.ts`.
- `engine.ts` — JPEG/PNG/WebP kapsayıcıları, metadata politikası, çıktı doğrulama.
- `footprints.ts` — AI beyanı / ipucu / provenance ayrımı ve işlem planı.
- `ai-generator.ts` — yalnız bilgilendirme: dosyada adı geçen AI aracını bulur (C2PA işlem `softwareAgent` > Claim Generator > metadata metni). Silme planını etkilemez.
- `c2pa.ts`, `cbor.ts`, `c2pa-structure.ts` — C2PA okuma (JPEG APP11, PNG `caBX`, WebP `C2PA`) ve yapı doğrulama; `xmp.ts` — XMP alt kümesi.
- `video.ts` — MP4/MOV aynı uzunlukta dönüşüm; `video.worker.ts` — geçici alan, doğrulama, diske yazma; `output.ts` — dosya/klasör seçimi.
- `components/Home.tsx` (ana ekran, SSS), `Atmosphere.tsx` (yıldız alanı; azaltılmış hareket tercihine uyar), `Workspace.tsx` (sonuçlar), `MetadataResults.tsx` (kayıt görünümü).
- Yayın: `web/server.mjs`, `web/scripts/precompress.mjs`, `web/Dockerfile`, `web/railway.toml`.

## Kurallar

- UI açıklama metinleri Türkçe. Bazı etiketler **bilinçli olarak İngilizce** kalır (karar 2026-11-18): "Download", "File Type", "Image Size", "Megapixels", "C2PA Status", "Actions History" ve benzeri. Bunları Türkçeleştirme.
- **Tek akış** (karar 2026-11-19): görsel ve videoda tek temizleme düğmesi **Tüm Metadata'yı Kaldır**'dır; onay penceresi, mod seçimi (Güvenli/Kapsamlı) ve ayrı C2PA/metadata düğmeleri yoktur. Ayrıntılar bölümü yalnız bilgi gösterir.
- Görselde düğme C2PA deposunu ve güvenli kaldırılabilen her bloğu (EXIF, XMP, IPTC, yorum, PNG metni; hak/telif bilgisi dahil) tek doğrulanmış işlemde siler (`cleanAllMetadata`). Videoda kayıt yeri sorulur ve kaldırılabilir bütün kutular boşaltılır. ICC, JFIF, yönü 1 olmayan EXIF ve tanınmayan bloklar korunur ve sonuçta adlarıyla listelenir. İşlem tarayıcıda kalır.
- Tüm çıktı dosyaları `<ad>-removed.<uzantı>` adını alır (görsel, C2PA, metadata, video).
- Sonuç özetinde bir şey bulunduğunda başlık her zaman **AI METADATA BULUNDU** olur (karar 2026-11-18): açık AI beyanı, araç/parametre ipucu ve yalnız C2PA kaynak kaydı aynı başlığı kullanır. Farkı başlığın altındaki açıklama cümlesi söyler; o cümleler ayrı kalmalı. Metadata var ama tam incelenemediyse (ör. EXIF/ICC) başlık **METADATA BULUNDU**; yalnız tarama hiç rapor üretemediyse **METADATA ANALİZİ TAMAMLANAMADI**.
- Satır sonları LF (`.gitattributes`). Biçim Prettier'ın (`web/.prettierrc.json`, 120 sütun, tek tırnak, noktalı virgül); lint ESLint'in. `tests/*-acceptance.js` Prettier dışıdır: `browser_run_code` girdisi olduğundan sonunda `;` olmamalı. Toplu biçimlendirme commit'leri `.git-blame-ignore-revs`'e eklenir.
- `.kilo/` günlükleri ve `*.zip` yedekleri commit'lenmez.
