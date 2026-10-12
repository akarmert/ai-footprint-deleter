# Phase2A test başlangıcı ve kabul kaydı

## Baseline

2026-10-10 geliştirme öncesi mevcut `.venv\Scripts\python -m pytest -q` gerçekten çalıştırıldı: **78 passed /4.91s**. Git yok; dış snapshot `C:\Users\Mert\AppData\Local\Temp\kilo\afc-phase2a-baseline.zip` alındı. Mevcut12 test dosyası, metadata Workflow ve eski `scripts/benchmark.py` byte-identical korunuyor. v0.1.1 doküman/benchmark kanıtları korunuyor; yeni sonuçlar bu ayrı belgede tutulur.

Ayrıca geliştirme ortasında başlangıç ZIP'inden test dosyaları seçilerek yalnız eski takım yeniden çalıştırıldı: **78 passed /4.52s**; final kaynak üzerinde aynı otomatik baseline-seçimi tekrar **78passed4.59s** verdi. Dosya karşılaştırması eski testler, metadata Workflow, eski benchmark ve v0.1.1 tarihsel dokümanlarının değişmediğini doğruladı.

## Kanıt sınıfları

1. **Kaynak incelemesi:** kod/sözleşme güvenlik sınırlarının statik değerlendirmesi; test yürütme kanıtı değildir.
2. **Test yürütme:** gerçek pytest/pipcheck/compileall çıkışları; temizWindows dağıtım testi değildir.
3. **Native Windows/frozen:** mevcut Windows11 makinesinde Qt ve paketlenmiş EXE akışı; Windows10/temiz makine testinin yerine geçmez.
4. **Ağ:** yeni analiz offline Python socketguard kapsamı; native C2PA ağ/firewall/packet capture öncekiNotTested boşluğu devam eder.

## Test tasarımı

- KüçükRGB/RGBA/L görüntülerde bağımsız Python sayım/mean/population std ve histogram karşılaştırması.
- Core/halo kenar karolarının tekil pixel kapsamı ve tile-size değişiminde deterministik sonuç.
- Yanlışhash, aynıpath farklıiçerik, analysis sırasında source değişimi, snapshot/redect kontrollü hata.
- Lowbudget admission/release, cancel queue/checkpoint, decoder hata release, preview contention ve singleactive scheduler.
- GerçekQt eventloop: start/progress/math/hist/export, cancel/close, latestonlyswitch ve stalegeneration/hash reddi.
- PrivacySafe analiz raporunda kaynaksha/path/generation yok, raw numeric dağılımlar tutarlı.
- Eski metadata pixel/payload/ICC/alpha/rights/C2PA/sourcebinding testleri değiştirilmeden çalıştırılır.

