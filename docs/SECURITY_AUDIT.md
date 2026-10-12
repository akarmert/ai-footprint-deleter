# v0.1.1 güvenlik denetimi

Tarih: 2026-10-10. Başlangıç: v0.1.0, 18 test **1.71 s** içinde geçti. Git bulunmadığından kaynak başlangıcı proje dışında `afc-v010-baseline.zip` olarak korundu; mevcut kullanıcı kaynakları temizlenmedi/resetlenmedi.

## Kaynak incelemesi — değişiklik öncesi bulgular

| Konum / fonksiyon | Risk | Bulgu ve hedeflenen düzeltme |
|---|---|---|
| `workflow.clean` | Yüksek | Sadece decoded pixel eşitliği kayıpsızlık kanıtıydı; sıkıştırılmış görüntü payload hash karşılaştırması ekleniyor. |
| `workflow.clean` / `read_image` | Orta | Tam çözünürlüklü eşzamanlı `tobytes()` kopyaları ve son kaynak `read_bytes()` bellek pikini büyütüyordu; tiled karşılaştırma ve stream hash. |
| `workflow.scan` | Orta | Metadata satır/sunum ve manifestler rapor geçmişini büyütebilirdi; bounded sunum/rapor geçmişi. |
| `workflow.clean` | Yüksek | Genel EXIF/XMP/IPTC temizliği telif yönetim bilgilerini de silebiliyordu; hak grubu koruması ve ayrı açık onay. |
| `containers.chunks/strip` | Orta | WebP VP8X uzunluğu/flags ve bilinmeyen segment davranışı yeterince test edilmemişti; yapısal kontroller ve corpus regresyonları. |
| `reader.inspect_c2pa` | Yüksek | Presence/readability/signature/hash/trust ayrımı yetersizdi; ayrı durumlar ve eksik/invalid fail-closed. |
| `MainWindow._task_finished` | Orta | GUI thread üzerinde sınırsız waitForDone; nonblocking lifecycle kontrolü. |
| `WorkflowTask`, `MainWindow.closeEvent` | Orta | Gerçek iptal yoktu; cooperative cancellation ve shutdown kontrolleri. |
| `MainWindow._export_json` | Yüksek | Standart rapor ham GPS/prompt/manifeste sahipti; varsayılan Privacy-Safe Report allowlist ve Standard uyarısı. |
| `MainWindow._reports` | Orta | Sınırsız geçmiş tam raporlar tutuyordu; son20 ile sınır. |
| `workflow` temp akışı | Orta | Crash sonrası geçici dosyalar için kayıt/uyarı yoktu; bounded yerel journal, yalnız uyarı/manual inceleme, otomatik dosya silme yok. |

## Sonuçlanan düzeltmeler

Tablodaki düzeltmeler uygulandı; kaynak/payload/pixel kontrolleri, iptal/hata/close ve privacy raporları test edildi. Bağımsız inceleme PNG `XML:com.adobe.xmp` iTXt hak korumasının atlandığını buldu: bu kapsayıcı artık sıkıştırılmış/açık fark etmeksizin varsayılan korunur, XML açılmadan ayrı onay gerekir. Normal Author privacy davranışı korunur. İnceleme C2PA absent safe raporunda ayrı durum kaybı da buldu: bütün absent durumları NotApplicable scalar alanlarla ve ağ yapılandırma kategorisiyle dışa aktarılır; ham manifest aktarılmaz.

GUI önizleme decode işi arka plana taşındı; stale/cancel sonuçları generation token ile yok sayılır, aynı anda en çok2 decode. Measured RAM artışı PERFORMANCE'da açıkça yazılıdır; bellek iyileşmesi genellemesi yapılmaz. 128MiB/40MP sınırları korunur.

Mimari korunmuştur: Qt UI → worker → Workflow → metadata/C2PA adaptörleri. Watermark registry ve gelecekteki algoritmalar UI bağımsızdır. Büyük FFT/DCT motoru veya yeni ağ servisi eklenmedi.

## Dosya sistemi güvenlik modeli

Kaynak snapshot'ı okunur; orijinal açma modu yazmaya izin vermez. Çıktı doğrulanmış temp dosyasından Windows no-clobber `rename` ile yayınlanır; POSIX `link` yaklaşımı ayrı platformda doğrulanmadı. Mevcut hedefe yazma/silme yoktur. Normal hata/cancel akışında temp temizliği yapılır. Zorla süreç sonlandırma/power loss geride hassas `.afc-*` bırakabilir; journal bu adayları gösterir fakat sahiplik ispatı değildir.

Journal `%LOCALAPPDATA%/AI-Footprint-Cleaner/temp-journal` altında dosya yolu tutar; bu da hassas olabilir. Yalnız kayıtlı, sınırlandırılmış adaylar okunur; bilinmeyen dizinler disk genelinde taranmaz, adaylar otomatik silinmez. Aynı kullanıcının kötü amaçlı dosya sistemi değiştirmeleri ve native decoder exploitlerine karşı sandbox güvencesi yoktur.

## Ağ durum kategorileri

- **Static Configuration Verified:** kaynakta offline ayar alanları ve native Settings kabulü kontrol edilmiştir; paket yakalama değildir.
- **Runtime Network Tested:** belirtilen runtime yolunda belirtilen gözlem/engelleme yöntemiyle test yapılmıştır; sadece o sınır için kanıt sağlar.
- **Network Attempt Detected:** testte bağlantı girişimi gözlenmiştir; başarıyla bağlanması gerekmez.
- **Not Tested:** ilgili ağ yolu gözlenmemiştir; sessiz başarı değildir.

SDK `verify.remote_manifest_fetch=false`, `verify.ocsp_fetch=false`, `core.allowed_network_hosts=[]` kullanır. Python socket guard entegrasyon testi native DLL socket'lerini kapsamaz. CAWG resolver ve sertifika trust/OCSP native yolları için tam ağ izleme gerekir. Firewall kuralları kullanıcı sistemi üzerinde sessizce değiştirilmez. Paket yakalama/firewall deny-all testinin durumu final TEST_RESULTS içinde açıkça yazılır.

## Kapsam sınırı

Bu denetim yasal uygunluk, kusursuz anonimleştirme, tüm özel metadata türlerinin saptanması veya ticari yayın sertifikası değildir. C2PA manifest okuma AI üretimi veya güvenilir sertifika kanıtı değildir. SDK raw validation bilgileri Standard Report içinde kullanıcı onayıyla incelenebilir. Native SDK, decoder ve build dependency supply-chain riskleri kalır.
