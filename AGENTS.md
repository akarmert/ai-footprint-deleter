# AGENTS.md

AI Footprint Cleaner: görsel ve videodaki desteklenen metadata ve gömülü C2PA kayıtlarını tarayıcıda inceleyip yeniden kodlamadan temizleyen web uygulaması. Ürün `web/` altındadır (React 19, TypeScript, Vite, Node 24). Mimari: [`DESIGN.md`](DESIGN.md). Kullanım ve kurulum: [`README.md`](README.md).

## Çalışma düzeni (kullanıcı kararı)

- Kullanıcıyla Türkçe konuş. Kod, kod yorumları ve commit mesajları İngilizce; kullanıcıya görünen metin ve dokümanlar Türkçe.
- Branch, PR, worktree veya ayrı oturum açma. Her şey doğrudan `main` üzerinde yürür.
- `git push` yalnız kullanıcı açıkça "evet" dedikten sonra yapılır. Kullanıcı istemeden commit atma, dal veya etiket silme.
- Her geliştirmeden sonra ilgili dokümanları (`README.md`, `DESIGN.md`, `CHANGELOG.md`, bu dosya) aynı iş içinde güncelle ve hangilerine dokunduğunu bildir.
- Doğrulama raporunda gerçekten çalıştırdığın komutları ve sonuçlarını yaz; çalıştırmadığını doğrulanmış gibi sunma.

## Komutlar (`web/` içinde)

Tam komut listesi [`README.md`](README.md) içindedir. Her değişiklikten sonra: `npm run lint`, `npm run format:check`, `npm run typecheck:tests`, `npm test`, `npm run build`, `npm run test:e2e`.

- Prettier: 120 sütun, tek tırnak. Testler `tsconfig.test.json` ile ayrıca tip denetiminden geçer; `src/**/*.test.ts` otomatik keşfedilir.
- `web/tests/footprints-fixtures.mjs` (C2PA örnek ölçümü) `npm test` ile çalışmaz.
- CI: `.github/workflows/web-ci.yml` yukarıdaki kontrolleri ve e2e'yi çalıştırır. Push öncesi aynı kontroller yerelde yeşil olmalı.

## Değişmez kurallar

- **Gizlilik sınırı:** Medya sunucuya gönderilmez. Upload endpoint'i, analitik veya harici istek ekleme. CSP `connect-src 'none'` korunur. Sunucu istek sırasında iş yapmaz (sıkıştırma derlemede).
- **Kayıpsız ve fail-closed:** Piksel yeniden kodlanmaz. Her çıktı yeniden ayrıştırılır ve kodlanmış görüntü yükü karşılaştırılır; doğrulanmayan çıktı verilmez. Bilinmeyen, bozuk veya belirsiz yapı sessizce temizlenmez, engellenir.
- **Dürüst metin:** Uygulama AI üretimini kanıtlamaz, görünmez filigranı (SynthID vb.) kaldırmaz, C2PA imzasını doğrulamaz. Arayüz metinleri bu sınırları abartmamalı.
- Ayrıştırıcı bütçelerini (boyut, derinlik, öğe sayısı, süre) gevşetirken gerekçe ve test ekle.

## Arayüz kararları

- Arayüz açıklamaları Türkçe. Bilinçli olarak İngilizce kalan etiketler (2026-11-18): "Download", "File Type", "Image Size", "Megapixels", "C2PA Status", "Actions History". Türkçeleştirme.
- Tek akış (2026-11-19): görsel ve videoda tek temizleme düğmesi **Tüm Metadata'yı Kaldır**. Onay penceresi, mod seçimi ve ayrı C2PA/metadata düğmeleri yoktur. Ayrıntılar bölümü yalnız bilgi gösterir.
- Sonuç başlığı (2026-11-18): bir şey bulunduysa her zaman **AI METADATA BULUNDU**; fark başlığın altındaki açıklama cümlesindedir. Metadata var ama tam incelenemediyse **METADATA BULUNDU**; tarama hiç rapor üretemediyse **METADATA ANALİZİ TAMAMLANAMADI**.
- Tüm çıktılar `<ad>-removed.<uzantı>` adını alır.
- Görsel tasarım (gece mavisi zemin, hareketli yıldız alanı, şeffaf dosya kartı) yalnız ilgili bir görev açıldığında değiştirilir.

## Dosya kuralları

- Satır sonları LF (`.gitattributes`). `web/tests/*-acceptance.js` Prettier dışıdır ve sonunda `;` olmamalıdır (`browser_run_code` girdisi). Toplu biçimlendirme commit'leri `.git-blame-ignore-revs`'e eklenir.
- `*.zip` yedekleri commit'lenmez.
- Eski Python masaüstü uygulaması ana daldan kaldırıldı; son hâli `b41b838` commit'inde (`git show b41b838:main.py`).
