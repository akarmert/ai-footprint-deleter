# Dashboard mimarisi — metadata ve kaynak özeti

## Kapsam

v0.2.0a1 mevcut uygulama korunur. Dashboard salt-okunur sunum ekranıdır; metadata silme, yeniden kodlama, AI kökeni veya görünmez filigran tespiti yapmaz. Referansın dosya başlığı/statuskartı/sayaç/filtre/accordion bilgi mimarisi mevcut koyu temaya uyarlanır. Ek önizleme decode başlatılmaz.

## Veri akışı

`scan_path → WorkflowTask → scan_dashboard → mevcut Workflow.scan → build_dashboard(ScanResult) → bounded kaynak SHA256 recheck → DashboardScan(scan,model) → generation/cancel kontrolü → MetadataOverview.show_model`

Ağ servisi/yeni bağımlılık yoktur. Metadata/C2PA/analiz motorları değişmez. View model worker thread'de hazırlanır; GUI ağır manifest JSON parse etmez. OrijinalScanResult rapor/cleaner için korunur; presentation dataclass'ları read-only/frozen'dır. Snapshot ile taranan hash, gösterimden önce mevcut dosya byteboyutu/SHA256 ile kontrol edilir; farklılık SourceChanged invalidation'a gider. Son hash kontrolünden sonra aynı kullanıcının dosyayı yeniden değiştirmesi bütün süreçlerde mümkün olduğundan sonsuz canlı dosya geçerliliği garantisi yoktur.

## Sayaç modeli

Dosya özellikleri metadata toplamına dahil değildir. Kapsayıcılar (EXIF:idx,PNGtext:idx,APP11:idx gibi) ve çözümlenmiş yaprak alanlar ayrı tutulur. Alanlar stablekey ile tekilleştirilir; ham kapsayıcı önizlemesi ayrıca ikinci bir yaprak sayılmaz. Privacy/production mantıksal gruplarında tekrar gösterilen aynı alan genel sayaca yeniden eklenmez. Opaque XMP/IPTC alanları semantik olarak ayrıştırılmış kabul edilmez; None/ayrıştırılamadı ile belirtilir. Kullanıcı arayüzünde bounded kapsama ilişkin uyarı gösterilir; farklı araçların recursive alan sayısıyla birebir eşitlik beklenmez.

Ham XMP/EXIF/ICC image.info yansımaları ve EXIF IFD/GPS grup işaretçileri yaprak sayılmaz. PNG XML-XMP opak gruptur. C2PA kaynak değerleri sunum kısaltmasına göre değil64node/8192karakter/4depth sınırında kayıpsız fingerprint ile tekilleştirilir; sınırı aşan/döngülüdeğerler ayrı tutulup uyarılır. Ingredients32,assertions64,actions128 sınırları birikimli kapsam uyarısı üretir; incelenmeyen kayıtlarda yokluk iddia edilmez. Dosya/uyarı filtreleri gösterim satırı sayar; globalmetadata toplamına dahil olmaz. C2PA absent halinde kaynak kayıt sayısı0, unknown/okunamayan halinde bilinmiyor kalır.

C2PA varlık/kriptografik kontrolleri ayrı gösterilir; türetilmiş UI kontrol satırları kaynakta yeni metadata varmış gibi sayılmaz. Gerçek aktifmanifest assertion kayıtları kontrollü biçimde sunulur. Önceki ingredient zinciri active manifestle aynı doğrulama anlamına gelmez.

## C2PA ve beyan semantiği

Presence,readability,signature,content_hash,trust birbirinden bağımsızdır. Untrusted/Unknown/Failed birleşikgenelVerified olarak sunulmaz. ClaimGenerator araç/kütüphanedir; model adı değildir. Yalnız gerçek digitalSourceType kayıtlarında trainedAlgorithmicMedia AI üretim beyanı olarak gösterilir; filename/pixel tahmini yoktur. SynthID metni varsa kayıtlı filigran beyanıdır, dedektör sonucu değildir. Güvenilmeyen manifest beyanları görünür uyarıyla birlikte gösterilir.

## UI güvenliği ve performans

Metadata güvenilmeyen metindir: QLabel PlainText, QTableWidgetItem düzmetin, detaylar QPlainTextEdit. HTML/XML/link otomatikçalıştırma veya dışlink açma yoktur. Uzun değerler kısaltılır; kontrollü bounded detay diyaloğu bulunur. Accordion satırları lazy/bounded oluşturulur; tümünüaç sınırsız widget üretmez. Filtre yalnız görünürsection seçimini değiştirir; ScanResult değiştirilmez. Uzun dosya adı elide/tooltip ile okunur; path/hash safe rapora otomatik aktarılmaz.

## Durum yönetimi

Empty,scanning,verifying,completed,failed,cancelled,source_changed ayrı görünürdür. Tarama sırasında indeterminate gösterim vardır; sahte yüzde yoktur. Final kaynak kontrolü bitmeden100tamamlanma yoktur. Rapid switching generation'ı artırır, eski kartları hemen temizler, eski worker progress/result yok sayılır; son seçilen dosya sıraya alınır. Kapanış mevcut cooperative worker lifecycle'ını kullanır.

## Sınırlar

XMP/IPTC semantik ayrıştırma ve bazı özel metadata kapsamı sınırlı kalır. GPS/prompt gibi bilgiler bulunamadı denmeden supported parser kapsamında aranmış olmalıdır; aksi halde desteklenmiyor/kontrol edilemedi denir. Native C2PA ağ izolasyonu/firewall/packet-capture öncekiNotTested durumundadır. Ekran ve raporlar anonimlik/telifuygunluk/AItespit sertifikası değildir.
