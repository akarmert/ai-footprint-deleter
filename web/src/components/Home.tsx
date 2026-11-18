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
      <nav id="site-nav" className={open ? 'is-open' : ''} aria-label="Ana menü" onClick={() => setOpen(false)}>
        <a href="#how-it-works">Nasıl çalışır?</a>
        <a href="#privacy">Gizlilik</a>
        <a href="#faq">SSS</a>
        <a className="button primary" href="#workspace">
          Dosya seç
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
        <span>İzlerini temizle.</span>
      </h1>
      <p>
        Görsel ve videolarındaki metadata’yı ve AI kaynak kayıtlarını gör, tek tıkla temizle. Dosyan sunucuya
        gönderilmez; her şey tarayıcında olur.
      </p>
    </section>
  );
}
const questions = [
  [
    'Metadata nedir?',
    'Dosyaya eklenen cihaz, tarih, konum, yazılım, telif ve AI aracı gibi bilgilerdir. Her dosyada farklıdır.',
  ],
  ['Dosyam sunucuya yükleniyor mu?', 'Hayır. Dosyan tarayıcında işlenir ve hiçbir sunucuya gönderilmez.'],
  [
    'Hangi dosyaları destekliyor?',
    'Görsel: JPEG, PNG ve WebP, en fazla 128 MiB. Video: MP4 ve MOV, en fazla 1 GB; masaüstü Chrome veya Edge gerekir. Bazı video biçimleri desteklenmez.',
  ],
  [
    'Görüntü kalitesi değişir mi?',
    'Hayır. Pikseller yeniden kodlanmaz; yalnız metadata blokları çıkarılır. Renk profili ve görüntü yönü korunur.',
  ],
  [
    'Bütün AI izlerini siler mi?',
    'Hayır. Yalnız dosyadaki metadata ve C2PA kayıtları silinir. SynthID gibi piksel içi filigranlar ve görünür logolar kalır. AI tespit araçlarını atlatma garantisi yoktur.',
  ],
  [
    'C2PA nedir, doğrulanıyor mu?',
    'C2PA, dosyanın nasıl üretildiğini ve düzenlendiğini anlatan kaynak kaydıdır. Bu araç kaydı okur ve kaldırır, ama imzasını doğrulamaz; okunan bilgiler doğrulanmamış beyandır.',
  ],
  [
    'AI aracının adı nereden geliyor?',
    'Dosyanın kendi C2PA veya metadata kaydından. Kayıt değiştirilmiş ya da silinmiş olabilir; kayıt yoksa araç adı gösterilemez.',
  ],
];
export function HomeInformation() {
  return (
    <>
      <section id="how-it-works" className="info-section">
        <h2>Nasıl çalışır?</h2>
        <div className="steps">
          {[
            ['file', 'Dosyanı seç', 'Görsel veya videonu sürükle ya da seç.'],
            ['scan', 'İncele', 'Bulunan metadata’yı ve AI aracını gör.'],
            ['save', 'Temizle ve indir', 'Tüm Metadata’yı Kaldır’a bas, doğrulanmış dosyayı al.'],
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
            Dosyan sunucuya gönderilmez; tüm işlem tarayıcında yapılır. Orijinal dosyan değişmez, temizlenen kopya ayrı
            indirilir.
          </p>
        </div>
        <div className="privacy-detail">
          <Icon />
          <h3>Yerel işlem, açık sınırlar</h3>
          <p>
            Videolar işlenirken tarayıcının geçici alanı kullanılır; tarayıcı çökerse geçici dosya kalabilir. Aracı
            yalnız hakkın olan dosyalarda kullan.
          </p>
          <a href="#technical-limits">Sınırları gör →</a>
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
        <p>Yükleme yok, izleme yok; işlem tarayıcında.</p>
      </div>
      <div>
        <a href="https://github.com/akarmert/ai-footprint-deleter" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <a href="#technical-limits">Sınırlar</a>
        <span>v{version}</span>
      </div>
      <p className="footer-note" id="technical-limits">
        Bütün metadata’nın veya AI izlerinin silindiği garanti edilmez. C2PA imzaları doğrulanmaz. Video kaydı masaüstü
        Chrome veya Edge gerektirir.
      </p>
    </footer>
  );
}
