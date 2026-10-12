# Pencereleme ve spektral leakage

Varsayılan2DHann: outer(np.hanning(H),np.hanning(W)); symmetricendpointzero. NoWindow `none`,Hamming,Blackman seçenekleri ayrıtanımlı. TinyHann degenerate boyutları kontrollüreddedilir; production fixedtile256/512/1024 padedge olduğundançökmez. Pencerecache boundedreadonly.

İşlemsırası: kanal dönüşümü→fixedtileedgepadding→opsiyonelmeançıkarma→window→FFT. Kenarvalidpixelalanı aggregateweighttir; paddingyapayörnekler FFTiçerir ve doğal içerik değildir. Coherentgain=mean(W) genliketkisi,windowenergy=sum(W²) güçdüzeltmesidir; birbirineeşit kabul edilmez.

Bilineninteger/noninteger sinüs ve discontinuitytestlerindeHannleakage ölçülür. Window frekanslobegenişliğini değiştirir; sızıntıyı tamamen kaldırmaz. Farklıwindow/tile analizleri doğrudan eşdeğer değildir. Spektrumeksençizgileri GAN/diffusion/filigran kanıtı değildir. Sıfırgörüntü/constant/DC/padding ve finiteguard testleri vardır.

UI bilgisi: Pencereleme görüntü sınırlarından kaynaklanan spektral etkileri azaltmak amacıyla uygulanır. Görülen frekans örüntüleri tek başına AI üretimi veya filigran kanıtı değildir.
