# AI Footprint Cleaner — çalışma notları

Medya dosyalarındaki desteklenen metadata ve gömülü C2PA/provenance kayıtlarını inceleyip doğrulanmış, yeniden kodlamasız bir işlemle kaldıran araç. **Aktif ürün `web/`** (React + TypeScript + Vite, tamamen tarayıcıda çalışır). Kökteki Python/PySide6 masaüstü uygulaması legacy'dir; yeni özellik eklenmez.

Güncel durum ve açık işler: `docs/history/GELISTIRME_DEVIR_OZETI_2026-11-18.md` (14. ve 15. bölümler).

## Komutlar (`web/` içinde, Node 24)

```bash
npm ci
npm test        # Node test runner; video testleri PATH'te ffmpeg (libx264) ister
npm run build   # tsc --noEmit && vite build
npm start       # dist'i http://localhost:3000 üzerinde sunar
```

- `npm test` içindeki test listesi elle yazılıdır: yeni `*.test.ts` dosyasını `package.json`'a da ekle.
- `tsconfig.json` testleri tip denetiminden hariç tutar; build testleri kontrol etmez.
- `web/tests/*-acceptance.js` ve `footprints-fixtures.mjs` `npm test` ile çalışmaz; yollar ortam değişkenleriyle verilir (`AFC_FIXTURES_DIR`, `AFC_VIDEO_FIXTURE`, `AFC_SCREENSHOT_DIR`, `AFC_FIXTURE_CACHE_PARENT`, `AFC_PYTHON`; ayrıntı `web/README.md`).
- CI: `.github/workflows/web-ci.yml` (Node 24, ffmpeg, `npm ci` / `npm test` / `npm run build`). CI yeşil olmadan birleştirme.

## Değişmez kurallar

- **Gizlilik sınırı:** Medya sunucuya gönderilmez. `server.mjs` yalnız `web/dist`'i sunar; CSP `connect-src 'none'`. Upload endpoint'i, analitik veya harici istek ekleme.
- **Kayıpsız ve fail-closed:** Piksel yeniden kodlanmaz; her çıktı yeniden ayrıştırılır ve kodlanmış görüntü yükü SHA-256 ile karşılaştırılır. Doğrulanmayan çıktı kullanıcıya verilmez. Bilinmeyen/bozuk/belirsiz yapı sessizce temizlenmez, engellenir.
- **Dürüst metin:** Uygulama AI üretimini kanıtlamaz; görünmez filigran (SynthID vb.) kaldırmaz; C2PA imzası doğrulanmaz. UI metinleri bu sınırları abartmamalı.
- Ayrıştırıcı bütçelerini (boyut, derinlik, öğe sayısı, süre) gevşetirken gerekçe ve test ekle.

## Kod haritası (`web/src`)

- `main.tsx` — tek `App`: dosya seçimi, onaylar, Worker yaşam döngüsü, indirme.
- `inspect.worker.ts` / `video.worker.ts` — görsel ve video işleri; sözleşme `protocol.ts`.
- `engine.ts` — JPEG/PNG/WebP kapsayıcıları, metadata politikası, çıktı doğrulama.
- `footprints.ts` — AI beyanı / ipucu / provenance ayrımı ve işlem planı.
- `c2pa.ts`, `cbor.ts`, `c2pa-structure.ts` — C2PA okuma (JPEG APP11, PNG `caBX`, WebP `C2PA`) ve yapı doğrulama; `xmp.ts` — XMP alt kümesi.
- `video.ts` — MP4/MOV aynı uzunlukta dönüşüm.

## Kurallar

- UI açıklama metinleri Türkçe. Bazı etiketler **bilinçli olarak İngilizce** kalır (karar 2026-11-18): "Remove AI Footprint", "Download", "File Type", "Image Size", "Megapixels", "C2PA Status", "Actions History" ve benzeri. Bunları Türkçeleştirme.
- C2PA kaldırma onay penceresi açmaz (karar 2026-11-18): hem `Remove AI Footprint` hem `Yalnız C2PA’yı Kaldır` düğmeye basınca çalışır; kapsam ve kaybolan bilgiler düğmenin yanında yazılır. Hak/telif gerektiren metadata temizliğinin `ConsentDialog`'u ayrı ve korunur.
- Tüm çıktı dosyaları `<ad>-removed.<uzantı>` adını alır (görsel, C2PA, metadata, video).
- Satır sonları LF (`.gitattributes`). Lint/format aracı henüz yok.
- `.kilo/` günlükleri ve `*.zip` yedekleri commit'lenmez.
