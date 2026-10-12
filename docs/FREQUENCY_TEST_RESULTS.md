# Phase2B test kanıtları

## 2026-10-12 kabul takibi

- Başlangıç bu oturumda 301 test geçti. UI yerleşim/Türkçe regresyonu ve benchmark CLI testleriyle toplam **322 test geçti (11.17 s)**; pip check temiz.
- 980×720 ve 1320×900 gerçek `windows` Qt platformunda analiz tamamlandı; frekans panelinde yatay scrollbar maksimumu 0 doğrulandı. Dikey kaydırma gereklidir. Türkçe metrik adları ve eşit sütunlar görsel olarak incelendi.
- EXE yeniden üretildi. Frozen smoke exit 0: metadata/pixel/payload/ICC/orientation kontrolleri Verified; FFT/DCT Y/Cb/Cr Completed; kaynak, Dashboard ve analiz bağları doğru. Bu, temiz Windows dağıtım testi değildir.
- NASA Apollo 17 fotoğrafında 3 ayrı süreç başarılı; 96 MiB soft-budget 3 ayrı süreçte kontrollü ret ve used_bytes=0. Fotoğraf ve ölçüm ayrıntıları FREQUENCY_PERFORMANCE belgesinde.
- Güncel native UI kanıtı: `afc-verified-ui-05v4guy2`; frozen kanıtı: `afc-release-frozen-zyr0y9b_` (yerel Temp/kilo altında). 76 Python dosyası AST kontrolünden geçti. EXE SHA256: `57ac372c50968a0e418503c43e076fbd1d7990cc8210ba064ca0b3a2aba3b330`.
- Kaynak baseline dış arşiv: `afc-remaining-baseline-20261012.zip`; mevcut tarihsel kanıtların üzerine yazılmadı.
- Bağımsız son inceleme: benchmark hazırlığındaki 128 MiB ön-kabul açığı düzeltildi; bounded hash/kopya ve motor sonucundan boyut okuma eklendi. Oversize için read-spy ve büyüyen kaynak için çoklu başarılı okuma regresyonları geçti. Son görüş APPROVE WITH CHANGES (nonblocking test kapsamı önerisi de uygulandı). Baseline diff ana süreçte ZIP üzerinden incelendi; mevcut testlerde yalnız iki çeviri assertion'ı değişti, assertion kaldırılmadı. Reviewer ZIP diff'i bağımsız çalıştırmadı.
- Fiziksel 8/16 GB cihaz, temiz Windows 10/11 ve native C2PA ağ paket yakalama testleri yapılmadı. Genel kabul sonucu bu kapılar nedeniyle **PARTIAL**.

## Önceki oturum kanıtları

Başlangıç gerçekten182passed7.59s; dışsourcezip `afc-phase2b-baseline.zip`. NumPy2.5.4 kuruldu; actualfloat32fft2complex64,float64complex128. Productionfloat64 seçildi. Öncekipaket461168694byte/exe5334241byte ölçüldü.

Sayısal62test bağımsızDFT/cosineformül,Parseval/inverse/orthonormalT,sinüspeaks/leakage/windowenergy,RGBpatch/alpha,radialdirectbin/count/DCempty ve percentilefinite/rawunchanged/sharedscale referanslarıyla0.32s geçti. Yeni16panel testi veoldneighbortests odaklı29passed. İlk fullintegration260passed7.84s. Rootengine3source/dcttileindependence/privacy/canceltesti0.60s geçti.

İlkbenchmark subprocess4K nativeexit3221225477 verdi; aynı4Kfaulthandlerrepro başarıyla geçti. BenchmarkQtwindowteardown DeferredDelete pencereowner canlıyken drain/delete yapılarak düzeltildi; sonraki9vaka×3tekrar bütünüyle exit0. Bu fizikselcihazleak-free veya bütünQt yollarıgarantisi değildir.

## Final doğrulama

Root final **301passed11.71s**, failed0/skipped0; başlangıca göre119 yeni vaka. pipcheck No broken requirements found, gereklicompileall exit0. Orijinal182test dosyası byte-identical; yalnızoldtakım tekrar182passed8.40s. Workflow/C2PA/metadata/Dashboard vePhase2A snapshotengine byte-identical korundu.

SeniorReview dört blocker buldu:1–7pxkenarcolorvalidation, stridepreviewilefrekanskaybı, paneiptalbusy eksikliği, safeReporthesapbağlamı. Hepsi küçükregresyonlarla düzeltildi. Pooledpower sum/magnitudeRMS;meanformülükoşullu; methodfields sabitprivacyallowlist. OverrideWebPopen/load/chained/progresscancel hataowner tests rezervasyonreleaseöncesiweakref ile sınandı. Sonreview **APPROVE WITH CHANGES**, nonblockingDCpoolkomşufrekans açıklaması tooltip/docs+rawnonmutationtest ile tamamlandı; reviewer testleri bağımsızçalıştırmadı.

NativeWindows FFT/DCT/Radial1320×1000 ve980×800 screenshotları doğrudanincelendi. Küçükpencerede yataykaydırma gerekiyor; kontroller erişilebilir ancak tamresponsive nohorizontal iddiası yok. Diagnosticteardownında exit3221226505 gözlendi; DeferredDelete ownerlivecleanup ile sonraki diagnosticexit0. FinalUIkanıt `afc-frequency-compact-ui-o24l2qoh`, finalfrozen `C:\Users\Mert\AppData\Local\Temp\kilo\afc-phase2b-final-p2ndnump`: exit0,frequencyCompleted Y/Cb/Cr,sourcebound/preservedtrue,Dashboardboundtrue. Finalfrozen screenshot doğrudanincelendi. NumPyDLLruntime başarılı; temizWindows10/11Tested değildir.

8/16/32GB hedefleri yalnızparametriksoftbudgetadmission simülasyonudur, fizikselcihaztesti değildir. 16MiBbudget decodeöncesireddedilir/release testigeçti.9vaka×3tekrar finalbenchmark ayrıJSONda eskiilkkoşukorunarak kaydedildi. YeniUI sayısaldeğerler içerir,model/AIolasılık/filigranbaşarısı üretmez.

NumPykurulumöncesi PyPIJSONsürüm/platform/lisans doğrulandı. LSP'nin venvimportuyarıları runtimekontrollerin yerinegeçmez; ayrıstatiklint/typechecksetup bulunmuyor. Şimdiliknativeağ/firewall/cleanWindows10 boşluğu öncekiNotTested. Gerçeklisanslıfotoğrafcorpus henüz yok; sentetikJPEG fotoğrafdiye sunulmaz. Eski182testler değişmeden korunur.
