# Phase2B frekans mimarisi

Qt bağımsız windowing/FFT/DCT/color/RAPSD/features/visualization modülleri. FrequencyEngine mevcut AnalysisEngine'in file-backed snapshot, SHA256, fstat, scheduler ve finalsourcecheck yaşam döngüsünü devralır; metadata/C2PA motoru değişmez. Headerencodedreservation ilkPillowopen öncesinde; decode+NumPybuffers ayrı tahmin edilir. 128MiB/40MP limitleri korunur.

Raw hesaplar float64/complex128, bütünY/Cb/Cr kanalları sırayla tile256/512/1024 üzerinden toplanır. Power/magnitude fixedtileweightedortalamaları globalFFT değildir. DCT8globalorigin(0,0), edgepadpaddedblocksayımı vardır. UI <=256² spectrumpreview,8²DCTenergy ve tilegridACmap tutar; tüm40MPFFT veya blocktensor saklanmaz.

Önizleme256² için güçbinleri toplamla (enerjikoruyan),genlikbinleri RMS ile havuzlanır; strideörnekleme yoktur. 512/1024 karolarda DC gizleme,DC içeren havuzlanmış hücreyi ve içindeki komşu frekansları yalnız görünümden kaldırır. Hamfeature/RAPSD etkilenmez.

Presentation percentile1/99.5/log1p/DC exclusion hamarrayleri değiştirmez. Manuel sabitaralık ortakölçek karşılaştırmasına imkân verir; bağımsızautocontrast farklıspektrumları benzer gösterebilir. UIpercentile küçükboundedarray üzerinde çalışır; FFT/DCT/RAPSD worker içindedir.

Generation/sourcehash stale sonuçları engeller; son karo sonrası kaynakdoğrulama bitmeden100gösterilmez. Cancel checkpointlidir, nativeFFT/decode ortasında zorla kesilmez. SafeReport kaynakidentity/hash/path/metadata taşımaz; spektraldağılımlar içerikbilgisi taşıyabilir ve yalnızkullanıcıexportuyla kaydedilir.

NumPy2.5.4 BSD-3-Clause AND0BSD ANDMIT ANDZlib ANDCC0-1.0 dağıtımmetadata; Python>=3.12,cp313win_amd64wheel birincilPyPIJSON ile2026-10-11 doğrulandı. SadeceNumPyeklendi; SciPy/OpenCV/MLframework yok. Üçüncütarafnativebildirimler ticari dağıtımda ayrıca korunmalıdır.
