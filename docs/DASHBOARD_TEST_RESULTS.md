# Dashboard doğrulama kaydı

## Başlangıç

2026-10-11 değişiklik öncesi mevcut testler gerçekten çalıştırıldı: **132passed8.12s**. Başlangıç dosyaları proje dışında `afc-dashboard-baseline-20261011-1932.zip` ile korundu. İlk genel `afc-dashboard-baseline.zip` adı zaten mevcut olduğundan üzerine yazılmadı; benzersiz yeni ad kullanıldı.

## Kanıt sınırları

Kaynak incelemesi, pytest yürütmesi, nativeWindows ekran görüntüsü ve frozenEXE smoke ayrı kanıt türleridir. Önceki raporlar/benchmarklar değiştirilmez; bu belge yeni Dashboard sonucunu kaydeder. Native C2PA ağ izolasyonu ve temizWindows platformmatrisi öncekiNotTested kapsamını korur.

## Geliştirme sırasında yakalanan hatalar

- İlk integration test iki kez widget `model` publicattribute bekledi; gerçekAPI `_model` ile test düzeltilerek gerçeksourcebinding kontrol edildi. Üretimde sahte sonuç üretilmedi.
- İlk fullsuite ve dashboard→preview izole sırası nativeaccessviolation ile durdu. Eski testler tekbaşına baseline132 geçiyordu. YeniDashboard empty/reset testinin DeferredDelete yaşam döngüsü izole edilerek düzeltme araştırıldı; başarılıfinalkoşu olmadan tamamlandı sayılmadı.
- Worker taraması için ayrıca readonly finalhash recheck eklendi; tarama sonrasında aynıpath içeriği değiştirilirse sourcechanged, cancel olursa noresult.3 adapterregresyon testi geçti.

## Kabul komutları

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m pip check
.\.venv\Scripts\python -m compileall -q app modules main.py tests
.\.venv\Scripts\python -m PyInstaller --noconfirm --windowed --onedir --name AI-Footprint-Cleaner --add-data "assets;assets" --collect-all c2pa main.py
```

## Takip kontrolü — 20:01

Başlangıç180passed8.54s. XMP/IPTC boşkategori filtreleri semantik destek sınırını kaybedip genelbulunamadı mesajı gösteriyordu. İki yeni regresyon düzeltme öncesi başarısız oldu; kategoriye bağlı desteklenmiyor/kontrol edilemedi/bulunamadı mesajlarıyla düzeltildi. Mevcut testler değiştirilmedi. Final **182passed8.28s**, pipcheck/compileall başarılı. Onedir yeniden üretildi; frozen smokeexit0, dashboard_sourcebound/sourcepreservedtrue ve analysisComplete. Kanıt `C:\Users\Mert\AppData\Local\Temp\kilo\afc-dashboard-scope-fix-vnpns9eu`. Önceki nativeağ/temizWindows kapsam boşlukları değişmedi.

## Final otomatik sonuçlar

Root final `.venv\\Scripts\\python -m pytest -q`: **180passed7.08s**, failed0/skipped0; başlangıca göre48 yeni test vakası. `pip check`: No broken requirements found. Gerekli compileall exit0. Eski132test dosyası byte-identical korunmuş; yalnız başlangıç ZIP'inden seçilen eski takım finalde **132passed5.80s** verdi. Metadata/C2PA/analysis/report çekirdekleri ve eski tarihsel doküman/benchmarklar byte karşılaştırmasıyla değişmeden doğrulandı. Editörün venvimport uyarıları ayrı statiklint/typecheck başarısı sayılmaz; runtime komutları yukarıdaki gerçekvenv ile çalıştı.

## Regresyon ve kaynak incelemesi

Kaynak readonly, finalhash mismatch/cancel,20rapidscan/latestgeneration, failedstate, unknownclaims, HTML/XMLplaintext, uzunfilename,narrow340widget,filter/expand/collapse/lazyrows/detaildialog testleri geçti. Model35test kapsamında gerçekPillow JPEG/WebP XMP, PNGXML-XMP, GPS/ExifIFD pointer sayımı; synthidnegation/claims/statusenum; büyükcyclic/longprefix alanlar; 33ingredient/128action sınırı bulunur.

SeniorReview ilk incelemede3 materialcount/data-loss/scope bulgusu verdi. Ham reflections/IFD pointers yaprak sayımından çıkarıldı; kısaltılmıştext kimliği kayıpsız boundedfingerprint ile değiştirildi; limitflags birikimli ve eksikbeyan özetleri scopeaware oldu. Son takip **APPROVE** bu kaynak düzeltmelerini kapsar; reviewer testleri kendisi çalıştırmadı ve finalbuild onayı vermedi.

## Native Windows ve frozen

Gerçek resmî C2PA `C.jpg` yerelfixture üzerinde `scripts/dashboard_ui_smoke.py` çalıştı; windowsplatform,sourceboundtrue. 1320×900 ve980×720 üst/alt screenshotlar doğrudan incelendi: darktheme,dosyaadı,realgenerator,trustwarning,scroll ve plaintexttablolar okunabilir. İlk screenshot uzunmissingblock gösterdi; scope düğmesine alınıp compact hale getirildi. Detaybutton minimumwidth dar340widgetregresyonunda yakalanıp düzeltildi. En küçük desteklenen tümWindows DPI/keyboard/screenreader matrisi test edilmedi.

Final onedir rebuild tamamlandı; frozenEXE smoke **exit0**, `qt_platform=windows`, dashboard_source_bound=true,1metadatafield/1container, analysisComplete ve sourcepreservedtrue. Kayıpsızmetadata pixel/payload/ICC/alpha/orientationVerified;watermarkNotSupported. Kanıt `C:\\Users\\Mert\\AppData\\Local\\Temp\\kilo\\afc-dashboard-final-kzmnosvs` (`dashboard-window.png`, `smoke-result.json`, safeJSON). Final frozen Dashboard screenshot doğrudan incelendi. Smoke disposablePNG ile sınırlı; temizWindows/Windows10 ve tamcodec corpus testi değildir.

## Kalan boşluklar ve durum

Native C2PA firewall/packetcapture ve temizWindows matrisi NotTested. Büyükmetadata boundedrow testleri var; hergerçekmanifestte frame-latency benchmark veya erişilebilirlik sertifikası yok. Viewmodelworker parsebounded, SDK'nın manifestokuma maliyeti ayrıca sınırlanmış sayılmaz. SafeReport mevcut regresyonları geçti; Dashboard görünürbilgiler şahsi veriler içerebilir.

**PARTIAL:** Çalışan Dashboard/otomatiktest/frozen akışı doğrulandı; tüm native ağ/platform/manuel UI matris kapsamı tamamlanmadı. Ticari release-ready iddiası yoktur.