## Gerçek komutlar

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m pip check
.\.venv\Scripts\python -m compileall -q app modules main.py tests
.\.venv\Scripts\python scripts\benchmark_analysis.py --output docs\analysis-benchmark-v020a1.json
.\.venv\Scripts\python -m PyInstaller --noconfirm --windowed --onedir --name AI-Footprint-Cleaner --add-data "assets;assets" --collect-all c2pa main.py
```

## Entegre doğrulama

2026-10-11 ilk tamamlanan çekirdekte121passed6.57s; owner-lifetime/UI düzeltmeleri sonrasında126passed7.01s. `pip check`: No broken requirements found. `compileall -q app modules main.py tests`: exit0. Son decoder-origin exception regresyonundan sonra root final koşusu **130passed7.56s; failed0/skipped0**. Başlangıca göre52 yeni gerçek test vakası. `pip check` ve gerekli `compileall` aynı final kaynak üzerinde başarıyla tekrar çalıştı.

Geliştirme sırasında schema_version eksikliği iki export testini başarısız yaptı; sürümlü sonuç sözleşmesi tamamlanarak düzeltildi. Missing-sourceQt testi Windows source handle açık kaldığı için başarısız oldu; handle snapshot kopyasından sonra kapatıldı, finalidentity OSErrorSourceChanged yapıldı. Düşükbudget nestedreservation/decode ve explicitnative ownership sorunları bağımsız incelemeyle giderildi; decoder exception traceback sahibi için ek regresyon uygulandı. Hata veren testler silinmedi/zayıflatılmadı.

## Takip kontrolü — 2026-10-11

Kontrol başlangıcı130passed6.07s. Son karo callback'i final kaynak hash kontrolünden önce100% gösteriyordu; yeni regresyon düzeltme öncesi `9 < 9` assertion'ıyla başarısız oldu. UI artık son doğrulama için ayrı ilerleme adımı tutuyor; yalnız Complete sonucu100%Doğrulandı, Unsupported analizuygulanmadı gösterir. Kaynak son karoda değiştirilince hiçbir tamamlanmış gösterim oluşmadığı ikinci regresyonla doğrulandı.

Düzeltme sonrası **132passed5.56s**, pipcheck/compileall başarılı. İlk78test dosyaları aynı kalmış; yalnız eski takım tekrar78passed4.34s verdi. Onedir yenidenüretildi; `afc-phase2a-review-9cwsj5m1` dıştemp kanıtında frozen smokeexit0, sourcebound/preservedtrue; screenshot doğrudan incelendi. Eski tarihsel test/benchmark sonuçları yukarıda değiştirilmeden korunur. Ayrı read-only çekirdek kontrolü analysis/source/budget/container/report yollarında ek somut blocker bildirmedi; bu statik değerlendirme bağımsız runtime veya güvenlik garantisi değildir.

## Kaynak incelemesi

SeniorReview erken ve takip incelemelerinde budget öncesiWebPencodedallocation, PNGverifychunkcopy, decoder-owner lifetime ve kaybolan kaynak/UI invalidation sorunlarını buldu. Headerencodedreservation ilkPillowopen önüne taşındı; bounded streamcontainer doğrulama sonrası duplicateunboundedverify kaldırıldı. Nativeimageclose ve referanssalımı reservation içinde yapıldı; decoder-origin traceback cause/context zinciri dahil tamamlanmış frameler reservation bırakılmadan temizlendi. GerçekWebP `_open`/`load` hata enjeksiyonları weakref ile owner yokluğunu budget hâlâ tutulurken denetledi. Son odaklı kaynak incelemesi **APPROVE**; bu review test/build yürütme kanıtı değildir. Reviewer testleri kendisi çalıştırmadı; root gerçekten çalıştırdı.

## Native Windows ve frozen

Gerçek `windows` Qt platformuyla onedir build ve smoke exit0 gözlendi. `scan→losslessclean→analysisComplete→safeJSON` akışı,19200piksel/1tile ve analysis_source_bound=true/source_preserved=true. Metadata pixel/payload/ICC/alpha/orientation kontrolleriVerified, watermarkNotSupported.

İlkfrozen kanıt `C:\Users\Mert\AppData\Local\Temp\kilo\afc-phase2a-frozen-7rbfxbez`; screenshot doğrudan incelendi ve summarymetin kırpılması görüldü. Üçsatırlık minimumsummaryheight ile düzeltildi; sonraki `afc-phase2a-layout-uco7aq4t` screenshot doğrudan incelendi, Türkçe başlık/kimlik/istatistik/histogram okunabilir. L/A→RGB histogramfallback iki gerçekQt testiyle doğrulandı. Son exceptioncleanup sonrasıbuild yeniden tamamlandı; finalfrozen smoke **exit0**, nativeQtplatformwindows, analysisComplete/sourcebound/sourcepreservedtrue. Final kanıt `C:\Users\Mert\AppData\Local\Temp\kilo\afc-phase2a-final-xy8fr42v`; screenshot doğrudan incelendi, summary/koyuUI/Türkçeistatistik/histogram düzgün. Bu test temizWindows veya tümformatfrozen corpus testi değildir.

## Kapsam boşlukları

Native C2PA firewall/packet capture, temizWindows10/11 dağıtımı, gerçekfotoğrafcorpus, düşükRAMfizikselcihaz ve nativecodec sandboxNotTested. Softbudget hardlimit değildir. Araç LSP'nin venv'yi tanımayan import uyarıları runtime başarısı yerine geçmez; ayrı statiklint/typecheck yapılandırılmadı. Benchmarklar8sentetikvaka×3tekrar, sonuçtutarlılığı/kaynakhash/iptal/UItimer gerçek ölçümüdür; p95 iddiası yoktur.
