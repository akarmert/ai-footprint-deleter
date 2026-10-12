# FFT/DCT yöntemleri — v0.2.0b1

NumPy2.5.4, float64 giriş ve complex128 FFT production referansı. `numpy.fft.fft2` normalizasyonu backward (ileriölçeksiz), ardından fftshift. Magnitude=abs(F). Power=abs(F)^2/[N*sum(W^2)]. Parseval ile bütünbin toplamı=sum((W*(X-mean))^2)/sum(W^2), yani pencere-ağırlıklı mean-square. Bu unbiased/sampling-bağımsız evrenselPSD garantisi değildir. Mean seçilirse windowöncesi çıkarılır; sıfırDC garantisi windowsonrasıweightedmeanfarkı nedeniyle verilmez.

DCT8 T[u,x]=alpha(u)cos(pi(2x+1)u/16), alpha0=sqrt(1/8),diğer=sqrt(2/8). CachedreadonlyT ile batched T@X@T.T, inverseT.T@Y@T. Productionfloat64; levelshiftFalse. Enerji coefficient²; DC(0,0),low1<=u+v<=3,mid4..7,high>=8. Mean coefficientenergy64, DC/AC ve paddedblock sayımları raporlanır. Signedtoplam enerji değildir. NativeJPEG kuantizekatsayıları okunmaz.

FFTbandları normalizedcycle/pixel radius low<.125 mid<.25 highrest domain belirtilir. Peaks sayısal konumdur AIartifact etiketi değildir. Localvariability tileACmeanenergy populationstd; tileboyutuna bağlıdır. Görselleştirme log1p ve percentile rawenergyden ayrıdır. DCTtileindependence testinde aynıglobalbloklar tolerans1e-12relative/1e-9absolute ile eşleşir.
