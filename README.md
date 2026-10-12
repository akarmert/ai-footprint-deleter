# AI Footprint Cleaner — 0.2.0b1 (Phase 2B)

## FFT / DCT / Radyal analiz kullanımı

Görseli açıp taramayı tamamlayın. **AI İz Analizi → FFT / DCT / Radyal** alt sekmesinde tile/window/mean seçerek frekans analizini başlatın. Y/Cb/Cr decodedkanalları,2DHannvarsayılanwindow, globalorigin8×8DCT ve hamgüçRAPSD hesaplanır. Kanal ve log/percentile/DC/sabitkontrast ayarları yalnız görünümü değiştirir; window/tile/mean değişimi yeniden analiz gerektirir. Son kaynakdoğrulama bitmeden100gösterilmez.

Bu motor AI kökenini veya filigranı saptamaz; spektralörüntüler teknikistatistiktir. Tiledspectrum globalgörüntüFFT değildir. DCT nativeJPEG kuantizekatsayıları değildir. FFT/DCT kaynak dosyayı değiştirmez. NumPy2.5.4 yeni sabit bağımlılıktır; SciPy/MLframework yoktur.

Belgeler: [Frekans mimarisi](docs/FREQUENCY_ARCHITECTURE.md), [Yöntemler](docs/FFT_DCT_METHODS.md), [Windowing](docs/WINDOWING_AND_LEAKAGE.md), [Chroma](docs/CHROMA_ANALYSIS.md), [DCT grid](docs/DCT_GRID_ALIGNMENT.md), [RAPSD](docs/RADIAL_POWER_SPECTRUM.md), [Testler](docs/FREQUENCY_TEST_RESULTS.md), [Performans](docs/FREQUENCY_PERFORMANCE.md). ÖncekiPhase2A/Dashboardkanıtları korunur.

Phase2A: gerçek ham piksel istatistikleri, RGB/luminance histogramları, source SHA256 bağlı snapshot, karo işleme ve ortak soft bellek bütçesi. AI üretimi tespiti değildir.

Yeni belgeler: [Analiz mimarisi](docs/ANALYSIS_ARCHITECTURE.md), [Bellek modeli](docs/MEMORY_MODEL.md), [Analiz testleri](docs/ANALYSIS_TEST_RESULTS.md), [Analiz performansı](docs/ANALYSIS_PERFORMANCE.md). Eski v0.1.1 test/benchmark kanıtları aşağıdaki bağlantılarda korunur.

## Genel Bakış — metadata ve kaynak özeti

Görsel açıldığında Genel Bakış'ta gerçek dosya bilgileri, metadata/kapsayıcı sayaçları ve kaynak kayıtları görünür. Kategori düğmeleri görünümü filtreler; **Tümünü Aç / Tümünü Kapat** panelleri kontrol eder. Büyük değerleri çift tıklama veya Enter ile sınırlı düzmetin detayında inceleyin. Tarama kapsamı düğmesi bulunamadı/desteklenmiyor/kontrol edilemedi açıklamalarını açar.

C2PA imza, içerik hash ve sertifika güveni ayrı sonuçlardır. Claim Generator model adı değildir. AI üretim beyanı dosyanın kaynak iddiasıdır; SynthID geçen ifade filigran dedektörü sonucu değildir. Opak metadata alt alanları `? / Bilinmiyor` gösterilir; alan sayısı ile kapsayıcı sayısı ayrı tutulur. Dosya özellikleri metadata toplamına katılmaz. Dashboard salt okunurdur; temizlemek için Metadata Temizleyici'ye geçin.

Yeni kaynak seçimi eski kartları temizler. Tarama worker'ı son kaynak hash'ini doğrulamadan güncel özet yayınlamaz. Kaynak değişirse yeniden tarama gerekir. YeniDashboard ek tam çözünürlüklü önizleme decode başlatmaz.

Belgeler: [Dashboard mimarisi ve sayımlar](docs/DASHBOARD_ARCHITECTURE.md), [Dashboard test sonuçları](docs/DASHBOARD_TEST_RESULTS.md).

## Phase2A kullanımı

Görseli normal akışta açıp metadata analizini tamamlayın; **AI İz Analizi** ekranında temel analizi başlatın. Gerçek karo ilerlemesini, kanal min/max/mean/std ve histogramları inceleyin. RGB/RGBA/L 8-bit ham örnekler desteklenir. Alpha dahil bütün pikseller sayılır; ICC dönüşümü uygulanmaz, EXIF orientation uygulanmadan storage istatistiği alınır. Diğer renk modları Unsupported olarak belirtilir.

