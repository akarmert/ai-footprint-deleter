# Performans — v0.1.1

2026-10-10 ölçümü. Makine: Windows 11 build26200 x64; Intel64 Family6 Model198 Stepping2; 33,685,200,896 byte fiziksel RAM (~31.37GiB); Python3.13.12. İşlemci pazarlama modeli ölçülmedi.

## Tekrarlanabilir komut

```powershell
.\.venv\Scripts\python scripts\benchmark.py --output docs\benchmark-new-run.json
```

Çıktı adı mevcut olmamalıdır. Her çözünürlük ayrı process; fixture'lar geçici klasörde üretilir, repository'ye büyük görsel eklenmez. Her vaka20 ardışık tarama, tek metadata temizliği, bağımsız rescan ve gerçek Windows Qt timer ile UI tarama+önizleme tamamlanmasını ölçer. `GetProcessMemoryInfo` PeakWorkingSetSize gerçek süreç peak working-set ölçüsüdür; Python heap veya sistem toplam RAM tüketimi değildir. Peak sayaç fixture üretimini/Qt/native allocation'ları da kapsar; resetlenmez.

Fixture tek renk RGBA PNG: yüksek sıkıştırılabilir, gerçek JPEG/WebP/karmaşık fotoğraf performansının temsili değildir. Tek koşu; istatistiksel p95 veya genel SLA iddiası yoktur.

## Son ölçüm

Ham kanıt: [benchmark-v011-final.json](benchmark-v011-final.json).

| Boyut | Dosya byte | Tarama s | Temizleme+doğrulama s | Bağımsız rescan s | Peak RAM MiB | UI max timer aralığı ms |
|---|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 10,671 | .1171 | .1129 | .0333 | 269.8 | 33.5 |
| 3840×2160 | 37,514 | .1361 | .1942 | .0604 | 274.6 | 32.8 |
| 7680×4320 | 138,672 | .2200 | .4905 | .1491 | 618.6 | 47.6 |
| 8000×4999 (39.992MP) | 165,461 | .2937 | .7015 | .1867 | 759.1 | 38.4 |

20 tarama sonrası working set yaklaşık62.0–62.5MiB; UI sonrası ölçüm153–155MiB civarıdır. Native Qt/SDK cache ve allocator retention bulunduğundan sıfır bellek kalıntısı veya leak-free kanıtı değildir. Tüm vakalarda pixel/payload/ICC/alpha/orientation kontrolleri geçti; watermark `Not Supported`.

## Bulunan darboğaz ve ölçülen trade-off

İlk ölçüm [benchmark-v011.json](benchmark-v011.json) senkron GUI preview çözümlemesiyle near40MP için **528.7ms** maksimum timer boşluğu gösterdi. Qt decode arka plana taşındı; son koşuda **38.4ms** ölçüldü. Bu karşılaştırma aynı uniform fixture/makine ile sınırlıdır.

Ancak iki eşzamanlı bounded preview decode peak RAM'i **457.9MiB →759.1MiB** artırdı. Bu nedenle uygulamanın her alanda daha az bellek kullandığı iddia edilmez. 40MP limit yükseltilmedi. Kalıcı sahneler1600px'e sınırlandırıldı; bazı decoder'lar ölçeklemeden önce tam görüntü allocate eder. Tek decoder denemesi stale/rapid-load davranışını bozduğu için geri alındı; geçen iki-decoder uygulaması korundu. İleride kaynak bazlı preview cache/coalescing ve tile-aware decode ölçülmelidir.

Native decode/SDK ortasında iptal yok; checkpoint iptali var. Ayrı testler hızlı20 preview yüklemesi, stale sonuç, cancel, worker run-tail ve parent destroy davranışını denetler. Farklı20 büyük dosyanın uzun süreli soak ölçümü ve tüm formatlarda RAM profili henüz yoktur.
