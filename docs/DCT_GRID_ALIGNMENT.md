# Global8×8 DCT ızgarası

Origin mevcutgörüntünün(0,0) noktasıdır; blockstartlar8inkatlarıdır. Productiontile256/512/1024 hepsi8inkatı olduğundan karolar blockbölmez; kenardaki eksikblok sağ/altaedgepadding ile tamamlanır. Paddedblocks ayrı sayılır. Bütünpikseller birkez corebloğa aittir; FFTpaddingDCTye taşınmaz yalnız eksik8likkenarpad uygulanır.

`global_block_plan(shape,core)` ayrıhelper arbitrarycore içinceil(left/8)*8 başlangıçları verir; blockownershipstartpointcore'a göredir. 256ve512 ile aynıgörsel DCTmeanenergy/blockcount bağımsıztestte eşleşir. Aynıglobalverinin blokları değişmezken FFTtileboyutu/windowdeğişimi eşdeğerlikiddiası değildir.

Bu geçmişJPEGgridrecover değildir. Crop/resize/recompress geçmişalignmentı kaydırmış olabilir;0–7offsetphase taraması yapılmaz. NativeJPEGentropykuantizekatsayıları çıkarılmaz.
