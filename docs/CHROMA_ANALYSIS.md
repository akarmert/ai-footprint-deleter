# YCbCr kanal politikası

Decoded8bitRGB→float64 full-range BT.601 benzeri4:4:4 dönüşüm:

Y=.299R+.587G+.114B
Cb=128-.168736R-.331264G+.5B
Cr=128+.5R-.418688G-.081312B

Limited16–235range veya nativeJPEGsubsampledchroma değildir. Cb/Cr yaklaşık.5–255.5 aralığına çıkabilir; codecrounding/clippinguygulanmaz. RGB/RGBAdeğerleri0..255finiteolmalı. RGBAalpha filtrelenmez: fullytransparenthiddenRGB analize dahil olur. L içinYrawgray,Cb/Cr sabit128 oluşturulur; bunlargerçekölçülmüşrenkkanalı değiltanımlıneutralchroma, meanremove sonrasıenergy0.

ICC dönüşümü yok; hamkanal sonuçları algısalrenkdoğruluğu garantisideğildir. JPEGsubsampling,resize,keskinleştirme ve conversion spektrumudeğiştirir. KromaHFenerji tekbaşınaAI/chromableeding kanıtı değildir. Knowncolorpatch vechannelindependence/alpha/range tests bağımsızformülle doğrulanır.
