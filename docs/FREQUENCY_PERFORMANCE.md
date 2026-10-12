# Phase2B gerçek performans kanıtı

## 2026-10-12 gerçek fotoğraf ve düşük bütçe takibi

NASA Apollo 17 Blue Marble JPEG, 1041×1041, 192213 byte; 3 ayrı süreç. Toplam analiz min/ortalama/maksimum **1.424 / 1.440 / 1.451 s**; bütün tekrarlar Completed, iptal ve kaynak koruma başarılı. UI ölçümü offscreen; fiziksel masaüstü performans kanıtı değildir. Tek fotoğraf geniş corpus sayılmaz; format/çözünürlük çeşitliliği önceki sentetik takımla ayrı değerlendirilir.

96 MiB soft-budget aynı fotoğrafta 3/3 MemoryBudgetExceeded, rezervasyon kalıntısı 0, kaynak korunmuş. Bu fiziksel düşük RAM veya OS hard-limit testi değildir.

Ham JSON (yerel geçici kanıt): `C:\Users\Mert\AppData\Local\Temp\kilo\afc-phase2b-real-20261012-c50490ad.json` ve `afc-phase2b-budget96-20261012-c50490ad.json`. Kaynak yol/hash raporlara yazılmaz. Benchmark `--input`, `--budget-mib`, min/max, süreç timeout ve mevcut çıktının üzerine yazmama desteği ekler; analiz sırasında ağ kullanılmaz.

Fotoğraf kaynağı: NASA, [Blue Marble View from Apollo 17](https://www.nasa.gov/image-article/blue-marble-view-from-apollo-17/), [JPEG](https://www.nasa.gov/wp-content/uploads/2023/03/as17-148-22727_lrg_0.jpg). [NASA medya kullanım koşulları](https://www.nasa.gov/nasa-brand-center/images-and-media/) 2026-10-12 kontrol edildi: bilgilendirme amaçlı, kaynak gösterimli, endorsement ima etmeyen kullanım. NASA onayı veya evrensel public-domain lisans iddiası yoktur. Fotoğraf dağıtım paketine eklenmedi.

Giriş güvenliği düzeltmesinden sonra ayrı son koşu: `afc-real-bounded-final.json`, 3/3 Completed, min/ortalama/maksimum **0.675 / 0.679 / 0.681 s**; peak working set yaklaşık 209.3 MiB. `afc-budget-bounded-final.json`: 96 MiB 3/3 ret, rezervasyon kalıntısı 0. Önceki 1.440 s koşusu build/diğer işler ile örtüşmüştür; bu fark hız optimizasyonu olarak yorumlanmaz. Her iki ham kanıt Temp/kilo altında korunur.

## Önceki sentetik ölçümler

Windows11build26200/Python3.13.12/NumPy2.5.4,Intel64Family6Model198Stepping2,aynıyaklaşık32GBgeliştirmemakinesi. `scripts/benchmark_frequency.py --output docs/frequency-benchmark-v020b1.json`9sentetikvaka×3tekrar ayrıprocess. Hann512/meanremove/Y,Cb,Cr/float64complex128. PSAPIpeakworking set bütünprocess fixture/metadata/preview/Qt/analysis maliyetidir;engineadmission tahmini değildir.

|Vaka|Ortalama toplam s|PeakMiB|UItimermaksms|
|---|---:|---:|---:|
|Uniform1080p|.938|279.7|28.1|
|Uniform4K|3.535|277.9|41.2|
|Uniform8K|11.898|425.5|37.9|
|Uniform39.992MP|13.919|460.4|38.6|
|PatternPNG1080p|1.020|277.9|28.0|
|JPEG1080p|1.047|276.0|34.8|
|WebP1080p|1.100|277.6|31.1|
|AlphaPNG1080p|1.011|279.3|36.9|
|Gray1080p|.868|279.6|35.9|

JSONhertekrar decodeFFT DCTRAPSD ayrıgerçeksüreleri vevisualizationtimi içerir. Near40MP FFT6.14–6.57s,DCT1.32–1.37s,RAPSD2.20–2.49s,decode.042–.062s; toplam başkasourcehash/channel/aggregate/memory maliyetleridahil13.61–14.11s. Cancellationcheckpoint latencynear40MP.0076s; bu nativeFFTortasında kesme süresi değildir. Bütünvakalarda kaynakpreservedtrue/UICompleted/canceltrue. DeterminismDCTenergytekrarlardakarşılaştırıldı; tümfloatbitwiseequality garantisi değildir. Tekrarsayısı3p95 üretmek için kullanılmadı.

Gerçekfotoğraf bulunamadı/doğrulanmışlisanslıcorpus kullanılmadı: JPEG sentetikdesendir. Fiziksel8/16GBcihaz testi yok; softbudget simülasyonayrıtest. ÖncekiPhase2A farklıalgoritma/fixture yöntemidir,genelhıziyileşmesi yüzdesi iddiaedilmez. NumPyFFTactualfloat32complex64,float64complex128; productionikincisi.

Paketbaşlangıcı461168694byte,EXE5334241byte. Finalbundle491067246byte (~468.32MiB), EXE7293526byte (~6.96MiB); bundleartışı29898552byte (~28.51MiB) NumPyvePhase2Bkodunun birliktegerçekbuild farkıdır, yalnızNumPyatribüsyonu değildir. SciPyboyut varsayımı yapılmaz.

## Düzeltilmiş finalkoşu

Hamkanıt `frequency-benchmark-v020b1-final.json` pooling/kenar/iptaldüzeltmelerinden sonra9vaka×3tekrar yenidenölçüldü; ilkJSONüzerineyazılmadı. Uniform1080p.967s/279.3MiB/33.7ms;4K3.296s/279.2MiB/38.0ms;8K11.715s/418.2MiB/40.6ms;39.992MP13.628s/462.2MiB/48.0ms. PatternPNG.974s,JPEG.962s,WebP.975s,RGBA.938s,L.858s. TümvakalardaUICompleted,kaynakpreserved,canceltrue; finaltiminglerJSONiçinde. MaksUIgap54.6ms patternPNG koşulunda; buherkoşulda60FPS garantisi değildir.
