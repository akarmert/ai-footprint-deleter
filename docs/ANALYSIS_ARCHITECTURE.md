# Phase 2A Analiz mimarisi — v0.2.0a1

## Başlangıç ve sınırlar

v0.1.1 değişiklik öncesi **78 passed /4.91s** ile doğrulandı. Başlangıç kaynakları, bütün testler, eski dokümanlar ve packaging spec proje dışında `afc-phase2a-baseline.zip` içinde korundu. Metadata/C2PA motoru yeniden yazılmaz. Custom temizleme seçiminin `expected_source_sha256` bağı korunur.

## Veri akışı

`MainWindow → Qt worker (generation/cancel/progress) → AnalysisEngine → FIFO scheduler → SourceSnapshot → MemoryBudget reservation → TileEngine → channel histogram aggregation → source hash recheck → AnalysisResult → AnalysisPane`

Analiz motoru Qt'den bağımsızdır. UI histogramı QPainter ile çizer; NumPy/OpenCV/ML framework veya ağ servisi eklenmedi. Metadata temizleme ayrı Workflow akışıdır.

## Kaynak/snapshot kimliği

Dosya adı kimlik değildir. Kaynak SHA256, byte boyutu, tespit edilen format, generation ID, snapshot kimliği ve UTC zaman taşınır. Kaynak salt okunur açılır, bounded bloklarla tek bir file-backed snapshot'a kopyalanırken SHA256 hesaplanır. Decode ve analiz bu aynı snapshot üzerinden yapılır; kullanıcı analizindeki beklenen hash varsa snapshot hash ile karşılaştırılır. Sonuçtan önce güncel kaynak yeniden hash edilir; değişiklikte sonuç güncel kabul edilmez.

Bu snapshot, yanlış metadata indekslerinin değişen dosyaya uygulanmasını engelleyen eski CustomMode sözleşmesini gevşetmez. Kullanıcıdan habersiz kaynak yazma yoktur. Aynı yetkili kullanıcının dosyayı değiştirip geri koyduğu düşmanca yarışların tamamı veya sonuç dönüşünden sonra yapılacak değişiklikler için sonsuz geçerlilik garantisi yoktur; SHA/generation yeniden kullanım sınırında kontrol edilir.

## Modüller

- `engine.py`: bounded file-backed snapshot ve kaynak bütünlüğü orkestrasyonu; `plan_tiles` saf koordinat fonksiyonu ve `statistics` saf histogram-moment fonksiyonu. Küçük Faz2A çekirdeğinde gereksiz forwarding dosyaları yerine bu sorumluluklar tek modülde açık fonksiyonlar olarak tutulur.
- `memory.py`: kullanılabilir RAM'den türetilen yapılandırılabilir soft budget; FIFO cancel-aware rezervasyonlar; UI preview ile ortak kaynak. Tek aktif analiz scheduler aynı thread-safe rezervasyon primitive'ini kapasite1 ile kullanır.
- `containers.py`: stream üzerinden bounded PNG CRC/WebP yapısal doğrulama; büyük tek chunk için encoded-size kopyası oluşturmaz.
- `schemas.py`: versioned immutable kimlik/sonuç/karo/istatistik sözleşmeleri.
- `exceptions.py`: cancel, source changed, budget ve veri hatası ayrımı.
- `engine.py`: bileşen orkestrasyonu, gerçek ilerleme ve kaynak temizliği.
- `modules/quality/contracts.py`: gelecekte source/target renkuzayı, kanal, bitdepth, alpha, region, datarange sözleşmesi; hesaplanmamış kalite skorları null/Unsupported.

## Analiz politikaları

RGB,RGBA,L 8-bit ham stored samples desteklenir. Alpha dahil bütün piksel örnekleri sayılır; tamamen şeffaf piksellerin gizli RGB değerleri hariç tutulmaz. ICC dönüşümü uygulanmaz; sonuç algısal/renk yönetimli parlaklık değildir. EXIF orientation görüntü sunumuna aitken global histogram/ortalama dönüşsüz saklanan piksellerden hesaplanır; yeniden kodlama/yön dönüşümü yapılmaz. Luminance Pillow integer BT.601 `convert('L')` hesabıdır. Diğer renk modları kontrollü Unsupported, sahte normalizasyon yok.

Karoların histogramları toplandığı için tile-size/halo sonuçları değiştirmemelidir. Python integer toplamlar taşmaz; varyans exact integer momentlerinden population olarak hesaplanır. FFT/DCT/noise/texture veya AI olasılığı hesaplanmaz.

## Durumlar ve raporlar

Complete: bütün kaynak pikselleri hesaplandı ve son kaynak kontrolü geçti. Unsupported: renk modu/özellik uygulanmadı, skor yok. Cancelled/Failed iş akışı exception/sinyalleriyle ayrı aktarılır; başarılı sonuç gibi ekrana işlenmez. Partial ileride sampling için ayrılmıştır; bu sürüm kendiliğinden küçültme yapmaz, yetersiz bütçeyi kontrollü reddeder/uygun sırada bekletir.

Privacy-Safe Report sadece matematiksel kanal özetleri ve kaynakla ilişkilendirilemeyen yapısal alanları aktarır; raw metadata, yol, SHA256, snapshot/generation kimliği dışa aktarılmaz. Histogramlar görüntü hakkında dağılımsal bilgi içerir, anonimlik sertifikası değildir. Standard Report kimlik bilgileri içerir ve ayrı uyarı gerektirir.
