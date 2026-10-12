import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection, type Inspection, type WorkerResult } from './media';
import { supportsDiskOutput } from './output';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<Inspection>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const diskOutput = supportsDiskOutput();
  const workerSupported = typeof Worker !== 'undefined';
  function stop() { worker.current?.terminate(); worker.current = null; clearTimeout(timeout.current); }
  useEffect(() => () => stop(), []);
  function clear() { stop(); setFile(undefined); setResult(undefined); setBusy(false); setError(''); if (input.current) input.current.value = ''; }
  function select(files: FileList | null) {
    const selections = files ? Array.from(files) : [];
    clear();
    if (!selections.length) return;
    if (selections.length !== 1) { setError('Bir seferde yalnız bir dosya seçin.'); return; }
    const selected = selections[0];
    try {
      validateSelection(selected);
      if (!workerSupported) throw new Error('Web Workers desteklenmiyor. Güncel bir tarayıcı kullanın.');
      setFile(selected); setBusy(true);
      const active = new Worker(new URL('./inspect.worker.ts', import.meta.url), { type: 'module' });
      worker.current = active;
      const fail = (message: string) => { if (worker.current !== active) return; stop(); setBusy(false); setError(message); };
      active.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
        if (worker.current !== active) return;
        stop(); setBusy(false);
        if (data.type === 'result') setResult(data.result); else setError(data.message);
      };
      active.onerror = () => fail('Yerel inceleme başlatılamadı. Dosya gönderilmedi.');
      active.onmessageerror = () => fail('Worker yanıtı okunamadı.');
      timeout.current = setTimeout(() => fail('İnceleme zaman aşımına uğradı. Yeniden dosya seçin.'), 15000);
      active.postMessage(selected); // File structured clone; no full-file ArrayBuffer or network.
    } catch (cause) { stop(); setBusy(false); setError(cause instanceof Error ? cause.message : 'Dosya seçilemedi.'); }
  }
  return <div className="shell">
    <header><a className="brand" href="/" aria-label="AI Footprint Cleaner ana sayfa"><span className="brand-mark">AF</span><span>AI Footprint <strong>Cleaner</strong></span></a><span className="phase">WEB / FAZ 1</span></header>
    <main>
      <section className="intro"><p className="eyebrow">YEREL İŞLEME · SIFIR MEDYA YÜKLEMESİ</p><h1>Dosyanız sizde kalır.</h1><p>Görsel ve videolar için gizlilik odaklı çalışma alanı.<br className="desktop-break" /> Dosyanızı seçin; ilk format kontrolünü tarayıcınızda yapın.</p></section>
      <div className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title"><div className="panel-heading"><h2 id="source-title">01 <span>Dosya seçimi</span></h2><span className="chip">Yalnız yerel</span></div>
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
            <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="34" height="34" rx="7"/><path d="M16 28l8-8 8 8M24 20v14M16 14h16"/></svg>
            <h3>Bir dosya bırakın</h3><p>veya cihazınızdan seçin</p>
            <input ref={input} id="media" type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" onChange={event => select(event.target.files)} disabled={!workerSupported} />
            <button className="primary" onClick={() => input.current?.click()} disabled={!workerSupported}>Dosya seç</button>
            <p className="formats">JPEG · PNG · WebP · MP4 · MOV</p>
          </div>
          <div className="limits"><span>Görsel <strong>128 MiB</strong></span><span>Video <strong>1 GB</strong></span></div>
          <div className="file-details"><h3>Seçili dosya</h3>{file ? <dl><div><dt>Ad</dt><dd className="filename">{file.name}</dd></div><div><dt>Format</dt><dd>{result?.format ?? 'Doğrulanmadı'}</dd></div><div><dt>Boyut</dt><dd>{file.size.toLocaleString('tr-TR')} bayt</dd></div></dl> : <p className="muted">Henüz dosya seçilmedi.</p>}</div>
        </section>
        <section className="panel inspection-panel" aria-labelledby="inspection-title"><div className="panel-heading"><h2 id="inspection-title">02 <span>İnceleme özeti</span></h2></div>
          <div className="status" role="status" aria-live="polite"><span className={`status-dot ${busy ? 'busy' : ''}`}/><div><strong>{busy ? 'Başlık yerel olarak okunuyor…' : result ? 'Dosya başlığı tanındı' : error ? 'İnceleme tamamlanamadı' : 'Dosya bekleniyor'}</strong><p>{result ? `Worker ${result.bytesRead.toLocaleString('tr-TR')} bayt okudu. Tam dosya doğrulaması yapılmadı.` : 'Medya hiçbir sunucuya gönderilmez.'}</p></div></div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="metadata"><h3>Metadata</h3><span className="tag">Henüz taranmadı</span><p>EXIF, XMP, ICC ve C2PA ayrıştırması Faz 2’de eklenecek. Başlık kontrolü metadata yokluğu, geçerli medya veya AI kökeni kanıtı değildir.</p></div>
          <div className="output"><h3>Temizle ve indir</h3><p>Temizleme motoru bu fazda etkin değil. Değiştirilmemiş dosya “temizlendi” olarak sunulmaz.</p><div className="actions"><button disabled>Temizle · Faz 2</button><button disabled>İndir</button><button className="text-button" disabled={!file && !error} onClick={clear}>{busy ? 'İptal et' : 'Seçimi kaldır'}</button></div></div>
        </section>
      </div>
      <aside className="capabilities"><div><h3>Tarayıcı yetenekleri</h3><p>Web Worker: <strong>{workerSupported ? 'destekleniyor' : 'desteklenmiyor'}</strong> · Parçalı okuma: <strong>{typeof Blob.prototype.slice === 'function' ? 'destekleniyor' : 'desteklenmiyor'}</strong></p></div><p className={diskOutput ? 'muted' : 'warning'}>{diskOutput ? 'Doğrudan diske yazma API’si mevcut. İzin ve çıktı akışı motor eklendiğinde kullanılacak.' : 'Doğrudan diske yazma desteklenmiyor. Büyük video çıktısı için destekleyen, HTTPS üzerinde çalışan bir tarayıcı gerekecek; RAM’e tam dosya yükleme yedeği yok.'}</p></aside>
      <footer><span>İçerik, dosya adı ve metadata yüklenmez. Otomatik kalıcı depolama ve analitik yok.</span><span>Faz 1 — Altyapı önizlemesi</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