Kaynak ilk analizden sonra değişirse yeni analiz ve Custom metadata temizliği eski SHA256 ile çalışmaz; görseli yeniden analiz edin. Yeni dosya seçimi eski generation sonuç/histogramlarını geçersiz kılar. İşlem iptali native decoder ortasında değil güvenli checkpoint'te gerçekleşir.

Analiz salt okunurdur. Karo işleme gerçek streaming decode garantisi değildir; yetersiz soft budget kontrollü reddetme/bekleme uygular. Bu piksel analizi PSNR/SSIM, gürültü/doku veya AI yüzdesi hesaplamaz; FFT/DCT ayrı frekans sekmesindedir. Analiz raporu varsayılan Privacy-Safe dışa aktarılır; kaynak hash/yol/snapshot kimliği aktarılmaz.

Benchmark: `.\.venv\Scripts\python scripts\benchmark_analysis.py --output docs\analysis-new-run.json` (yeni çıktı adı kullanın). Eski `scripts/benchmark.py` değişmeden korunur.

Yalnız yetkili olduğunuz görsellerde kullanın. Telif ve kaynak yönetim bilgilerini kaldırma yetkisi kullanıcı sorumluluğundadır; bildirim hukuki uygunluk garantisi değildir.

v0.1.1 denetim belgeleri: [Güvenlik](docs/SECURITY_AUDIT.md), [Testler](docs/TEST_RESULTS.md), [Performans](docs/PERFORMANCE.md), [Bağımlılıklar](docs/DEPENDENCIES.md), [Sınırlar](docs/KNOWN_LIMITATIONS.md), [Değişiklikler](CHANGELOG.md).

Windows için çevrimdışı görüntü metadata gizliliği uygulaması. Bu sürüm **Faz 1, Faz 2A ve Faz 2B analizlerini içeren beta uygulamadır**; ticari dağıtıma hazır sertifikalı ürün değildir. AI üretimi saptamaz, dedektör yanıltma veya görünmez filigran kaldırma garantisi vermez.

## Çalıştırma (Windows PowerShell)

