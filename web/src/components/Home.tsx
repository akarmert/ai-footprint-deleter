import { useRef, useState } from 'react';
import { version } from '../../package.json';

export function Icon({ kind = 'shield' }: { kind?: 'shield' | 'file' | 'scan' | 'save' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          kind === 'shield'
            ? 'M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z M9 12l2 2 4-4'
            : kind === 'file'
              ? 'M14 3H6v18h12V7l-4-4Z M14 3v5h4 M9 14l3-3 3 3 M12 11v7'
              : kind === 'scan'
                ? 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 12h10 M7 8h6 M7 16h8'
                : 'M5 3h12l4 4v14H3V3h2Z M7 3v6h10V3 M7 21v-8h10v8'
        }
      />
    </svg>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  return (
    <header
      className="site-header"
      onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
          menu.current?.focus();
        }
      }}
    >
      <a className="brand" href="#">
        <span className="brand-mark">
          <Icon />
        </span>
        <span>
          AI Footprint <strong>Cleaner</strong>
        </span>
      </a>
      <button
        ref={menu}
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen(!open)}
      >
        Menü
      </button>
      <nav id="site-nav" className={open ? 'is-open' : ''} aria-label="Ana navigasyon" onClick={() => setOpen(false)}>
        <a href="#how-it-works">Nasıl Çalışır?</a>
        <a href="#privacy">Gizlilik</a>
        <a href="#faq">SSS</a>
        <a className="button primary" href="#workspace">
          Dosya Analiz Et
        </a>
      </nav>
    </header>
  );
}
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title">
        Dosyanı tanı.
        <br />
        <span>İzlerini yönet.</span>
      </h1>
      <p>
        Görsel ve videolarındaki gizli metadata bilgilerini incele, desteklenen kayıtları güvenle temizle. Dosyaların
        sunucuya yüklenmeden tarayıcında işlensin.
      </p>
    </section>
  );
}
const questions = [
  [
    'Metadata nedir?',
    'Bir dosyaya eklenmiş cihaz, tarih, konum, üretim aracı veya renk profili gibi bilgilerdir. Her dosya aynı bilgileri içermez.',
  ],
  [
    'Dosyalarım sunucuya yükleniyor mu?',
    'Hayır. Medya tarayıcındaki Worker içinde yerel olarak işlenir. Video kaydında geçici yerel depolama kullanılabilir.',
  ],
  [
    'Hangi formatlar destekleniyor?',
    'JPEG, PNG, WebP ve sınırlı MP4/MOV yapıları desteklenir. Görsellerde sınır 128 MiB, videolarda 1.000.000.000 bayttır. Her codec veya kapsayıcı yapısı desteklenmez.',
  ],
  [
    'Görüntü kalitesi değişiyor mu?',
    'Desteklenen metadata yeniden kodlama yapılmadan kaldırılır. Güvenli Mod renk profilini ve görüntü yönünü korur. Kapsamlı modda JPEG/WebP ICC kaldırılması renk görünümünü etkileyebilir.',
  ],
  [
    'Bütün AI izlerini kaldırabilir mi?',
    'Hayır. Metadata beyanı AI üretiminin kesin kanıtı değildir. Bütün metadata’nın silinmesi, görünmez filigran kaldırılması veya AI tespit sistemlerini yanıltma garantisi yoktur.',
  ],
  [
    'C2PA kayıtları doğrulanıyor mu?',
    'Web sürümü kriptografik imza, trust veya içerik hash doğrulaması yapmaz. Okunabilen alanlar doğrulanmamış kaynak beyanıdır. Mevcut veya belirsiz provenance metadata temizliğini engeller. Desteklenen JPEG/PNG/WebP dosyalarında üst düzey gömülü C2PA deposu, ayrı bir onay penceresi olmadan Tüm Metadata’yı Kaldır veya Yalnız C2PA’yı Kaldır ile kaldırılabilir; bu depodaki üretici, telif, lisans ve Actions bilgileri de kaybolur. Hak/telif onayı gerektiren diğer metadata korunur. Harici manifestler ve piksel içi filigranlar (ör. SynthID) etkilenmez.',
  ],
];
export function HomeInformation() {
  return (
    <>
      <section id="how-it-works" className="info-section">
        <h2>Nasıl çalışır?</h2>
        <div className="steps">
          {[
            ['file', 'Dosyanı Seç', 'Görsel veya videonu cihazından seç.'],
            ['scan', 'Metadata’yı İncele', 'Desteklenen metadata ve kaynak kayıtlarını gör.'],
            ['save', 'Temizle ve Kaydet', 'Uygun kayıtları temizle, doğrulanmış çıktını al.'],
          ].map(([kind, title, text], index) => (
            <article className="step-card" key={kind}>
              <div className="step-top">
                <Icon kind={kind as 'file' | 'scan' | 'save'} />
                <span>0{index + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="privacy" className="privacy-section info-section">
        <div>
          <h2>Dosyan cihazında kalır.</h2>
          <p>
            Medya sunucuya yüklenmez. İşlem tarayıcıda yerel olarak yürütülür; orijinal dosya korunur. Desteklenen
            metadata kayıtları yeniden kodlamadan temizlenebilir.
          </p>
        </div>
        <div className="privacy-detail">
          <Icon />
          <h3>Yerel işlem. Dürüst sınırlar.</h3>
          <p>
            Video çıktısı için geçici yerel depolama kullanılır. Sekme veya tarayıcı kapanırsa geçici medya dosyaları
            kalabilir. Yalnız yetkili olduğun dosyalarda kullan.
          </p>
          <a href="#technical-limits">Teknik sınırlamaları incele →</a>
        </div>
      </section>
      <section id="faq" className="info-section faq">
        <h2>Sık sorulan sorular</h2>
        {questions.map(([title, answer]) => (
          <details key={title}>
            <summary>{title}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
    </>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <a className="brand" href="#">
          AI Footprint <strong>Cleaner</strong>
        </a>
        <p>Medya yüklemesi ve analytics olmadan yerel işlem.</p>
      </div>
      <div>
        <a href="https://github.com/akarmert/ai-footprint-deleter" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <a href="#technical-limits">Teknik sınırlamalar</a>
        <span>Web v{version}</span>
      </div>
      <p className="footer-note" id="technical-limits">
        Bütün metadata veya AI izlerinin kaldırılması garanti edilmez. Video kaydı güncel masaüstü Chrome/Edge, HTTPS
        (veya localhost), File System Access ve yeterli geçici alan gerektirir.
      </p>
    </footer>
  );
}
