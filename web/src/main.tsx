import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection } from './media';
import type { Scan, MetadataRecord } from './engine';
import type { Response, VerifiedOutput } from './protocol';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<Scan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const [selected, setSelected] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'scan' | 'clean'>('');
  const [dragging, setDragging] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const downloadURL = useRef<string | undefined>(undefined);
  const supported = typeof Worker !== 'undefined';
  function revoke() { if (downloadURL.current) URL.revokeObjectURL(downloadURL.current); downloadURL.current = undefined; }
  function stop() { worker.current?.terminate(); worker.current = null; clearTimeout(timer.current); }
  useEffect(() => () => { stop(); revoke(); }, []);
  function clear() { stop(); revoke(); setFile(undefined); setScan(undefined); setOutput(undefined); setSelected([]); setConsent(false); setBusy(''); setError(''); if (input.current) input.current.value = ''; }
  function cancel() { clear(); setError('İşlem iptal edildi; kaynak ve çıktı bellekten bırakıldı. Yeniden dosya seçin.'); }
  function expire(active: Worker) { clearTimeout(timer.current); timer.current = setTimeout(() => { if (worker.current === active) { clear(); setError('İşlem zaman aşımına uğradı. Çıktı sunulmadı.'); } }, 120000); }
  function select(files: FileList | null) {
    const list = files ? Array.from(files) : []; clear();
    if (!list.length) return;
    if (list.length !== 1) { setError('Bir seferde yalnız bir dosya seçin.'); return; }
    const source = list[0];
    try {
      const format = validateSelection(source);
      if (format === 'MP4' || format === 'MOV') throw new Error('Video işleme Faz 2 kapsamında değil. JPEG, PNG veya WebP seçin.');
      if (!supported) throw new Error('Web Workers desteklenmiyor. Güncel bir tarayıcı kullanın.');
      setFile(source); setBusy('scan');
      const active = new Worker(new URL('./inspect.worker.ts', import.meta.url), { type: 'module' }); worker.current = active;
      active.onmessage = ({ data }: MessageEvent<Response>) => {
        if (worker.current !== active) return;
        clearTimeout(timer.current); setBusy('');
        if (data.type === 'scan') { setScan(data.scan); setSelected([]); }
        else if (data.type === 'clean') { revoke(); setOutput(data.output); setSelected([]); }
        else { revoke(); setOutput(undefined); setError(data.message); }
      };
      active.onerror = () => { if (worker.current === active) { clear(); setError('Worker çalıştırılamadı. Çıktı sunulmadı.'); } };
      active.onmessageerror = () => { if (worker.current === active) { clear(); setError('Worker yanıtı okunamadı. Çıktı sunulmadı.'); } };
      expire(active); active.postMessage({ type:'scan', file:source });
    } catch (cause) { stop(); setBusy(''); setError(cause instanceof Error ? cause.message : 'Dosya seçilemedi.'); }
  }
  function clean() {
    if (!worker.current || !scan || !selected.length || scan.cleaningBlocked) return;
    revoke(); setOutput(undefined); setError(''); setBusy('clean'); expire(worker.current);
    worker.current.postMessage({ type:'clean', ids:selected, rightsConsent:consent });
  }
  function download() {
    if (!output || !file || busy) return;
    revoke(); const url = URL.createObjectURL(output.blob); downloadURL.current = url;
    const link = document.createElement('a'); link.href = url;
    const base = file.name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0,120) || 'gorsel';
    link.download = `${base}-temiz.${output.scan.format === 'JPEG' ? 'jpg' : output.scan.format.toLowerCase()}`;
    link.click();
  }
  function toggle(record: MetadataRecord) { revoke(); setOutput(undefined); setSelected(items => items.includes(record.id) ? items.filter(id => id !== record.id) : [...items,record.id]); }
  const counts = (status: MetadataRecord['status']) => scan?.records.filter(r => r.status === status).length ?? 0;
  return <div className="shell">
    <header><a className="brand" href="/" aria-label="AI Footprint Cleaner ana sayfa"><span className="brand-mark">AF</span><span>AI Footprint <strong>Cleaner</strong></span></a><span className="phase">WEB / FAZ 2</span></header>
    <main>
      <section className="intro"><p className="eyebrow">YEREL İŞLEME · SIFIR MEDYA YÜKLEMESİ</p><h1>Dosyanız sizde kalır.</h1><p>JPEG, PNG ve WebP metadata’sını yerel olarak inceleyin.<br className="desktop-break" /> Desteklenen blokları yeniden sıkıştırmadan kaldırın.</p></section>
      <div className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title"><div className="panel-heading"><h2 id="source-title">01 <span>Dosya seçimi</span></h2><span className="chip">Yalnız yerel</span></div>
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
            <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="34" height="34" rx="7"/><path d="M16 28l8-8 8 8M24 20v14M16 14h16"/></svg>
            <h3>Bir görsel bırakın</h3><p>veya cihazınızdan seçin</p>
            <input ref={input} id="media" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={event => select(event.target.files)} disabled={!supported} />
            <button className="primary" onClick={() => input.current?.click()} disabled={!supported}>Dosya seç</button><p className="formats">JPEG · PNG · WebP</p>
          </div>
          <div className="limits"><span>Görsel <strong>128 MiB</strong></span><span>Video <strong>Bu fazda yok</strong></span></div>
          <div className="file-details"><h3>Seçili dosya</h3>{file ? <dl><div><dt>Ad</dt><dd className="filename">{file.name}</dd></div><div><dt>Format</dt><dd>{scan?.format ?? 'Doğrulanmadı'}</dd></div><div><dt>Boyut</dt><dd>{file.size.toLocaleString('tr-TR')} bayt</dd></div>{scan && <><div><dt>Görsel</dt><dd>{scan.width} × {scan.height} · Alpha: {scan.alpha ? 'var' : 'yok'} · Orientation: {scan.orientation ?? 'bilinmiyor'}</dd></div><div><dt>C2PA</dt><dd>{scan.cleaningBlocked ? 'Kaynak kaydı var/belirsiz; imza doğrulanmadı' : 'Bilinen C2PA kaydı saptanmadı; yokluğu garanti değil'}</dd></div></>}</dl> : <p className="muted">Henüz dosya seçilmedi.</p>}</div>
          <p className="privacy-note">Orijinal değişmez. Piksel decode/yeniden kodlama yapılmaz. Kapsayıcı doğrulaması tam codec geçerliliği veya tüm kişisel bilgilerin kaldırıldığı garantisi değildir.</p>
        </section>
        <section className="panel inspection-panel" aria-labelledby="inspection-title"><div className="panel-heading"><h2 id="inspection-title">02 <span>Metadata ve işlem</span></h2></div>
          <div className="status" role="status" aria-live="polite"><span className={`status-dot ${busy ? 'busy' : ''}`}/><div><strong>{busy === 'scan' ? 'Metadata taranıyor…' : busy === 'clean' ? 'Temizleniyor ve doğrulanıyor…' : output ? 'Temizlendi · Çıktı doğrulandı' : scan ? 'Metadata taraması tamamlandı' : error ? 'İşlem tamamlanamadı' : 'Dosya bekleniyor'}</strong><p>Medya ve metadata hiçbir sunucuya gönderilmez.</p></div></div>
          {error && <div className="error" role="alert">{error}</div>}
          {scan && <><div className="summary-counts"><span>Temizlenebilir: {counts('cleanable')}</span><span>Korunan: {counts('protected')}</span><span>Desteklenmeyen: {counts('unsupported')}</span></div>{scan.notes.map((note,i) => <p className="warning scan-note" key={i}>{note}</p>)}{scan.cleaningBlocked && <p className="warning">Kaynak/imza kaydı mevcut veya belirsiz: bu dosyada tüm temizleme engellendi. C2PA kaldırma ve imza doğrulama desteklenmiyor.</p>}</>}
          <div className="metadata"><h3>Metadata blokları</h3>{scan && <p className="scan-note">Önizlemeler en fazla 512 karakterdir. Bloklar alt alanlar hâlinde düzenlenmez; telif bilgisi içerebilen bloklar yetki onayına kadar korunur.</p>}{!scan ? <p>Dosya seçildiğinde destek kapsamı ve kayıtlar burada görünür.</p> : !scan.records.length ? <p>Desteklenen metadata blokları bulunamadı. Bu, tüm metadata’nın yokluğu kanıtı değildir.</p> : <div className="record-list">{scan.records.map(record => {
            const removable = record.status === 'cleanable' && (!record.requiresRightsConsent || consent) || record.status === 'protected' && record.requiresRightsConsent && consent;
            const label = record.status === 'cleanable' ? 'Temizlenebilir' : record.status === 'protected' ? record.requiresRightsConsent && consent ? 'Yetki onayıyla seçilebilir' : 'Korunan' : 'Desteklenmeyen';
            return <article className="record" key={record.id}><label><input type="checkbox" checked={selected.includes(record.id)} disabled={!!busy || !removable || scan.cleaningBlocked} onChange={() => toggle(record)} /><strong>{record.kind}</strong><span>{label} · {record.bytes.toLocaleString('tr-TR')} bayt</span></label><p>{record.reason}</p>{record.preview && <details><summary>Yerel metadata ayrıntısı</summary><pre>{record.preview}</pre></details>}</article>;
          })}</div>}</div>
          {scan?.records.some(r => r.requiresRightsConsent) && <label className="consent"><input type="checkbox" checked={consent} disabled={!!busy || scan.cleaningBlocked} onChange={event => { setConsent(event.target.checked); setSelected([]); setOutput(undefined); revoke(); }} />Telif/hak kayıtlarını kaldırmaya yetkiliyim. Seçtiğim bloktaki tüm alt alanların kaldırılacağını anlıyorum. Bu onay C2PA kaldırmayı etkinleştirmez.</label>}
          <div className="output"><h3>Temizle ve indir</h3><p>Seçilen kapsayıcı blokları kaldırılır. ICC, yön ve görüntü payload’ı korunur; doğrulama başarısızsa indirme sunulmaz.</p>{output && <div className="verification" role="status"><p>Kaldırılan: {output.removed} · Korunan: {output.retained} · Desteklenmeyen (korundu): {output.scan.records.filter(r => r.status === 'unsupported').length}</p><p>Seçili blokların kaldırılması, kalan blok baytları, payload SHA-256, format, çözünürlük, alpha, orientation ve ICC kontrolleri başarılı.</p><details><summary>Payload SHA-256</summary><code>{output.payloadHash}</code></details></div>}<div className="actions"><button onClick={clean} disabled={!scan || !!busy || !selected.length || scan.cleaningBlocked}>Seçilenleri temizle ({selected.length})</button><button onClick={download} disabled={!output || !!busy}>İndir</button><button className="text-button" disabled={!file && !error} onClick={busy ? cancel : clear}>{busy ? 'İptal et' : 'Seçimi kaldır'}</button></div></div>
        </section>
      </div>
      <aside className="capabilities"><div><h3>Güvenli yerel işleme</h3><p>Web Worker: <strong>{supported ? 'destekleniyor' : 'desteklenmiyor'}</strong> · Tek dosya · Yeniden sıkıştırma yok</p></div><p className="muted">Görseller için sınırlı tam dosya belleği ve doğrulanmış Blob indirmesi kullanılır. Büyük video işleme/çıktı bu fazda yoktur. Yalnız yetkili olduğunuz dosyalarda kullanın.</p></aside>
      <footer><span>İçerik, dosya adı ve metadata yüklenmez. Otomatik kalıcı depolama ve analitik yok.</span><span>Faz 2 — Görsel metadata</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
