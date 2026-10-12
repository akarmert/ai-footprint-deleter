# Phase2A analiz performansı — v0.2.0a1

## Yöntem ve makine

Windows11 build26200 x64, Python3.13.12; Intel64 Family6 Model198 Stepping2. Fiziksel RAM önceki aynı makine ölçümünde33,685,200,896byte (~31.37GiB); bu koşuda ayrı globalRAM ölçümü yapılmadı. Yeni dependency yok.

`scripts/benchmark_analysis.py` her vaka için ayrı subprocess ve3 tekrar kullanır. Transient fixture'lar: tekrenkRGB PNG, deterministik spatial-pattern RGB PNG, JPEG, WebP, RGBA PNG. Gerçek fotoğraf corpus'u kullanılmadı. Her koşuda kaynakhash, sonuç tutarlılığı, tile sayısı, checkpoint iptali ve gerçekQt timer ölçülür.

PSAPI PeakWorkingSetSize bütün process'i kapsar: fixture üretimi, bağımsızdecode, metadata scan, preview, analysis ve Qt cache. Engine.memory_estimate nativeprocess hardlimit veya ölçülenpeak değildir. UI ölçümü metadata scan/setup sonrası analysisstart→result olarak yapılır; v0.1.1 tarama+preview süresiyle doğrudan karşılaştırılamaz.

## İlk entegre koşu — son decoder lifetime düzeltmesi öncesi

Ham kanıt `analysis-benchmark-v020a1.json`. Bu veri silinmedi/üzerine yazılmadı. Son kaynak değişiklikleri için ayrı final JSON/ölçüm kullanılır.

| Vaka | Boyut | Decode s | Analiz ort. s | Min–max s | Tile | Process peakMiB | UI maxgap ms |
|---|---|---:|---:|---|---:|---:|---:|
| UniformRGB PNG |1920×1080|.0022|.0192|.0177–.0221|12|246.2|10.8|
| UniformRGB PNG |3840×2160|.0083|.0667|.0647–.0691|40|248.2|10.8|
| UniformRGB PNG |7680×4320|.0396|.2528|.2497–.2546|135|400.7|14.4|
| UniformRGB PNG |8000×4999|.0427|.3131|.2953–.3363|160|445.4|11.8|
| PatternRGB PNG |1920×1080|.0092|.0237|.0220–.0267|12|237.6|10.7|
| JPEG |1920×1080|.0101|.0274|.0248–.0303|12|232.4|22.7|
| WebP |1920×1080|.0796|.0981|.0933–.1035|12|264.0|10.9|
| AlphaPNG |1920×1080|.0031|.0190|.0178–.0213|12|248.1|10.8|

Bütün8 vakada statusComplete, sonuçconsistent, sourcepreserved ve checkpointcancel=true. Üç örnekten p95 üretilmedi. Uniform görüntülerin sıkıştırma oranı yüksektir; çokkompleks gerçek fotoğraflara genellenmez.

## v0.1.1 karşılaştırma sınırı

Eski `benchmark-v011-final.json` near40MP peak759.1MiB/UI38.4ms kaydı korunur. Bu sürümdeki yukarıdaki near40MP445.4MiB/UI11.8ms ölçümü farklı fixture (RGB yerine eskiRGBA), farklı işakışı ve memory scope içerir; **doğrudan hız/RAM iyileşmesi iddiası değildir**. Ortak softbudget, encodedbuffer maliyeti ve explicit decoder ownership yapısal kazanımlardır, hardRAM garantisi değildir.

## Son normal-akış ölçümü

`analysis-benchmark-v020a1-final.json` önceki kanıtın üzerine yazılmadan oluşturuldu; WebP normal-yol decoder owner temizliği ve UI kanal fallback/minheight düzeltmeleri dahil. Bundan sonra yalnız decoder-exception traceback temizliği uygulanır; benchmark hatasız path olduğu için exception yolu RAM ölçümü yerine geçmez.

| Vaka | Analiz ort.s | Min–max s | Decode s | PeakMiB | UI maxgapms |
|---|---:|---|---:|---:|---:|
| Uniform1080p |.0187|.0170–.0220|.0023|248.0|10.8|
| Uniform4K |.0673|.0653–.0712|.0092|247.9|10.8|
| Uniform8K |.2508|.2458–.2550|.0327|375.0|12.9|
| Uniform39.992MP |.3386|.3291–.3439|.0423|438.4|13.7|
| PatternRGBPNG1080p |.0277|.0243–.0329|.0094|247.9|11.4|
| JPEG1080p |.0274|.0240–.0339|.0148|248.7|10.8|
| WebP1080p |.1295|.1284–.1302|.1080|265.3|11.3|
| AlphaPNG1080p |.0191|.0174–.0219|.0027|248.3|10.4|

Bütün8 koşuda kaynak hash korunmuş,3 tekrarda matematiksel sonuçlar tutarlı, checkpoint iptali ve UIComplete doğrulanmıştır. Processpeak ile enginebudget arasındaki fark Qt/setup/cache ve ayrı Workflow maliyetlerini içerir.

## Kalan kapsam

Gerçek lisanslı fotoğraf corpus'u,4K/8K karmaşıkJPEG/WebP, düşükRAM fizikselcihaz, nativeallocator tracing ve uzun20farklıbüyükdosya soak yapılmadı. LargeencodedWebP düşükbudget adversarial testleri ayrıpytest lifecycle/admission kapsamındadır; küçükWebP benchmark tümcodec allocation sınırını kanıtlamaz.
