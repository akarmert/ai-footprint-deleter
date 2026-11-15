import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection } from './media';
import { isRemovable, type CleaningMode } from './engine';
import type { MediaScan, Response, VerifiedOutput, VideoResponse } from './protocol';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import { MetadataResults } from './MetadataResults';
import { Header, Hero, HomeInformation, Footer } from './components/Home';
import { ConsentDialog, C2paConsentDialog } from './components/ConsentDialog';
import type { FootprintResult } from './footprints';
import { Atmosphere } from './components/Atmosphere';
import { FileDropzone, FileDetails, CleaningModeSelector, ScanStatus, ScanSummary, VerificationResult, FootprintSummary, footprintStatuses, footprintReason } from './components/Workspace';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<MediaScan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingConsent, setPendingConsent] = useState(false);
  const c2paConfirmation = useRef<HTMLDialogElement>(null);
  const [pendingC2paConsent, setPendingC2paConsent] = useState(false);
  const [footprintResult, setFootprintResult] = useState<FootprintResult>();
  const operation = useRef<'metadata-consent' | 'c2pa-consent' | 'clean' | undefined>(undefined);
  const consentTrigger = useRef<HTMLElement | null>(null);
  const focusReturn = useRef<number | undefined>(undefined);
  function finishConsent(kind: 'metadata-consent' | 'c2pa-consent') {
    if (operation.current === kind) { operation.current = undefined; focusReturn.current = generation.current; }
  }
  function dismissConsent() { finishConsent('metadata-consent'); setPendingConsent(false); }
  function dismissC2paConsent() { finishConsent('c2pa-consent'); setPendingC2paConsent(false); }
  useEffect(() => {
    if (pendingConsent || pendingC2paConsent || focusReturn.current === undefined) return;
    const version = focusReturn.current;
    focusReturn.current = undefined;
    if (generation.current === version && !operation.current && consentTrigger.current?.isConnected) consentTrigger.current.focus();
  }, [pendingConsent, pendingC2paConsent]);
  const [mode, setMode] = useState<CleaningMode>('safe');
  function changeMode(next: CleaningMode) {
    if (busy || saving || committing || operation.current || output || footprintResult || videoDone) return;
    setMode(next);
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
  function clear() { if (committingRef.current) return; cancelling.current = false; generation.current++; setVideoDone(false); setSaving(false); setUncertainCommit(false); stop(); revoke(); setFile(undefined); setTemporaryDirectory(undefined); setScan(undefined); setOutput(undefined);  confirmation.current?.close(); c2paConfirmation.current?.close(); operation.current = undefined; setPendingConsent(false); setPendingC2paConsent(false); setFootprintResult(undefined); setBusy(''); setError(''); if (input.current) input.current.value = ''; }
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
    if ((videoWorker.current && busy) || committingRef.current || operation.current === 'metadata-consent' || operation.current === 'c2pa-consent') return;
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
      const version = generation.current;
      active.onmessage = ({ data }: MessageEvent<Response | VideoResponse>) => {
        if (worker.current !== active || generation.current !== version) return;
        if (data.type === 'committing') {
          committingRef.current = true; setCommitting(true); clearTimeout(timer.current);
          setError('Dosya yayınlanıyor; bu aşama iptal edilemez. Sekmeyi kapatmayın.');
          timer.current = setTimeout(() => {
            if (worker.current === active && committingRef.current) { setUncertainCommit(true); setError('Disk yayınlama hâlâ bekliyor; sonuç belirsiz. Hedef dosyayı kontrol edin. Sekmeyi kapatmak geçici dosya bırakabilir.'); }
          }, 120000);
          return;
        }
        committingRef.current = false; setCommitting(false); setUncertainCommit(false); cancelling.current = false;
        clearTimeout(timer.current); operation.current = undefined; setBusy('');
        if ('cleanupWarning' in data && data.cleanupWarning) setError(data.cleanupWarning);
        else if (data.type !== 'error') setError('');
        if (data.type === 'cancelled') { clear(); setError(data.cleanupWarning || 'İşlem iptal edildi; disk yazımı tamamlanmadı.'); return; }
        if (data.type === 'scan') { setScan(data.scan);  }
        else if (data.type === 'clean') { revoke(); setFootprintResult(undefined); setOutput(data.output); }
        else if (data.type === 'clean-footprints') {
          revoke(); setFootprintResult(data.footprintResult);
          const verified = data.footprintResult.status === 'REMOVED_VERIFIED' || data.footprintResult.status === 'PARTIALLY_REMOVED';
          setOutput(verified && data.output ? { ...data.output, footprintResult: data.footprintResult } : undefined);
        }
        else if (data.type === 'video-done') { setVideoRemoved(data.removed); setVideoDone(true); }
        else if (data.type === 'error') { if (videoWorker.current) { active.terminate(); worker.current = null; setScan(undefined);  if (input.current) input.current.value = ''; } revoke(); setOutput(undefined); setFootprintResult(undefined); setError(`${data.message}${'cleanupWarning' in data && data.cleanupWarning ? ` ${data.cleanupWarning}` : ''}`); }
      };
      const workerFailure = (message: string) => {
        if (worker.current !== active || generation.current !== version) return;
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
  const c2paRemovable = !!scan && (scan.format === 'JPEG' || scan.format === 'PNG' || scan.format === 'WebP') && scan.c2paRemovable === true;
  const imageScan = scan && 'footprintPlan' in scan ? scan : undefined;
  const footprintPlan = imageScan?.footprintPlan;
  const confirming = pendingConsent || pendingC2paConsent;
  const directMetadataIds = footprintPlan?.metadataIds.filter(id => !imageScan?.records.find(record => record.id === id)?.requiresRightsConsent) ?? [];
  const directRemovable = !!footprintPlan && !footprintPlan.blocked && (footprintPlan.removeC2pa || directMetadataIds.length > 0);
  function requestFootprints() {
    if (!directRemovable || !worker.current || busy || saving || committing || operation.current || output || footprintResult) return;
    operation.current = 'clean';
    revoke(); setOutput(undefined); setFootprintResult(undefined); setError(''); setBusy('clean'); expire(worker.current);
    worker.current.postMessage({ type: 'clean-footprints', c2paConsent: true, rightsConsent: false });
  }
  function requestC2paRemoval() {
    if (!c2paRemovable || !worker.current || busy || saving || committing || operation.current || output) return;
    consentTrigger.current = document.activeElement as HTMLElement;
    operation.current = 'c2pa-consent';
    setPendingC2paConsent(true); c2paConfirmation.current?.showModal();
  }
  function removeC2pa() {
    if (operation.current !== 'c2pa-consent' || !c2paRemovable || !worker.current || busy || saving || committing || output) return;
    operation.current = 'clean';
    revoke(); setOutput(undefined); setFootprintResult(undefined); setVideoDone(false); setError(''); setBusy('clean'); expire(worker.current);
    worker.current.postMessage({ type: 'clean-c2pa', c2paConsent: true });
  }
  function requestClean() {
    if (!eligible.length || busy || saving || committing || operation.current || output || videoDone) return;
    if (needsConsent) {
      consentTrigger.current = document.activeElement as HTMLElement;
      operation.current = 'metadata-consent';
      setPendingConsent(true); confirmation.current?.showModal();
    } else void clean(false);
  }
  async function clean(consent: boolean) {
    if (!worker.current || !scan || !eligible.length || scan.cleaningBlocked || saving || busy || committing || output || videoDone) return;
    if (operation.current && operation.current !== 'metadata-consent') return;
    if (needsConsent && (!consent || operation.current !== 'metadata-consent')) return;
    operation.current = 'clean';
    const selected = eligible.map(record => record.id);
    const active = worker.current, version = generation.current;
    revoke(); setOutput(undefined); setFootprintResult(undefined); setVideoDone(false); setError('');
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
      if (generation.current === version) { operation.current = undefined; setBusy(''); setError(cause instanceof Error ? cause.message : 'Çıktı seçilemedi.'); }
    } finally { if (generation.current === version) setSaving(false); }
  }
  function download() {
    if (!output || !file || busy) return;
    revoke(); const url = URL.createObjectURL(output.blob); downloadURL.current = url;
    const link = document.createElement('a'); link.href = url;
    const base = file.name.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0,120) || 'gorsel';
    const originalExtension = file.name.match(/\.(jpe?g|png|webp)$/i)?.[1];
    const extension = output.footprintResult && originalExtension ? originalExtension : output.scan.format === 'JPEG' ? 'jpg' : output.scan.format.toLowerCase();
    link.download = `${base}-${output.footprintResult ? 'removed' : output.operation === 'c2pa-store-removal' ? 'c2pa-kaldirildi' : 'temiz'}.${extension}`;
    link.click();
  }
  const displayedScan = output?.scan ?? scan;
  const displayedImageScan = displayedScan && 'footprints' in displayedScan ? displayedScan : undefined;
  const displayedEligible = output ? [] : eligible;
  const preserved = (displayedScan?.records.length ?? 0) - displayedEligible.length;
  return <div className="shell">
    <Atmosphere paused={!!busy || saving || committing} />
    <ConsentDialog dialog={confirmation} mode={mode} dismiss={dismissConsent} confirm={() => void clean(true)} />
    <C2paConsentDialog dialog={c2paConfirmation} dismiss={dismissC2paConsent} confirm={removeC2pa} />
    <a className="skip-link" href="#workspace">Dosya analizine geç</a>
    <Header />
    <main>
      <Hero />
      <div className="workspace" id="workspace" tabIndex={-1}>
        <FileDropzone input={input} dragging={dragging} disabled={!supported || videoWorker.current && !!busy || committing || confirming} setDragging={setDragging} select={select} />
        {!supported && <p className="error" role="alert">Web Workers desteklenmiyor. Güncel bir tarayıcı kullan.</p>}
        {file && <FileDetails file={file} scan={scan} />}
        {(file || error) && <>
        <section className="panel inspection-panel" aria-labelledby="inspection-title"><div className="panel-heading"><h2 id="inspection-title">{videoWorker.current ? 'Video · Gelişmiş Araçlar' : 'AI Ayak İzi'}</h2></div>
          <ScanStatus busy={busy} committing={committing} done={videoDone} output={output} scan={scan} error={error} footprintResult={footprintResult} />
            {error && <div className="error" role="alert">{error}</div>}
            {uncertainCommit && <button onClick={() => {
              worker.current?.terminate(); worker.current = null;
              committingRef.current = false; setCommitting(false); clear();
              setError('Disk sonucu belirsiz olarak izleme bırakıldı; bu iptal/geri alma garantisi değildir. Hedefi kontrol edin ve geçici site verilerini temizleyin.');
            }}>Belirsiz sonucu kabul et ve seçimi sıfırla</button>}
          {!videoWorker.current && file && <>{output && !displayedImageScan ? <section className="footprint-summary"><h3 id="footprint-title">Gelişmiş işlem çıktısı doğrulandı</h3><p>Çıktı metadata kayıtları ve bütünlük açısından yeniden tarandı. Bu gelişmiş işlem için yeni AI kaynak analizi sonucu üretilmedi; tüm AI izlerinin kaldırıldığı söylenemez.</p></section> : <FootprintSummary report={output ? displayedImageScan?.footprints : imageScan?.footprints} plan={output ? displayedImageScan?.footprintPlan : footprintPlan} result={footprintResult} />}<div className="actions"><button className="primary" id="remove-footprints" onClick={requestFootprints} disabled={!directRemovable || !!busy || saving || committing || confirming || !!output || !!footprintResult}>Remove AI Footprint</button></div><p className="scan-note">Remove, desteklenen gömülü C2PA kaynak kayıtlarını ve güvenle ayrılabilen AI metadata'sını kaldırır. Kaynak dosya korunur.</p><p className="scan-note">Ayrı hak/telif izni gerektiren bağımsız metadata kayıtları korunur. Bu kayıtlar için Teknik Ayrıntılar ve Gelişmiş Araçlar bölümündeki onaylı metadata temizliğini kullanabilirsin.</p></>}
          {output?.footprintResult && <VerificationResult output={output} videoDone={false} videoRemoved={0} total={scan?.records.length ?? 0} download={download} />}
          <div className="actions"><button className="text-button" disabled={committing || confirming || cancelling.current && !!busy || !file && !error} onClick={busy ? cancel : clear}>{busy ? 'İptal et' : 'Seçimi kaldır'}</button></div>
          {scan && <details className="metadata" id="advanced-tools" key={generation.current} open={videoWorker.current}><summary>{videoWorker.current ? 'Gelişmiş Araçlar · Video metadata' : 'Teknik Ayrıntılar ve Gelişmiş Araçlar'}</summary>
          {footprintResult && <section aria-label="AI ayak izi işlem ayrıntıları"><h3>İşlem sonucu ve kalan kayıtlar</h3><p>{footprintStatuses[footprintResult.status]} · {footprintReason(footprintResult)}</p>{(footprintResult.after ?? footprintResult.before).evidence.map((item, index) => <article className="record" key={index}><strong>{item.category === 'explicit-ai' ? 'AI beyanı · Doğrulanmamış' : item.category === 'metadata-hint' ? 'Metadata ipucu' : 'Kaynak geçmişi'}</strong><pre>{item.source}</pre></article>)}</section>}
           {!output?.footprintResult && <VerificationResult output={output} videoDone={videoDone} videoRemoved={videoRemoved} total={scan?.records.length ?? 0} download={download} />}
           <h3>{output ? 'Çıktıda kalan metadata kayıtları' : 'Kaynak dosyanın metadata kayıtları'}</h3>
          {scan && <><ScanSummary total={displayedScan?.records.length ?? 0} removable={displayedEligible.length} preserved={preserved} />{output ? <p className="scan-note">Bu liste yeniden taranan çıktıda korunan kayıtları gösterir; temizleme seçenekleri kaynak dosyaya aittir.</p> : scan.cleaningBlocked ? <p className="warning">Kaynak/imza kaydı mevcut, belirsiz veya yapı güvenle işlenemiyor: metadata temizliği engellendi. Yalnız desteklenen gömülü C2PA deposu için ayrı kaldırma düğmesi sunulur. İmza doğrulama yapılmaz.</p> : !eligible.length ? <p className="warning">{scan.records.length ? 'Kaldırılabilecek metadata bulunamadı. Renk profili, görüntü yönü veya desteklenmeyen kayıtlar güvenlik için korunuyor.' : 'Desteklenen metadata kaydı bulunamadı; temizlenecek kayıt yok. Bu, tüm metadata’nın yokluğu garantisi değildir.'}</p> : <p className="scan-note">Temizlenecek kayıtlar seçilen moda göre belirlenir. Hak/telif bilgisi için gerektiğinde onay istenir.</p>}</>}
          {scan && <CleaningModeSelector mode={mode} disabled={!!busy || saving || committing || confirming || !!output || !!footprintResult || videoDone} changeMode={changeMode} video={scan.format === 'MP4' || scan.format === 'MOV'} />}
          <div className="actions"><button className="primary" onClick={requestClean} disabled={!scan || !!busy || saving || committing || confirming || !eligible.length || !!output || videoDone}>Metadata'yı Temizle</button>{c2paRemovable && <button onClick={requestC2paRemoval} disabled={!!busy || saving || committing || confirming || !!output}>Yalnız C2PA’yı Kaldır</button>}</div>
          {scan && file && <MetadataResults key={`${file.name}:${file.lastModified}:${file.size}:${output ? 'output' : 'source'}`} scan={displayedScan!} origin={output ? 'output' : 'source'} file={output ? new File([output.blob], file.name, { type: output.blob.type, lastModified: file.lastModified }) : file} />}
          {scan && <details className="metadata"><summary>Temizleme politikası ve doğrulama ayrıntıları</summary><div>{displayedScan?.records.map(record => <article className="record" key={record.id}><div className="record-heading"><strong>{record.kind}</strong><span>{displayedEligible.some(item => item.id === record.id) ? record.requiresRightsConsent ? 'Yetki onayıyla' : 'Temizlenebilir' : 'Korunur'} · {record.bytes.toLocaleString('tr-TR')} bayt</span></div><p>{record.reason}</p>{record.preview && <pre>{record.preview}</pre>}</article>)}</div>{output && <details><summary>Payload SHA-256</summary><code>{output.payloadHash}</code></details>}</details>}
          {(scan?.format === 'MP4' || scan?.format === 'MOV') && <><p className="warning">Video kaydı güncel masaüstü Chrome/Edge, HTTPS (veya localhost), File System Access ve yeterli geçici yerel alan gerektirir. {supportsDiskOutput() ? 'Dosya yeniden doğrulandıktan sonra ayrı hedefe kaydedilir.' : 'Bu tarayıcı doğrudan disk kaydını desteklemiyor; video çıktısı kaydedilemez. Blob indirme alternatifi yoktur.'}</p><details className="output"><summary>Geçici video alanı ve disk sınırları</summary><p>Varsayılan OPFS kotası işlem öncesinde tahmin edilir; tahmin gerçek boş alan garantisi değildir. Kota hatasında veya büyük videolarda ayrı bir yerel klasör seçebilirsiniz. Bu klasöre geçici medya yazılır ve işlem sonunda silinir; çökmede kalabilir. Kaynak ve hedef için ayrı dosyalar kullanın.</p><button disabled={!!busy || saving || committing} onClick={selectTemporaryDirectory}>Geçici yerel klasör seç</button>{temporaryDirectory && <><p>Seçilen klasör: {temporaryDirectory.name}</p><button disabled={!!busy || saving || committing} onClick={() => setTemporaryDirectory(undefined)}>OPFS kullan</button></>}</details></>}
          </details>}
        </section>
        </>}
      </div>
      <HomeInformation />
    </main>
    <Footer />
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
