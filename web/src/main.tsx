import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection } from './media';
import type { MediaScan, Response, VerifiedOutput, VideoResponse } from './protocol';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<MediaScan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'scan' | 'clean'>('');
  const [dragging, setDragging] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);
  const downloadURL = useRef<string | undefined>(undefined);
  const supported = typeof Worker !== 'undefined';
  function revoke() { if (downloadURL.current) URL.revokeObjectURL(downloadURL.current); downloadURL.current = undefined; }
  const videoWorker = useRef(false);
  const [videoDone, setVideoDone] = useState(false);
  const [videoRemoved, setVideoRemoved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [temporaryDirectory, setTemporaryDirectory] = useState<FileSystemDirectoryHandle>();
  async function selectTemporaryDirectory() {
    const version = generation.current;
    setSaving(true); setError('');
    try {
      const directory = await chooseTemporaryDirectory();
      if (generation.current === version) setTemporaryDirectory(directory);
    } catch (cause) {
      if (generation.current === version) setError(cause instanceof Error ? cause.message : 'Geçici klasör seçilemedi.');
    } finally { if (generation.current === version) setSaving(false); }
  }
  const [committing, setCommitting] = useState(false);
  const [uncertainCommit, setUncertainCommit] = useState(false);
  const cancelling = useRef(false);
  const committingRef = useRef(false);
  const generation = useRef(0);
  function stop() {
    if (worker.current) {
      if (videoWorker.current) worker.current.postMessage({ type: 'cancel' });
      else worker.current.terminate();
    }
    worker.current = null; clearTimeout(timer.current);
  }
  useEffect(() => () => { stop(); revoke(); }, []);
  function clear() { if (committingRef.current) return; cancelling.current = false; generation.current++; setVideoDone(false); setSaving(false); setUncertainCommit(false); stop(); revoke(); setFile(undefined); setTemporaryDirectory(undefined); setScan(undefined); setOutput(undefined);  confirmation.current?.close(); setPendingConsent(false); setBusy(''); setError(''); if (input.current) input.current.value = ''; }
  function cancel() {
    if (committingRef.current) return;
    if (videoWorker.current && worker.current && busy) {
      cancelling.current = true; worker.current.postMessage({ type: 'cancel' });
      setError('İptal istendi; disk kapanışı bekleniyor.');
      clearTimeout(timer.current);
      const active = worker.current;
      timer.current = setTimeout(() => {
        if (worker.current !== active || committingRef.current) return;
        active.terminate(); worker.current = null; setBusy('');
        setError('İptal kapanışı zaman aşımına uğradı. Disk sonucu belirsiz; hedefi kontrol edin. Geçici site dosyası kalmış olabilir.');
      }, 10000);
    } else { clear(); setError('İşlem iptal edildi; kaynak ve çıktı bellekten bırakıldı. Yeniden dosya seçin.'); }
  }
  function expire(active: Worker) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (worker.current !== active || committingRef.current) return;
      if (videoWorker.current) {
        active.postMessage({ type: 'cancel' }); cancelling.current = true;
        setError('Zaman aşımı; disk kapanışı bekleniyor.');
        timer.current = setTimeout(() => {
          if (worker.current !== active || committingRef.current) return;
          active.terminate(); worker.current = null; setBusy('');
          setError('Disk sonucu belirsiz; hedefi ve geçici site dosyalarını kontrol edin.');
        }, 10000);
      } else { clear(); setError('İşlem zaman aşımına uğradı. Çıktı sunulmadı.'); }
    }, 120000);
  }
  function select(files: FileList | null) {
    if ((videoWorker.current && busy) || committingRef.current) return;
    const list = files ? Array.from(files) : []; clear();
    if (!list.length) return;
    if (list.length !== 1) { setError('Bir seferde yalnız bir dosya seçin.'); return; }
    const source = list[0];
    try {
      const format = validateSelection(source);
      const video = format === 'MP4' || format === 'MOV';
      videoWorker.current = video;
      if (!supported) throw new Error('Web Workers desteklenmiyor. Güncel bir tarayıcı kullanın.');
      setFile(source); setBusy('scan');
      const active = video
        ? new Worker(new URL('./video.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./inspect.worker.ts', import.meta.url), { type: 'module' });
      worker.current = active;
      active.onmessage = ({ data }: MessageEvent<Response | VideoResponse>) => {
        if (worker.current !== active) return;
        if (data.type === 'committing') {
          committingRef.current = true; setCommitting(true); clearTimeout(timer.current);
          setError('Dosya yayınlanıyor; bu aşama iptal edilemez. Sekmeyi kapatmayın.');
          timer.current = setTimeout(() => {
            if (worker.current === active && committingRef.current) { setUncertainCommit(true); setError('Disk yayınlama hâlâ bekliyor; sonuç belirsiz. Hedef dosyayı kontrol edin. Sekmeyi kapatmak geçici dosya bırakabilir.'); }
          }, 120000);
          return;
        }
        committingRef.current = false; setCommitting(false); setUncertainCommit(false); cancelling.current = false;
        clearTimeout(timer.current); setBusy('');
        if ('cleanupWarning' in data && data.cleanupWarning) setError(data.cleanupWarning);
        else if (data.type !== 'error') setError('');
        if (data.type === 'cancelled') { clear(); setError(data.cleanupWarning || 'İşlem iptal edildi; disk yazımı tamamlanmadı.'); return; }
        if (data.type === 'scan') { setScan(data.scan);  }
        else if (data.type === 'clean') { revoke(); setOutput(data.output);  }
        else if (data.type === 'video-done') { setVideoRemoved(data.removed); setVideoDone(true); }
        else if (data.type === 'error') { if (videoWorker.current) { active.terminate(); worker.current = null; setScan(undefined);  if (input.current) input.current.value = ''; } revoke(); setOutput(undefined); setError(`${data.message}${'cleanupWarning' in data && data.cleanupWarning ? ` ${data.cleanupWarning}` : ''}`); }
      };
      const workerFailure = (message: string) => {
        if (worker.current !== active) return;
        const videoFailure = videoWorker.current;
        committingRef.current = false; setCommitting(false); active.terminate(); clear();
        setError(videoFailure ? `${message} Disk sonucu belirsiz; hedefi kontrol edin. Geçici site dosyası kalmış olabilir.` : `${message} Çıktı sunulmadı.`);
      };
      active.onerror = () => workerFailure('Worker çalıştırılamadı.');
      active.onmessageerror = () => workerFailure('Worker yanıtı okunamadı.');
      expire(active); active.postMessage({ type:'scan', file:source, ...(video ? { format } : {}) });
    } catch (cause) { stop(); setBusy(''); setError(cause instanceof Error ? cause.message : 'Dosya seçilemedi.'); }
  }
  const eligible = scan?.cleaningBlocked ? [] : scan?.records.filter(record => record.status === 'cleanable' || record.status === 'protected' && record.requiresRightsConsent) ?? [];
  function requestClean() {
    if (!eligible.length || busy || saving || pendingConsent) return;
    if (eligible.some(record => record.requiresRightsConsent)) {
      setPendingConsent(true); confirmation.current?.showModal();
    } else void clean(false);
  }
  async function clean(consent: boolean) {
    if (!worker.current || !scan || !eligible.length || scan.cleaningBlocked || saving || busy) return;
    if (eligible.some(record => record.requiresRightsConsent) && !consent) return;
    const selected = eligible.map(record => record.id);
    const active = worker.current, version = generation.current;
    revoke(); setOutput(undefined); setVideoDone(false); setError('');
    try {
      if (scan.format === 'MP4' || scan.format === 'MOV') {
        if (!supportsDiskOutput()) throw new Error('Video çıktısı için HTTPS üzerinde güncel Chrome/Edge ve doğrudan disk yazımı gerekir. Blob indirme alternatifi yoktur.');
        setSaving(true);
        const handle = await chooseOutput(`${(file?.name ?? 'video').replace(/\.[^.]*$/, '')}-temiz.${scan.format.toLowerCase()}`);
        if (generation.current !== version || worker.current !== active) return;
        setBusy('clean'); expire(active);
        active.postMessage({ type: 'clean', ids: selected, rightsConsent: consent, handle, temporaryDirectory });
      } else {
        setBusy('clean'); expire(active);
        active.postMessage({ type:'clean', ids:selected, rightsConsent:consent });
      }
    } catch (cause) {
      if (generation.current === version) { setBusy(''); setError(cause instanceof Error ? cause.message : 'Çıktı seçilemedi.'); }
    } finally { if (generation.current === version) setSaving(false); }
  }
  function download() {
    if (!output || !file || busy) return;
    revoke(); const url = URL.createObjectURL(output.blob); downloadURL.current = url;
    const link = document.createElement('a'); link.href = url;
    const base = file.name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0,120) || 'gorsel';
    link.download = `${base}-temiz.${output.scan.format === 'JPEG' ? 'jpg' : output.scan.format.toLowerCase()}`;
    link.click();
  }
  const preserved = (scan?.records.length ?? 0) - eligible.length;
  return <div className="shell">
    <dialog ref={confirmation} aria-labelledby="consent-title" onCancel={() => setPendingConsent(false)} onClose={() => setPendingConsent(false)}>
      <h2 id="consent-title">Hak ve telif bilgileri için onay</h2>
      <p>Temizlenebilir bloklar hak/telif bilgileri içerebilir. Bu kayıtları kaldırmaya yetkili olduğunuzu onaylıyor musunuz? Uygun blokların tüm alt alanları kaldırılır; ICC, görüntü yönü ve C2PA korumaları değişmez.</p>
      <div className="dialog-actions"><button onClick={() => { confirmation.current?.close(); setPendingConsent(false); }}>Vazgeç</button><button className="primary" onClick={() => { confirmation.current?.close(); setPendingConsent(false); void clean(true); }}>Yetkim var, temizle</button></div>
    </dialog>
    <header><a className="brand" href="/" aria-label="AI Footprint Cleaner ana sayfa"><span className="brand-mark">AF</span><span>AI Footprint <strong>Cleaner</strong><small>Görsel &amp; Video Üstveri Temizleyici</small></span></a><span className="phase">Sıfır Medya Yüklemesi · Tarayıcı İçi İşlem</span></header>
    <main>
      <section className="intro"><p className="eyebrow">DAHA AZ İZ. DAHA FAZLA SADELİK.</p><h1>Sade, Sessiz ve<br /><em>Kusursuz Temizlik</em></h1><p>Gereksiz karmaşıklıktan arındırılmış, hızlı üstveri temizliği.</p></section>
      <section className="mode-selector" aria-label="Temizleme modu"><div className="mode active"><strong>Güvenli Mod <span>Önerilen</span></strong><p>ICC renk profili ve görüntü yönü korunur.</p></div><div className="mode"><button disabled aria-describedby="comprehensive-note">Kapsamlı Temizlik</button><p id="comprehensive-note">Ek yardımcı veri politikası henüz desteklenmiyor.</p></div></section>
      <div className="workspace">
        <section className="panel source-panel" aria-labelledby="source-title"><div className="panel-heading"><h2 id="source-title">01 <span>Dosya seçimi</span></h2><span className="chip">Yalnız yerel</span></div>
          <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); select(event.dataTransfer.files); }}>
            <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="34" height="34" rx="7"/><path d="M16 28l8-8 8 8M24 20v14M16 14h16"/></svg>
            <h3>Bir medya dosyası bırakın</h3><p>veya cihazınızdan seçin</p>
            <input ref={input} id="media" type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov" onChange={event => select(event.target.files)} disabled={!supported || videoWorker.current && !!busy || committing} />
            <button className="primary" onClick={() => input.current?.click()} disabled={!supported || videoWorker.current && !!busy || committing}>Dosya seç</button><p className="formats">JPEG · PNG · WebP · MP4 · MOV</p>
          </div>
          <div className="limits"><span>Görsel <strong>128 MiB</strong></span><span>Video <strong>1.000.000.000 bayt</strong></span></div>
          <div className="file-details"><h3>Seçili dosya</h3>{file ? <dl><div><dt>Ad</dt><dd className="filename">{file.name}</dd></div><div><dt>Format</dt><dd>{scan?.format ?? 'Doğrulanmadı'}</dd></div><div><dt>Boyut</dt><dd>{file.size.toLocaleString('tr-TR')} bayt</dd></div></dl> : <p className="muted">Henüz dosya seçilmedi.</p>}</div>
          <p className="privacy-note">Orijinal dosyanız korunur. Yeniden kodlama yapılmaz; medya sunucuya gönderilmez.</p>
        </section>
        <section className="panel inspection-panel" aria-labelledby="inspection-title"><div className="panel-heading"><h2 id="inspection-title">02 <span>Metadata ve işlem</span></h2></div>
          <div className="status" role="status" aria-live="polite"><span className={`status-dot ${busy ? 'busy' : ''}`}/><div><strong>{committing ? 'Dosya yayınlanıyor · İptal edilemez' : busy === 'scan' ? 'Metadata taranıyor…' : busy === 'clean' ? 'Temizleniyor ve doğrulanıyor…' : videoDone ? 'Doğrulandı · Diske kaydedildi' : output ? 'Temizlendi · Çıktı doğrulandı' : scan ? 'Metadata taraması tamamlandı' : error ? 'İşlem tamamlanamadı' : 'Dosya bekleniyor'}</strong><p>Medya ve metadata hiçbir sunucuya gönderilmez.</p></div></div>
            {error && <div className="error" role="alert">{error}</div>}
            {uncertainCommit && <button onClick={() => {
              worker.current?.terminate(); worker.current = null;
              committingRef.current = false; setCommitting(false); clear();
              setError('Disk sonucu belirsiz olarak izleme bırakıldı; bu iptal/geri alma garantisi değildir. Hedefi kontrol edin ve geçici site verilerini temizleyin.');
            }}>Belirsiz sonucu kabul et ve seçimi sıfırla</button>}
          {scan && <><div className="summary-counts"><div><strong>{scan.records.length}</strong><span>Bulunan kayıt</span></div><div><strong>{eligible.length}</strong><span>Temizlenebilir</span></div><div><strong>{preserved}</strong><span>Korunan</span></div></div>{scan.cleaningBlocked ? <p className="warning">Kaynak/imza kaydı mevcut, belirsiz veya yapı güvenle işlenemiyor: tüm temizleme engellendi. C2PA kaldırma ve imza doğrulama desteklenmiyor.</p> : !eligible.length ? <p className="warning">{scan.records.length ? 'Kaldırılabilecek metadata bulunamadı. Renk profili, görüntü yönü veya desteklenmeyen kayıtlar güvenlik için korunuyor.' : 'Desteklenen metadata kaydı bulunamadı; temizlenecek kayıt yok. Bu, tüm metadata’nın yokluğu garantisi değildir.'}</p> : <p className="scan-note">Uygun kayıtlar otomatik temizlenir. Hak/telif bilgisi için gerektiğinde tek onay istenir.</p>}</>}
          <div className="actions"><button className="primary clean-button" onClick={requestClean} disabled={!scan || !!busy || saving || pendingConsent || !eligible.length || !!output || videoDone}>Metadata'yı Temizle</button>{output && <button className="download-button" onClick={download} disabled={!!busy}>Temizlenmiş Dosyayı İndir</button>}<button className="text-button" disabled={committing || cancelling.current && !!busy || !file && !error} onClick={busy ? cancel : clear}>{busy ? 'İptal et' : 'Seçimi kaldır'}</button></div>
          {output && <div className="verification" role="status"><strong>{output.removed} kayıt kaldırıldı</strong><p>{output.retained} teknik kayıt korundu. Çıktı doğrulandı; indirmeye hazır.</p></div>}
          {videoDone && <div className="verification" role="status"><strong>{videoRemoved} kayıt kaldırıldı</strong><p>{Math.max(0, (scan?.records.length ?? 0) - videoRemoved)} teknik kayıt korundu. Temizlenmiş dosya seçtiğiniz konuma kaydedildi; ayrı indirme gerekmez.</p></div>}
          {scan && <details className="metadata"><summary>Detayları göster</summary><p className="scan-note">{scan.width} × {scan.height} · Yön: {scan.orientation ?? 'bilinmiyor'}. Sayılar alan değil metadata bloklarını gösterir. Önizlemeler en fazla 512 karakterdir.</p>{scan.notes.map((note, i) => <p className="warning" key={i}>{note}</p>)}<div className="record-list">{scan.records.map(record => <article className="record" key={record.id}><div className="record-heading"><strong>{record.kind}</strong><span>{eligible.some(item => item.id === record.id) ? record.requiresRightsConsent ? 'Yetki onayıyla' : 'Temizlenebilir' : 'Korunur'} · {record.bytes.toLocaleString('tr-TR')} bayt</span></div><p>{record.reason}</p>{record.preview && <pre>{record.preview}</pre>}</article>)}</div>{output && <details><summary>Payload SHA-256</summary><code>{output.payloadHash}</code></details>}</details>}
          {(scan?.format === 'MP4' || scan?.format === 'MOV') && <details className="output"><summary>Geçici video alanı ve disk sınırları</summary><p>Varsayılan OPFS kotası işlem öncesinde tahmin edilir; tahmin gerçek boş alan garantisi değildir. Kota hatasında veya büyük videolarda ayrı bir yerel klasör seçebilirsiniz. Bu klasöre geçici medya yazılır ve işlem sonunda silinir; çökmede kalabilir. Kaynak ve hedef için ayrı dosyalar kullanın.</p><button disabled={!!busy || saving || committing} onClick={selectTemporaryDirectory}>Geçici yerel klasör seç</button>{temporaryDirectory && <><p>Seçilen klasör: {temporaryDirectory.name}</p><button disabled={!!busy || saving || committing} onClick={() => setTemporaryDirectory(undefined)}>OPFS kullan</button></>}</details>}
        </section>
      </div>
      <footer><p>Dosyanız yalnız tarayıcınızda işlenir. Analitik ve medya yüklemesi yoktur.</p><p>Tüm metadata’nın veya AI izlerinin kaldırılması garanti edilmez. Video kaydı güncel Chrome/Edge gerektirir; geçici yerel dosyalar çökmede kalabilir. Yalnız yetkili olduğunuz dosyalarda kullanın.</p></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
