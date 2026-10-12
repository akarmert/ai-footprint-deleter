# Phase 2A bellek modeli

128MiB kaynak ve40MP çözünürlük güvenlik sınırları korunur. Yeni analiz için soft budget ve bounded tile aggregation vardır; **hard process/native RAM limit değildir**.

## Phase2B ilavesi

FrequencyEngine aynıscheduler/budget kullanır. Headeradmission2*encodedbytes+32MiB ilkPillowopen'danönce; decode+FFT/DCT tahmini8*sourcepixels+2*encodedbytes+200*tilepixels+64MiB. NumPyfloat64/complex128,birkanalFFTgeçicileri,DCTbatch,3kanalaggregatewindowpower ve boundedUIkopyaları içinsoftmargin vardır. Buformül gerçeknativepeakgarantisi değildir; workerexception/cancelcontext rezervasyonu bırakır. Büyükgrid full40MPtensor oluşturulmaz; DCTmaks16384blok/tile1024. CachewindowT boundedreadonly.

## Kaynak maliyeti

Tek file-backed geçici snapshot disk üzerinde kaynak büyüklüğü kadar (en çok128MiB) yer kullanır; kopyalama/hash bounded bloklarla yapılır. Sınırsız in-memory encoded kopya oluşturulmaz. Snapshot kaynak değil uygulamanın geçici verisidir; normal hata/iptal/başarıda kapatılır. İşletim sistemi page cache ve native decoder buffer'ları RAM kullanabilir. Disk dolması kontrollü hata vermelidir; güvenli adli silme garantisi yoktur.

## Tahmin ve rezervasyon

Çözünürlük×kanal/dahili decoder bytes, bounded tile çalışma kopyaları, histogram/counter ve sabit native margin hesaba katılır. Bazı RGB decoder'lar4byte storage kullanır. Windows'ta varsayılan bütçe başlangıç kullanılabilirRAM/4 üzerinden32MiB–1GiB aralığına sınırlandırılır; diğer sistemlerde256MiB fallback kullanılır. `AnalysisEngine(budget=MemoryBudget(limit_bytes))` API ile yapılandırılır; bu alfa sürümünde ayrı GUI bütçe ayarı yoktur. Değer süreç açılırken alınır, OS belleği değiştikçe dinamik hard-admission değildir. Analiz sınırlara uymak için sessiz downsample yapmaz. Tek iş tahmini bütçeden büyükse kontrollü reddeder; geçici kaynak çatışması FIFO/cancel-aware bekler. Rezervasyon context-manager ile hata/iptalde serbest kalır.

Preview ve analiz aynı DEFAULT_BUDGET üstünden rezervasyon alır. Analiz scheduler yüksek maliyetli analizleri tek aktif sıraya alır. Preview'nun bounded eşzamanlı decode sınırı ayrıca korunur. Bu mekanizma bütün uygulama, metadata Workflow veya native allocator'lar için OS-level limiter değildir; eski metadata taraması farklı kaynak yüküne sahiptir.

## Karo işleme

512×512 varsayılan;256/1024 seçenekleri desteklenir. Halo gelecekteki lokal algoritmalar içindir; istatistikler sadece core pikselleri sayar. Crop bazı formatlarda bütün görüntüyü decode eder: tiled aggregation yalnız çalışma kopyası/histogram toplama maliyetini azaltır, streaming decode kanıtı değildir. Full-resolution decode gerçek benchmark ile ayrıca ölçülür.

## Ölçüm ve yorum

Production AnalysisResult.measured_peak_memory ölçülmediğinde null kalır. Ayrı benchmark Windows PSAPI process working-set ve peak sayaçlarını ölçer; fixture üretimi/Qt/native cache dahil olduğundan analiz tahminini tek başına doğrulamaz. Soft budget ölçümü hard limit olarak gösterilmez. İleri izolasyon için ayrı process/OS job object/file-backed decoded store gelecekte değerlendirilebilir; bu fazda gereksiz büyük mimari eklenmedi.

Decoder hata traceback'leri cause/context zinciriyle reservation bırakılmadan temizlenir; hata türü/mesajı/stack konumları korunur fakat tamamlanmış callback frame'lerinin locals bilgileri de silinebilir. Bu bellek sahipliği hijyenidir, genel exception debug locals saklama garantisi yoktur.

Native decode ortasında forced termination yoktur; iptal checkpoint'te gerçekleşir. Kaynakhash recheck sonrasında dosyanın dışarıdan yeniden değiştirilmesi mümkündür; sonuç belirli snapshot'a bağlıdır, aynı yolun sonsuza kadar aynı içeriği tuttuğu iddia edilmez.
