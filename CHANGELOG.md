# Changelog

## 0.2.0b1 — kabul takibi — 2026-10-12

- Frekans paneli 980×720 desteği, yatay taşmayı kaldıran kontrol yerleşimi ve Türkçe metrikler.
- Gerçek yerel fotoğraf için ayrı süreç benchmark, min/max süreler, timeout, soft-budget ret ölçümü ve no-overwrite kanıt çıktısı.
- NASA Apollo 17 fotoğrafında 3 tekrar ve 96 MiB kontrollü ret; 322 başarılı regresyon testi, güncel Windows EXE/frozen smoke exit 0.
- Eski README kapsam ifadeleri düzeltildi. Fiziksel düşük RAM, temiz Windows ve native ağ izolasyonu açık kapıları korunur.

## 0.2.0b1 — Phase2B — 2026-10-11

- NumPy2.5.4, Qtbağımsız FFT/Hann,YCbCr,DCT-II,global8grid,RAPSD ve percentilepresentation motorları.
- Mevcut snapshot/sourcehash/scheduler/sharedbudget üzerinde readonly frekans orkestrasyonu.
- AI İz Analizi içinde gerçekFFT/DCT/Radyalpaneller;Y/Cb/Cr,window/tile,log/DC/percentile/manualscale kontrolleri.
- Matematikselreferans testleri, ayrı frekansbenchmark ve yöntem/kapsam belgeleri; eski182test ve tarihselkanıtlar korunur.
- AI/filigrantespiti veya JPEGnativequantizedcoefficient iddiası yoktur.

## Dashboard yeniden tasarımı — 2026-10-11 (v0.2.0a1)

- Genel Bakış gerçek tarama verisiyle koyu status kartı, dosya başlığı, ayrı metadata/kapsayıcı sayaçları, kategori filtreleri ve lazy accordion panelleri sunar.
- C2PA imza/içerik/trust ve kayıtlı AI/filigran beyanları ayrılır; araç kütüphanesi model adı olarak sunulmaz.
- Read-only worker sunum modeli ve final kaynak SHA256 kontrolü; generation/cancel/sourcechanged kart temizleme.
- Bounded PlainText satırlar ve kontrollü detay inceleme; opak alan sayısı bilinmiyor, missing/unsupported kapsamı açık.
- Takip kontrolü: boş XMP/IPTC filtrelerinde genel “bulunamadı” mesajı yerine semantik ayrıştırma desteği ve yokluk kanıtı olmadığı açıklanır; doğrulaması eksik kaynakta “kontrol edilemedi” ayrımı korunur.
- Yeni Dashboard testleri, native Windows resize/scroll kanıtı ve Dashboard bağlı frozen smoke. Mevcut metadata/C2PA/analiz güvenlik çekirdeği değiştirilmedi.

## 0.2.0a1 — Phase 2A — 2026-10-10

- Qt bağımsız read-only Image Analysis Engine, SHA256 bağlı file-backed snapshot ve generation kimliği.
- Kullanılabilir RAM tabanlı yapılandırılabilir soft MemoryBudget ve FIFO rezervasyonları; preview ile ortak kaynak koordinasyonu.
- Tek aktif analiz scheduler, cooperative cancel, gerçek karo ilerlemesi.
- Takip kontrolü: son karo sonrası kaynak SHA256 doğrulaması bitmeden %100 gösterilmesi düzeltildi; son doğrulama ayrı bekleme durumu, tamamlanma yalnız doğrulanmış sonuçta gösterilir.
- Core/halo ayrımlı tiled aggregation; gerçek RGB/RGBA/L kanal min/max/mean/population std ve256-bin histogramlar; Pillow integerBT601 luminance.
- Mevcut AI İz Analizi ekranına gerçek bilgi/istatistik/histogram/resource/source-integrity entegrasyonu; AI olasılığı üretilmez.
- Privacy-Safe analiz raporu, kalite karşılaştırması sözleşmeleri (hesaplanmamış SSIM/PSNR Unsupported).
- Ayrı analysis benchmark scripti ve Phase2A mimari/bellek/test/performans belgeleri.
- v0.1.1 SHA256 CustomMode koruması, metadata/C2PA motoru ve78 eski testin korunması kabul koşuludur; gerçekleşmiş son kanıtlar ANALYSIS_TEST_RESULTS belgesindedir.

## 0.1.1 — 2026-10-10

Security, stability and verification hardening; mevcut Qt/service mimarisi korunur.

- PNG/JPEG/WebP için sıkıştırılmış görüntü payload hash doğrulaması; pixel eşitliği bağımsız kontrol olarak korunur.
- Karo bazlı pixel karşılaştırması, stream kaynak hash, bounded metadata gösterimi ve son20 rapor geçmişi.
- C2PA presence, okunabilirlik, imza, içerik hash ve trust durumlarının ayrılması; bozuk/eksik/unsupported sonuçlarda güvenli hata.
- Telif yönetim kapsayıcıları için varsayılan koruma ve ayrı kaldırma onayı; JPEG C2PA kaldırma yasağı korunur.
- Cooperative iptal, hata/kapanış lifecycle testleri ve GUI'de bloklamayan worker bitiş kontrolü.
- Varsayılan Privacy-Safe Report; Standard Report için açık hassas veri uyarısı.
- Geçici dosya journal ve crash kalıntısı uyarısı; otomatik aday dosya silme yapılmaz.
- Gerçek Windows working-set benchmark scripti ve onedir build için açık smoke-test modu.
- Güvenlik, bağımlılık, performans, test ve bilinen sınırlama belgeleri.
- Takip kontrolü: UI temizleme seçimleri analiz edilen kaynağın SHA-256 değerine bağlandı; analizden sonra değişen dosyada eski Custom seçimlerinin farklı kapsayıcılara uygulanması engellendi.

Test/build/benchmark gerçekleşmiş kanıtları `docs/TEST_RESULTS.md` ve `docs/PERFORMANCE.md` içindedir; bu liste tek başına test başarısı iddiası değildir. Tam native ağ izolasyonu veya ticari yayın hazırlığı garanti edilmez.

## 0.1.0 — 2026-10-10

İlk sınırlı Faz1: Qt UI, gerçek metadata tarama/temizleme, resmî SDK C2PA okuma, görüntü karşılaştırma ve JSON raporlama. v0.1.1 başlangıcında 18 mevcut test tekrar çalıştırıldı.
