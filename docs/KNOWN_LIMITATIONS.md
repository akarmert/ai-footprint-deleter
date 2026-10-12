# Bilinen sınırlar — v0.2.0b1

## Phase2B

- FFT/DCT/RAPSD teknik gözlemdir;AI/sahtecilik/filigran sınıflandırıcısı değildir. FFT fixedtilepadding/weightedmean globalFFT ile eşdeğerdeğildir.
- RawRGB→YCbCr ICCunmanaged;JPEGoriginalsubsampledchroma/kuantizeDCT okunmaz. HiddenRGBalpha dahil. Lneutralchroma tanımlıdır.
- Edgepadding/global8grid mevcutgörüntüye aittir;geçmişJPEGgridrecover yok. Farklıwindow/tile doğrudankarşılaştırılamaz;autocontrast karşılaştırmayı yanıltabilir.
- Fiziksel 8/16 GB cihaz, geniş lisanslı fotoğraf corpus'u, native codec izolasyonu/firewall ve temiz Windows matrisi eksik. NASA Apollo 17 tek fotoğrafı 3 ayrı süreçte test edildi; geniş corpus değildir. NumPy/decoder bütçesi soft hesaptır, hard limit değildir.
- 980×720 ve 1320×900 Windows frekans paneli yatay taşma olmadan doğrulandı; dikey kaydırma gerekir. Farklı DPI/platform matrisi tamamlanmadı.
- Kod imzalama için sertifika, ticari uygulama lisansı ve installer dağıtım kararları belirlenmedi; bu oturum bunları varsayarak üretim yayını yapmaz.
- EskiFFT/DCTyok ifadesi aşağıdaki tarihselFaz2A sınırıdır;v0.2.0b1 gerçekFFT/DCT/RAPSD ekler,Noise/Texture/AItespit hâlâyoktur.

## Dashboard ilaveleri

- Sayaçlar desteklenen ve sınırlı incelenen kaynak alanlarını sayar; farklı araçların recursive metadata toplamıyla eşitlik beklenmez. Opak XMP/IPTC ve bazı özel segmentlerin alt alan toplamı bilinmez. File properties ve logicalprivacy/production tekrarları globalmetadata toplamına eklenmez.
- Dashboard en çok1024 tarayıcı alanını,64assertion/128action ve500sunum satırını inceler/gösterir. Sınırda kalan veriler için kapsam uyarısı vardır; görülmeyen beyanlar yok kabul edilmez.
- Claim Generator araç/kütüphanedir. AI ve SynthID ifadeleri kayıtlı beyanlardır, bağımsız piksel/watermark tespiti değildir; invalid/untrusted kayıtlar bu uyarıyla sunulur.
- Dashboard extra image decode yapmaz; mevcut ayrıntılı ekran önizlemeleri kendi boundedbudget/lifecycle davranışını sürdürür. Büyük manifestin SDK tarafında okunma maliyetini sunum limitleri ortadan kaldırmaz.
- Son kaynak hash kontrolünden sonra dış değişiklik olabilir; otomatik filesystem watcher yoktur, yeniişlemde yeniden doğrulama gerekir. KaynakSHA/path safe rapora yeniDashboard tarafından eklenmez.

## Phase2A ilaveleri

- Analiz RGB/RGBA/L8bit raw samples ile sınırlı; palette/CMYK/16bit/float modları Unsupported. ICC uygulanmaz, şeffaf pikseller rawRGB ile sayılır, EXIF orientation dönüştürülmez.
- Tiled crop streaming decode değildir. Soft budget native decoder/OS hardlimit değildir; metadata Workflow için bütün-process reservation yoktur. Analiz ve preview ortak tahmini rezervasyon kullanır.
- Snapshot kaynak kadar geçici disk alanı kullanır; normal kapanışta kapatılır. OS pagecache, native buffer ve kötü niyetli aynı-kullanıcı yarışları tamamen sandbox edilmez.
- Production measured_peak_memory null; ayrı benchmark gerçekprocess sayaçlarıyla ölçer. Gerçek fotoğraf corpus'u ve tam platformmatris doğrulanmadıkça genel hız/RAM garantisi yoktur.
- Sonuç belirliSHA256/snapshot/generation kimliğine aittir; sonradan dosya değişimi sonsuza kadar izlenmez. Yeni analiz/temizlikte hash yeniden kontrol edilir.

