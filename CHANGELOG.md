# Changelog

## Web — yayımlanmamış

- Performans: büyük görsellerde tarama ve temizlik hızlandı (120 MiB PNG: Tüm Metadata'yı Kaldır 5,6 s → 2,0 s; 53 MiB JPEG 1,9 s → 1,4 s); doğrulama kapsamı aynı. Bellek tepe değeri değişmedi.
- Yeni „Tüm Metadata'yı Kaldır" düğmesi: C2PA ile birlikte EXIF, XMP, IPTC, yorumlar ve PNG metinleri tek tıkta, tek doğrulanmış işlemde silinir; ICC ve yön bilgisi taşıyan EXIF korunur. Gerçek Gemini/ChatGPT dosyalarında tam kaldırma doğrulandı.
- Tam incelenemeyen metadata (çoğu fotoğraftaki EXIF/ICC) artık „METADATA ANALİZİ TAMAMLANAMADI" yerine „METADATA BULUNDU" başlığıyla gösterilir; tamamen başarısız tarama eski başlığı korur.
- Sonuç özetinde bulunan her durum (AI beyanı, AI ipucu, yalnız C2PA kaynak kaydı) „AI METADATA BULUNDU" başlığını kullanır; ayrım açıklama cümlesinde kalır.
- Dosya bilgilerinde „AI aracı (beyan)": dosyanın kendi C2PA/metadata kayıtlarında adı geçen AI aracı (ör. Google Gemini, ChatGPT, Midjourney, Adobe Firefly, Stable Diffusion) seçili dosya kartında ve Dosya Bilgileri bölümünde gösterilir. Doğrulanmamış beyandır; kayıt yoksa „Dosyada belirtilmemiş" yazar.
- Çoklu görüntü (MPF / Ultra HDR) JPEG desteği: EOI sonrası ikincil görüntüler artık taramayı reddettirmiyor; MPF dizini tam doğrulanır, ikincil görüntüler bayt bayt korunur, kaldırmalarda MPF boyut/offset alanları güncellenir. İkincil görüntülerdeki metadata kaldırılmaz ve bu açıkça bildirilir.
- PNG `caBX` ve WebP `C2PA` manifest içeriği okunur; AI beyanı listesi `compositeWithTrainedAlgorithmicMedia`'yı da kapsar.
- C2PA kaldırma onayı tek kurala bağlandı: `Remove AI Footprint` ve `Yalnız C2PA’yı Kaldır` ayrı onay penceresi açmaz; kapsam ve kaybolan bilgiler düğmenin yanında yazılır. Hak/telif onayı gerektiren metadata temizliği onay penceresini korur.
- Tüm indirilen ve diske yazılan çıktılar `<ad>-removed.<uzantı>` adını alır.
- Sonuç ekranları piksel içi filigranların (ör. SynthID) kaldırılmadığını açıkça söyler; başlıklar kaldırılan kapsamı tam adlandırır.
- SSS, kök README ve proje özeti güncel C2PA akışına göre düzeltildi; görsel Worker'daki eski „Faz 2" hata metni değiştirildi.
- Altyapı: GitHub Actions web CI (Node 24, `npm ci` / `npm test` / `npm run build`), `CLAUDE.md`, `.gitattributes` (LF), `.kilo` oturum günlükleri depodan çıkarıldı.

## Web 0.1.0 — 2026-11

- Tarayıcı içinde çalışan React/TypeScript/Vite web uygulaması ve yalnız statik içerik sunan Node sunucusu (Docker/Railway).
- JPEG/PNG/WebP metadata taraması ve yeniden kodlamasız, çıktısı yeniden doğrulanan temizlik; Güvenli ve Kapsamlı modlar.
- Dar kapsamlı MP4/MOV video taraması ve OPFS/geçici klasör üzerinden doğrulanmış disk çıktısı.
- JPEG C2PA manifest okuma; yapısal doğrulamalı gömülü C2PA deposu kaldırma (JPEG/PNG/WebP) ve bağlı tek yerel XMP provenance referansının atomik kaldırılması.
- Birleşik AI footprint akışı: açık AI beyanı, metadata ipucu ve provenance ayrımı; `REMOVED_VERIFIED` / `PARTIALLY_REMOVED` / `BLOCKED` sonuçları.
- Koyu temalı modüler arayüz, yıldız alanı arka planı ve azaltılmış hareket desteği.

## Masaüstü 0.1.0 – 0.2.0b1 (2026-10)

Python/PySide6 masaüstü uygulaması. 2026-11-19'da ana daldan kaldırıldı; son hâli `desktop-legacy` etiketinde.
