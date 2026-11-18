# AI Footprint Cleaner

Görsel ve videolardaki metadata'yı ve gömülü C2PA kaynak kayıtlarını **tamamen tarayıcıda** inceleyip, pikselleri yeniden kodlamadan temizleyen web uygulaması. Dosyalar sunucuya gönderilmez; sunucu yalnız derlenmiş statik dosyaları verir.

- **Görsel:** JPEG, PNG, WebP (en fazla 128 MiB, 40 MP). Çoklu görüntülü JPEG (MPF / Ultra HDR) desteklenir.
- **Video:** MP4, MOV (en fazla 1.000.000.000 bayt; masaüstü Chrome/Edge, File System Access gerekir).
- **Tek işlem:** „Tüm Metadata'yı Kaldır" — C2PA deposu ile EXIF, XMP, IPTC, yorumlar ve PNG metinleri tek doğrulanmış işlemde silinir. Renk profili (ICC), görüntü yönünü taşıyan EXIF ve tanınmayan bloklar korunur ve listelenir.
- **Bilgilendirme:** Dosyada adı geçen AI aracı (ör. Google Gemini, OpenAI ChatGPT) doğrulanmamış beyan olarak gösterilir.

## Sınırlar

- AI üretimini kanıtlamaz; metadata beyanları doğrulanmamış iddialardır. C2PA imzası, güven zinciri ve içerik hash'i doğrulanmaz.
- Piksel içi filigranlar (SynthID, görünür logolar) kaldırılmaz.
- Bilinmeyen, bozuk veya belirsiz yapılar sessizce temizlenmez; işlem engellenir ve nedeni gösterilir.
- Her çıktı yeniden ayrıştırılır; kodlanmış görüntü yükü bayt bayt korunur. Doğrulanmayan çıktı verilmez.
- Büyük dosyalarda bellek kullanımı dosya boyutunun birkaç katına çıkar (120 MiB PNG ≈ 1 GB); mobil tarayıcılarda sınır düşüktür.

## Geliştirme (`web/`, Node 24)

```bash
npm ci
npm run lint && npm run format:check
npm run typecheck:tests
npm test                     # birim testleri; video testleri PATH'te ffmpeg (libx264) ister
npm run build
npx playwright install chromium   # ilk kez
npm run test:e2e             # tarayıcı testleri (önce build)
npm start                    # http://localhost:3000 (PORT ile değiştirilebilir)
```

Kod haritası ve proje kuralları: [`CLAUDE.md`](CLAUDE.md). Değişiklikler: [`CHANGELOG.md`](CHANGELOG.md).

### C2PA örnek dosya ölçümü

`web/tests/footprints-fixtures.mjs`, 11 halka açık C2PA örneğini sabit commit'lerden indirip SHA-256 ile doğrular, motoru çalıştırır ve çıktıları resmî C2PA SDK ile ayrıca okur (ağ kapalı ayarlarla). Python ortamı gerekir: `pip install c2pa-python==0.38.0`.

```bash
node tests/footprints-fixtures.mjs --self-test
node tests/footprints-fixtures.mjs --download        # AFC_FIXTURE_CACHE_PARENT, AFC_PYTHON ile ayarlanabilir
node tests/footprints-fixtures.mjs --cache <klasör>
```

## Yayın (Railway)

Docker imajı yalnız `dist/` ve `server.mjs` içerir; medya işleme sunucuda yapılmaz.

| Railway ayarı | Değer |
|---|---|
| Root Directory | `/web` |
| Build | `web/Dockerfile` (otomatik algılanır) |
| Healthcheck | `/healthz` |
| Port | Railway `PORT` değişkeni (varsayılan 3000) |
| Secrets / Volumes | Gerekmez |

Sunucu yalnız GET/HEAD kabul eder, dotfile/traversal/symlink isteklerini reddeder ve CSP `connect-src 'none'`, `worker-src 'self'` ile sayfanın dışarıya bağlantı kurmasını engeller. `npm run build` metin dosyalarının `.br`/`.gz` kopyalarını bir kez üretir; sunucu istek sırasında sıkıştırma yapmaz, yalnız uygun kopyayı seçer. Parmak izli `/assets/*` dosyaları bir yıl `immutable` önbelleklenir, `index.html` hiç önbelleklenmez; böylece yeni sürüm anında yüklenir ve tekrar ziyaretlerde sunucuya neredeyse istek gitmez. Altyapı erişim logları statik istek URL'lerini görebilir; dosya adları hiçbir isteğe eklenmez.

Eski Python/PySide6 masaüstü uygulaması ve eski raporlar `desktop-legacy` git etiketinde arşivlidir.
