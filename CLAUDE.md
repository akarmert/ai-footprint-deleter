# AI Footprint Cleaner — çalışma notları

Medya dosyalarındaki desteklenen metadata ve gömülü C2PA/provenance kayıtlarını inceleyip doğrulanmış, yeniden kodlamasız bir işlemle kaldıran araç. **Aktif ürün `web/`** (React + TypeScript + Vite, tamamen tarayıcıda çalışır). Kökteki Python/PySide6 masaüstü uygulaması legacy'dir; yeni özellik eklenmez.

Güncel durum ve açık işler: `docs/history/GELISTIRME_DEVIR_OZETI_2026-11-18.md` (14. ve 15. bölümler).

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
- `web/tests/*-acceptance.js` ve `footprints-fixtures.mjs` `npm test` ile çalışmaz; yollar ortam değişkenleriyle verilir (`AFC_FIXTURES_DIR`, `AFC_VIDEO_FIXTURE`, `AFC_SCREENSHOT_DIR`, `AFC_FIXTURE_CACHE_PARENT`, `AFC_PYTHON`; ayrıntı `web/README.md`).
- Tarayıcı testleri: `tests/e2e/app.spec.ts` güncel akışları (AI aracı kartı, başlıklar, Tüm Metadata'yı Kaldır + indirilen dosyanın motorla doğrulanması, Yalnız C2PA, hak onayı penceresi, okunamayan dosya, ağ isteği olmaması, dar ekran) kapsar. `tests/*-acceptance.js` betiklerinden yalnız `atmosphere` güncel arayüze uyuyor ve CI'da çalışıyor; diğerleri 2026-11-15 arayüzüne göre yazılmış elle referanslardır.
- CI: `.github/workflows/web-ci.yml` (Node 24, ffmpeg, `npm ci` / `npm run lint` / `npm run format:check` / `npm run typecheck:tests` / `npm test` / `npm run build`; ayrı `e2e` işi: build + `npm run test:e2e`). CI yeşil olmadan birleştirme.

## Değişmez kurallar

- **Gizlilik sınırı:** Medya sunucuya gönderilmez. `server.mjs` yalnız `web/dist`'i sunar; CSP `connect-src 'none'`. Upload endpoint'i, analitik veya harici istek ekleme.
- **Kayıpsız ve fail-closed:** Piksel yeniden kodlanmaz; her çıktı yeniden ayrıştırılır ve kodlanmış görüntü yükü SHA-256 ile karşılaştırılır. Doğrulanmayan çıktı kullanıcıya verilmez. Bilinmeyen/bozuk/belirsiz yapı sessizce temizlenmez, engellenir.
- **Dürüst metin:** Uygulama AI üretimini kanıtlamaz; görünmez filigran (SynthID vb.) kaldırmaz; C2PA imzası doğrulanmaz. UI metinleri bu sınırları abartmamalı.
- Ayrıştırıcı bütçelerini (boyut, derinlik, öğe sayısı, süre) gevşetirken gerekçe ve test ekle.

## Kod haritası (`web/src`)

- `main.tsx` — `App`: onay penceresi, temizleme modu, video kayıt hedefi ve ekran düzeni; `hooks/useMediaJob.ts` — Worker yaşam döngüsü (seçim, tarama, işlem başlatma, 120 s/10 s zaman aşımları, iptal, iptal edilemeyen disk yayınlama, kuşak sayacı, indirme URL'si).
- `app-state.ts` — saf UI türetmeleri (temizlenebilir kayıtlar, onay gereksinimi, tek tık eylemleri, çıktı dosya adları); `hooks/useResultScroll.ts` — sonuca otomatik kaydırma; `components/AdvancedTools.tsx` — Gelişmiş Araçlar bölümleri.
- `inspect.worker.ts` / `video.worker.ts` — görsel ve video işleri; sözleşme `protocol.ts`.
- `engine.ts` — JPEG/PNG/WebP kapsayıcıları, metadata politikası, çıktı doğrulama.
- `footprints.ts` — AI beyanı / ipucu / provenance ayrımı ve işlem planı.
- `ai-generator.ts` — yalnız bilgilendirme: dosyada adı geçen AI aracını bulur (C2PA işlem `softwareAgent` > Claim Generator > metadata metni). Silme planını etkilemez.
- `c2pa.ts`, `cbor.ts`, `c2pa-structure.ts` — C2PA okuma (JPEG APP11, PNG `caBX`, WebP `C2PA`) ve yapı doğrulama; `xmp.ts` — XMP alt kümesi.
- `video.ts` — MP4/MOV aynı uzunlukta dönüşüm.

## Kurallar

- UI açıklama metinleri Türkçe. Bazı etiketler **bilinçli olarak İngilizce** kalır (karar 2026-11-18): "Download", "File Type", "Image Size", "Megapixels", "C2PA Status", "Actions History" ve benzeri. Bunları Türkçeleştirme.
- C2PA kaldırma onay penceresi açmaz (karar 2026-11-18): hem `Tüm Metadata'yı Kaldır` hem `Yalnız C2PA’yı Kaldır` düğmeye basınca çalışır; kapsam ve kaybolan bilgiler düğmenin yanında yazılır. Hak/telif gerektiren metadata temizliğinin `ConsentDialog`'u ayrı ve korunur.
- Ana panelde **tek düğme** vardır: **Tüm Metadata'yı Kaldır** (karar 2026-11-18; eski „Remove AI Footprint" düğmesi kaldırıldı, motorda `cleanFootprints` API olarak durur). Düğme deletefootprints.ai benzeri: görsellerde tek tıkla ve onay penceresi olmadan C2PA + güvenli modda kaldırılabilen her blok (hak onayı gerektirenler dahil: EXIF, XMP, IPTC, yorum, PNG metni) tek doğrulanmış işlemde silinir (`cleanAllMetadata`). ICC, yönü 1 olmayan EXIF ve tanınmayan bloklar korunur ve sonuçta adlarıyla listelenir. İşlem tarayıcıda kalır; sunucuya yükleme yoktur.
- Tüm çıktı dosyaları `<ad>-removed.<uzantı>` adını alır (görsel, C2PA, metadata, video).
- Sonuç özetinde bir şey bulunduğunda başlık her zaman **AI METADATA BULUNDU** olur (karar 2026-11-18): açık AI beyanı, araç/parametre ipucu ve yalnız C2PA kaynak kaydı aynı başlığı kullanır. Farkı başlığın altındaki açıklama cümlesi söyler; o cümleler ayrı kalmalı. Metadata var ama tam incelenemediyse (ör. EXIF/ICC) başlık **METADATA BULUNDU**; yalnız tarama hiç rapor üretemediyse **METADATA ANALİZİ TAMAMLANAMADI**.
- Satır sonları LF (`.gitattributes`). Biçim Prettier'ın (`web/.prettierrc.json`, 120 sütun, tek tırnak, noktalı virgül); lint ESLint'in. `tests/*-acceptance.js` Prettier dışıdır: `browser_run_code` girdisi olduğundan sonunda `;` olmamalı. Toplu biçimlendirme commit'leri `.git-blame-ignore-revs`'e eklenir.
- `.kilo/` günlükleri ve `*.zip` yedekleri commit'lenmez.
