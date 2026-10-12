# Radyal ortalama güç spektrumu — RAPSD

Kaynak2Dshiftedrawpowerdir; displaylog/percentile uygulanmaz. fx/fy=fftshift(fftfreq(N)), radius=hypot(fx,fy),birimcycles/pixel. Daireseldomain0<r<=.5; DC ayrıdc_power, kareköşeler hariç. Bins32varsayılan, edgesi/(2*bins),bincenter(i+.5)/(2*bins). Sınır.5sonbine atanır. Herannuluscount ve sum ile mean=sum/count; boşbin mean0,count0 bilerek raporlanır. Annularmean ringtotalenergy değildir.

KaroRAPSDmeanleri validpixel sayısıyla ağırlıklı ortalanır. Fixedtile/window/padding aynıolduğundan gridcountları aynıdır. Kenaredgepadded FFT geçerlialanlaweighted olsa da paddingyanlılığı ortadankalkmaz. Farklıtile/windowprofil doğrudankarşılaştırılamaz. DC productionkanalfeaturemetaveride ayrıgösterilmeli; ortalamameanremovevewindowetkisi vardır.

GrafikX NormalizeEdilmişUzaysalFrekans(cycles/pixel),Y OrtalamaSpektralGüç; isteğebağlıloggörünüm hamveriyideğiştirmez. TekbaşınaAIüretimitesi değildir. Directbinloop referans, DC/sinusoid/noise/checkerboard/symmetry/emptybin testleri sayısal doğruluk içindir.