## Korunan v0.1.1 sınırları

- TIFF salt analizdir. Animasyon/çok sayfalı dosyalar reddedilir. 128 MiB ve 40 megapiksel limitleri değişmedi.
- Tekil EXIF alan düzenleme yok; kapsayıcı kaldırılması ilgili diğer alanları da kaldırır. ICC varsayılan korunur. Etkin orientation değişirse çıktı yayınlanmaz; EXIF orientation≠1 temizliği engellenir.
- JPEG C2PA kaldırma yasaktır. Genel APP11/JUMBF ve bilinmeyen özel segmentler korunur. Nadir metadata türleri tam ayrıştırılmadığı için eksiksiz anonimlik iddiası yoktur.
- C2PA presence/readability/signature/content hash/trust farklı sonuçlardır. Untrusted sertifika trusted değildir. Offline iptal/trust güncelliği garanti edilmez; re-sign/redaction yoktur.
- SDK native CAWG/sertifika ağ yollarının tamamı runtime firewall/packet capture ile test edilmeden evrensel offline güvence verilemez. Python socket guard yalnız Python sınırını kapsar. OS seviyesinde ağ izolasyonu tavsiye edilir; uygulama firewall ayarlarını değiştirmez.
- İptal cooperative'dir: native Pillow decode veya SDK çağrısının ortası zorla kesilmez; güvenli checkpoint beklenir. Pencere kapanışı çalışan görevin güvenli dönüşünü bekler. Commit tamamlandıktan sonra gelen iptal yayınlanmış çıktıyı silmez.
- Temp journal aday dosyaların sahibi olduğunu kanıtlamaz; otomatik silme yoktur. Zorla kapatma/disk arızası hassas kalıntı bırakabilir. Journal dosya yolları içerir; adli silme/şifreleme sistemi değildir.
- Dosya sistemi yarışları için no-clobber yayınlama kullanılır; aynı kullanıcı yetkisiyle kötü niyetli reparse değişimleri, filesystem driver saldırıları ve tüm ağ dosya sistemleri için garanti yoktur.
- Büyük görüntülerde iki bounded arka plan önizlemesi near40MP ölçümünde peak759MiB çalışma setine çıktı. UI latency iyileşirken RAM artmıştır; kapsamlı photo/format soak testi yoktur. 128MiB/40MP limitleri bu nedenle yükseltilmedi.
- PNG XMP kapsayıcıları içerik hak taşımıyor olsa bile konservatif korunur; IPTC ve tanınan rights-marker grupları da korunabilir. Korunan gruplarda kişisel veriler kalabileceği açıkça dikkate alınmalıdır.
- Privacy-Safe Report ham metadata/manifest/yol/hash içermez; ölçü/format/sayım bilgileri kalır. Standard Report hassas veri içerir ve paylaşılmadan incelenmelidir.
- Kalite skoru/AI kökeni tespiti, FFT/DCT/noise/texture, batch, PDF, installer, kod imzalama ve lisans aktivasyonu bu sürümde yoktur. Temel piksel istatistikleri/histogramlar gerçektir.
- Windows 11 geliştirme ortamı testleri temiz makine veya Windows 10 testinin yerine geçmez. Native decoder sandbox, tam dependency SBOM/CVE/lisans uyumluluğu ve ticari yayın incelemesi tamamlanmamıştır.

## Faz 2 sırası

Mevcut service/dataclass/adaptör sınırları UI bağımsız hesaplama modüllerini destekler. Önce tiled image-source/budget sözleşmesi ve kalibre kalite metrikleri; sonra FFT/DCT ve noise/texture istatistikleri; son olarak yetkili watermark adaptörleri ve ölçülmüş batch scheduler önerilir. Yeni analizler kanıtlanmış model olmadan AI yüzdesi veya kaynağı kesin belirleyen sertifika üretmemelidir.