Python 3.12–3.15 64-bit hedeflenir; bu makinede Python **3.13.12** ile test edildi.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python main.py
```

Geliştirme testleri:

```powershell
.\.venv\Scripts\python -m pip install pytest==9.1.1
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m pip check
```

## Kullanım

1. **Görsel Aç** veya dosyayı pencereye sürükleyip bırakın. Tarama arka planda başlar.
2. Görsel Analizi sayfasında metadata, dosya SHA-256 özeti, çözümlenmiş EXIF/PNG alanları ve resmî SDK C2PA çıktısını inceleyin.
3. Meta Veri Temizliği sayfasında Privacy, Advanced veya Custom seçin.
   - **Privacy:** kaldırılabilir EXIF, XMP, yorum ve PNG metin gruplarını kaldırır. Telif işaretli gruplar ve semantiği belirsiz IPTC korunur; ayrı hak kaldırma onayı gerekir. ICC korunur. Korunan gruplarda kişisel bilgiler kalabilir.
   - **Advanced:** seçilen kategorilerin kaldırılabilir kapsayıcı grupları.
   - **Custom:** analiz tablosunda işaretlenen kapsayıcı grupları. Tekil EXIF alt etiketlerini bağımsız düzenleme henüz yoktur.
4. C2PA kayıtlarının kaldırılması ayrı onay gerektirir. İmzalı dosyada diğer metadata değişiklikleri de imzayı etkileyebileceğinden onaysız değişiklik engellenir.
5. Yeni ve kullanılmayan bir çıktı adı seçin. Format değiştirilemez. Orijinal ve mevcut çıktılar üzerine yazılmaz.
6. Önce/sonra panellerinde fare tekerleğiyle yakınlaşın, sürükleyerek kaydırın; görüntüye sığdır kontrollerini kullanın.
7. Raporlar sayfasından JSON dışa aktarın. **Privacy-Safe Report varsayılandır**: ham metadata, manifest, yollar, dosya hashleri ve kişisel değerler aktarılmaz. Standard Report açık onayla seçilir ve GPS/prompt/kimlik içerebilir. Son20 rapor bellekte tutulur; dışa aktarılan dosyalar kalır.
8. İşlemi İptal Et güvenli checkpoint'te durdurur; native decode/SDK çağrısı ortasında zorla kesme yapılmaz. Kapanış iptal isteyerek worker dönüşünü bekler.
9. Başlangıçta eski `.afc-*` adayı uyarısı varsa Ayarlar bölümünü inceleyin. Adaylar otomatik silinmez; sahipliği doğrulamadan manuel silmeyin.

## Gerçek çalışan kapsam

- PySide6/Qt koyu tema, sekiz bölümlü navigasyon; analiz ve temizlik QThreadPool ile çalışır.
- JPG/JPEG, PNG, WebP ve tek sayfalı TIFF açma/tarama.
- EXIF/alt IFD, PNG metin, XMP/IPTC kapsayıcı varlığı ve ham önizleme, ICC ve C2PA inceleme.
- PNG/JPEG/WebP kapsayıcılarından yeniden kodlamadan seçilebilir metadata silme.
- Orijinal hash, gerçek format, dosya boyutu ve çözünürlük sınırları; bozuk dosyalarda hata.
- Resmî `c2pa-python` Reader, SDK doğrulama bulguları ve manifest JSON. Çevrimiçi manifest/OCSP istekleri kapalı; ağ host listesi boş.
- Çıktıyı tekrar açma; metadata kapsayıcıları, çözünürlük, mod/alpha, ICC, etkin orientation, birebir decoded pixel eşitliği ve sıkıştırılmış payload SHA256 eşitliği denetimi.
- JSON analiz/işlem raporları, UTC işlem zamanı, kaldırılan/korunan kapsayıcılar.
- Gelecek yetkili filigran dedektörleri için Protocol/registry; kurulu dedektör yoksa `Not Supported`.

## Açık sınırlamalar

- TIFF temizliği yok; TIFF salt analizdir. Animasyon ve çok sayfalı görüntüler reddedilir.
- JPEG C2PA kaldırma desteklenmez: genel JUMBF APP11 kayıtlarına zarar vermemek için korunur ve imzalı JPEG değişiklikleri engellenir. PNG/WebP desteklenen C2PA chunk'ları ancak SDK sonrası yokluk kontrolüyle kaldırılabilir.
- EXIF Orientation 1 dışında ise EXIF silme engellenir; yönü koruyacak dönüştürme Faz 3'e bırakılmıştır.
- Privacy profilinin kapsamı kapsayıcı bazındadır: örneğin EXIF içindeki tarih/cihaz dışındaki alanlar da silinir. Üst grup silinirken alt alanların tümü kaybolur.
- ExifTool henüz entegre değil. IPTC ve XMP tüm semantik alanlarıyla ayrıştırılmaz. Üretim parametreleri sadece dosyada mevcut metin olarak gösterilir; model/seed/prompt tahmini yapılmaz.
- Bazı nadir metadata türleri / özel APP segmentleri silinmez. Uygulama tam anonimleştirme veya tüm kişisel bilgilerin kaldırıldığını garanti etmez.
- C2PA güven zinciri, özel trust store ve çevrimiçi iptal doğrulaması tamamlanmış değildir. SDK'nin `validation_status`, `validation_results` ve `validation_state` alanları birlikte incelenmelidir. Manifest okunması imzanın güvenilir olduğunu göstermez. Resmî test örneğinde `signingCredential.untrusted` beklenir.
- FFT/DCT ve radyal spektrum Faz 2B kapsamında çalışır. Kalite filtreleri, SSIM/PSNR/LPIPS, gürültü/doku analizi, batch, PDF, installer, uygulama ikonu ve lisans sistemi henüz desteklenmez.
- 128 MiB dosya / 40 megapiksel sınırı vardır; büyük dosyalarda birkaç görüntü kopyası nedeniyle bellek kullanımı yükselebilir. 1080p/4K/8K/39.992MP için gerçek Windows RAM ve UI benchmarkı yapıldı; sonuçlar ve bellek trade-off'u PERFORMANCE belgesindedir.
- Önizleme renk yönetimi profesyonel ICC soft-proof değildir; temizlik ICC baytlarını korur.

## Windows dağıtım yöntemi

Kaynak kökünde aşağıdaki komutlar çalıştırılır; `onedir` Qt LGPL yeniden bağlama/kitaplık değiştirme imkânını tek dosyaya göre kolaylaştırır:

```powershell
.\.venv\Scripts\python -m pip install pyinstaller==6.22.3
.\.venv\Scripts\python -m PyInstaller --noconfirm --windowed --onedir --name AI-Footprint-Cleaner --add-data "assets;assets" --collect-all c2pa main.py
```

Çıktı: `dist\AI-Footprint-Cleaner\AI-Footprint-Cleaner.exe`. v0.1.1 onedir EXE üretildi ve mevcut Windows11 geliştirme makinesinde gerçek `windows` Qt platformuyla görsel açma/tarama/temizleme/JSON smoke akışı çalıştırıldı. Temiz Windows makinesinde ve Windows10 üzerinde dağıtım testi yapılmadı; installer üretilmedi. Açık diagnostic modu: `AI-Footprint-Cleaner.exe --smoke-test <mevcut-boş-klasör>`; yalnız disposable fixture oluşturur, ağ kullanmaz. Qt DLL/pluginleri, c2pa DLL ve lisans bildirimleri dağıtıma dahil edilmeli. Windows 10/11 her ikisinde ayrı test, kod imzalama, SBOM ve installer geliştirme ticari yayın öncesi gerekir.

## Mimari

- `main.py`: Qt giriş noktası.
- `app/models/schema.py`: UI'dan bağımsız dataclass sözleşmeleri.
- `app/services/workflow.py`: tarama, güvenlik sınırları, işleme ve bağımsız çıktı kontrolleri.
- `app/ui/`: masaüstü navigasyon, metadata tablosu, raporlar, görüntü karşılaştırma.
- `app/workers/`: Qt arka plan iş sinyalleri ve yaşam döngüsü.
- `modules/metadata/containers.py`: sınırlı, doğrulamalı PNG/JPEG/WebP segment okuyucu/silici.
- `modules/c2pa/reader.py`: resmî SDK adaptörü, offline scoped context.
- `modules/watermark/registry.py`: yeni yetkili dedektörler için genişletme noktası.
- `tests/unit/`, `tests/integration/`: yerel üretilen zararsız fixture'larla testler.

Gelecek kalite/footprint/işleme modülleri Qt'ye bağımlı olmadan service katmanına bağlanmalıdır. Metadata temizleme ile filigran algılama farklı sözleşmelerdir. Yeni format desteği, C2PA/ICC/alpha koruma ve negatif testler eklenmeden etkinleştirilmemelidir.

## Bağımlılık doğrulaması ve lisans

2026-10-10 tarihinde PyPI paket JSON metadata'sı ve Windows x64 wheel varlığı kontrol edildi:

| Paket | Sabit sürüm | Bildirilen lisans |
|---|---|---|
| Pillow | 12.3.0 | MIT-CMU |
| PySide6 | 6.12.0 | LGPL-3.0-only / GPL alternatifleri veya ticari Qt lisansı |
| c2pa-python | 0.38.0 | MIT OR Apache-2.0 |
| pytest (geliştirme) | 9.1.1 | MIT |
| PyInstaller (paketleme) | 6.22.3 | GPL ve dağıtılabilir uygulama için özel bootloader istisnası |

Bu tablo hukuki uygunluk sertifikası değildir. Transitif/native bileşen lisansları ve Qt LGPL yükümlülükleri (bildirimler, ilgili kaynak erişimi, yeniden bağlama/kitaplık değiştirme) ticari dağıtımdan önce ayrıca incelenmelidir. NumPy 2.5.4 Faz 2B için kurulmuştur; OpenCV/PyTorch kullanılmaz. NumPy lisans ve wheel doğrulaması FREQUENCY_ARCHITECTURE belgesindedir.

Birincil kaynaklar:
- https://pypi.org/project/Pillow/12.3.0/
- https://pypi.org/project/PySide6/6.12.0/
- https://pypi.org/project/c2pa-python/0.38.0/
- https://pypi.org/project/pytest/9.1.1/
- https://pypi.org/project/pyinstaller/6.22.3/
- https://github.com/contentauth/c2pa-python
- https://github.com/contentauth/c2pa-rs/blob/main/sdk/src/settings/mod.rs
- https://www.qt.io/licensing/open-source-lgpl-obligations

## Güvenlik

Telemetri, hesap, uygulama tarafından sunucu yükleme ve harici komut çağrısı yok. SDK ağ hostları deny-all ve remote manifest/OCSP kapalı ayarlanır; ancak SDK CAWG resolver yolu dahil tüm native ağ yolları paket yakalama ile doğrulanmadı (c2pa-rs issue #1645). Kesin ağ izolasyonu gereken ortamda işletim sistemi firewall kuralı da kullanılmalıdır. Geçici çıktı hedef klasörde oluşturulur ve normal hata/başarı akışında silinir; zorla süreç sonlandırılırsa `.afc-*` geçici dosyaları kalabilir. Disk şifreleme veya adli silme garantisi yoktur. Doğrulanmış geçici çıktı Windows'ta üzerine yazmayan atomik rename ile yayınlanır (POSIX'te no-clobber hard link); elektrik kesintisine dayanıklı işlem günlüğü ve sandbox edilmiş decoder henüz yoktur.
