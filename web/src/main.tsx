import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection } from './media';
import { isRemovable, type CleaningMode } from './engine';
import type { MediaScan, Response, VerifiedOutput, VideoResponse } from './protocol';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import { MetadataResults } from './MetadataResults';
import { Header, Hero, HomeInformation, Footer } from './components/Home';
import { ConsentDialog } from './components/ConsentDialog';
import { Atmosphere } from './components/Atmosphere';
import { FileDropzone, FileDetails, CleaningModeSelector, ScanStatus, ScanSummary, VerificationResult } from './components/Workspace';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<MediaScan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [mode, setMode] = useState<CleaningMode>('safe');
  function changeMode(next: CleaningMode) {
    if (busy || saving || committing || pendingConsent) return;
    revoke(); setOutput(undefined); setVideoDone(false); setMode(next);
  }
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
  const eligible = scan?.cleaningBlocked ? [] : scan?.records.filter(record => isRemovable(record, scan.format === 'MP4' || scan.format === 'MOV' ? 'safe' : mode)) ?? [];
  const needsConsent = eligible.some(record => record.requiresRightsConsent || record.kind === 'ICC');
  function requestClean() {
    if (!eligible.length || busy || saving || pendingConsent) return;
    if (needsConsent) {
      setPendingConsent(true); confirmation.current?.showModal();
    } else void clean(false);
  }
  async function clean(consent: boolean) {
    if (!worker.current || !scan || !eligible.length || scan.cleaningBlocked || saving || busy) return;
    if (needsConsent && !consent) return;
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
        active.postMessage({ type:'clean', ids:selected, rightsConsent:consent, mode });
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
    <Atmosphere paused={!!busy || saving || committing} />
    <ConsentDialog dialog={confirmation} mode={mode} dismiss={() => setPendingConsent(false)} confirm={() => void clean(true)} />
    <a className="skip-link" href="#workspace">Dosya analizine geç</a>
    <Header />
    <main>
      <Hero />
      <div className="workspace" id="workspace" tabIndex={-1}>
        <FileDropzone input={input} dragging={dragging} disabled={!supported || videoWorker.current && !!busy || committing} setDragging={setDragging} select={select} />
        {!supported && <p className="error" role="alert">Web Workers desteklenmiyor. Güncel bir tarayıcı kullan.</p>}
        {file && <FileDetails file={file} scan={scan} />}
        {(file || error) && <>
        <section className="panel inspection-panel" aria-labelledby="inspection-title"><div className="panel-heading"><h2 id="inspection-title">Metadata ve işlem</h2></div>
          <ScanStatus busy={busy} committing={committing} done={videoDone} output={output} scan={scan} error={error} />
            {error && <div className="error" role="alert">{error}</div>}
            {uncertainCommit && <button onClick={() => {
              worker.current?.terminate(); worker.current = null;
              committingRef.current = false; setCommitting(false); clear();
              setError('Disk sonucu belirsiz olarak izleme bırakıldı; bu iptal/geri alma garantisi değildir. Hedefi kontrol edin ve geçici site verilerini temizleyin.');
            }}>Belirsiz sonucu kabul et ve seçimi sıfırla</button>}
          {scan && <><ScanSummary total={scan.records.length} removable={eligible.length} preserved={preserved} />{scan.cleaningBlocked ? <p className="warning">Kaynak/imza kaydı mevcut, belirsiz veya yapı güvenle işlenemiyor: tüm temizleme engellendi. C2PA kaldırma ve imza doğrulama desteklenmiyor.</p> : !eligible.length ? <p className="warning">{scan.records.length ? 'Kaldırılabilecek metadata bulunamadı. Renk profili, görüntü yönü veya desteklenmeyen kayıtlar güvenlik için korunuyor.' : 'Desteklenen metadata kaydı bulunamadı; temizlenecek kayıt yok. Bu, tüm metadata’nın yokluğu garantisi değildir.'}</p> : <p className="scan-note">Temizlenecek kayıtlar seçilen moda göre belirlenir. Hak/telif bilgisi için gerektiğinde onay istenir.</p>}</>}
          {scan && <CleaningModeSelector mode={mode} disabled={!!busy || saving || committing || pendingConsent} changeMode={changeMode} video={scan.format === 'MP4' || scan.format === 'MOV'} />}
          <div className="actions"><button className="primary" onClick={requestClean} disabled={!scan || !!busy || saving || pendingConsent || !eligible.length || !!output || videoDone}>Metadata'yı Temizle</button><button className="text-button" disabled={committing || cancelling.current && !!busy || !file && !error} onClick={busy ? cancel : clear}>{busy ? 'İptal et' : 'Seçimi kaldır'}</button></div>
          <VerificationResult output={output} videoDone={videoDone} videoRemoved={videoRemoved} total={scan?.records.length ?? 0} download={download} />
          {scan && file && <MetadataResults key={`${file.name}:${file.lastModified}:${file.size}`} scan={scan} file={file} />}
          {scan && <details className="metadata"><summary>Temizleme politikası ve doğrulama ayrıntıları</summary><div>{scan.records.map(record => <article className="record" key={record.id}><div className="record-heading"><strong>{record.kind}</strong><span>{eligible.some(item => item.id === record.id) ? record.requiresRightsConsent ? 'Yetki onayıyla' : 'Temizlenebilir' : 'Korunur'} · {record.bytes.toLocaleString('tr-TR')} bayt</span></div><p>{record.reason}</p>{record.preview && <pre>{record.preview}</pre>}</article>)}</div>{output && <details><summary>Payload SHA-256</summary><code>{output.payloadHash}</code></details>}</details>}
          {(scan?.format === 'MP4' || scan?.format === 'MOV') && <><p className="warning">Video kaydı güncel masaüstü Chrome/Edge, HTTPS (veya localhost), File System Access ve yeterli geçici yerel alan gerektirir. {supportsDiskOutput() ? 'Dosya yeniden doğrulandıktan sonra ayrı hedefe kaydedilir.' : 'Bu tarayıcı doğrudan disk kaydını desteklemiyor; video çıktısı kaydedilemez. Blob indirme alternatifi yoktur.'}</p><details className="output"><summary>Geçici video alanı ve disk sınırları</summary><p>Varsayılan OPFS kotası işlem öncesinde tahmin edilir; tahmin gerçek boş alan garantisi değildir. Kota hatasında veya büyük videolarda ayrı bir yerel klasör seçebilirsiniz. Bu klasöre geçici medya yazılır ve işlem sonunda silinir; çökmede kalabilir. Kaynak ve hedef için ayrı dosyalar kullanın.</p><button disabled={!!busy || saving || committing} onClick={selectTemporaryDirectory}>Geçici yerel klasör seç</button>{temporaryDirectory && <><p>Seçilen klasör: {temporaryDirectory.name}</p><button disabled={!!busy || saving || committing} onClick={() => setTemporaryDirectory(undefined)}>OPFS kullan</button></>}</details></>}
        </section>
        </>}
      </div>
      <HomeInformation />
    </main>
    <Footer />
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
