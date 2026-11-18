import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { validateSelection } from './media';
import type { CleaningMode } from './engine';
import { deriveActions, downloadName, isVideoFormat, videoOutputName } from './app-state';
import { useResultScroll } from './hooks/useResultScroll';
import {
  C2paScopeNote,
  CleaningEligibilityNote,
  CleaningPolicyDetails,
  FootprintOperationDetails,
  VideoDiskOptions,
} from './components/AdvancedTools';
import type { MediaScan, Response, VerifiedOutput, VideoResponse } from './protocol';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import { MetadataResults } from './MetadataResults';
import { Header, Hero, HomeInformation, Footer } from './components/Home';
import { ConsentDialog } from './components/ConsentDialog';
import type { FootprintResult } from './footprints';
import { Atmosphere } from './components/Atmosphere';
import {
  FileDropzone,
  FileDetails,
  CleaningModeSelector,
  ScanStatus,
  ScanSummary,
  VerificationResult,
  FootprintSummary,
  FootprintDetails,
} from './components/Workspace';
import './style.css';

function App() {
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<MediaScan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingConsent, setPendingConsent] = useState(false);
  const [footprintResult, setFootprintResult] = useState<FootprintResult>();
  const operation = useRef<'metadata-consent' | 'clean' | undefined>(undefined);
  const consentTrigger = useRef<HTMLElement | null>(null);
  const focusReturn = useRef<number | undefined>(undefined);
  function finishConsent(kind: 'metadata-consent') {
    if (operation.current === kind) {
      operation.current = undefined;
      focusReturn.current = generation.current;
    }
  }
  function dismissConsent() {
    finishConsent('metadata-consent');
    setPendingConsent(false);
  }
  useEffect(() => {
    if (pendingConsent || focusReturn.current === undefined) return;
    const version = focusReturn.current;
    focusReturn.current = undefined;
    if (generation.current === version && !operation.current && consentTrigger.current?.isConnected)
      consentTrigger.current.focus();
  }, [pendingConsent]);
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
  function revoke() {
    if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
    downloadURL.current = undefined;
  }
  const videoWorker = useRef(false);
  const [videoDone, setVideoDone] = useState(false);
  const [videoRemoved, setVideoRemoved] = useState(0);
  const [saving, setSaving] = useState(false);
  const [temporaryDirectory, setTemporaryDirectory] = useState<FileSystemDirectoryHandle>();
  async function selectTemporaryDirectory() {
    const version = generation.current;
    setSaving(true);
    setError('');
    try {
      const directory = await chooseTemporaryDirectory();
      if (generation.current === version) setTemporaryDirectory(directory);
    } catch (cause) {
      if (generation.current === version)
        setError(cause instanceof Error ? cause.message : 'Geçici klasör seçilemedi.');
    } finally {
      if (generation.current === version) setSaving(false);
    }
  }
  const [committing, setCommitting] = useState(false);
  const [uncertainCommit, setUncertainCommit] = useState(false);
  const cancelling = useRef(false);
  const committingRef = useRef(false);
  const generation = useRef(0);
  const resultTarget = useRef<HTMLElement>(null);
  const pendingResultScroll = useResultScroll(resultTarget, generation, !busy && (!!scan || !!error), [
    scan,
    busy,
    error,
  ]);
  function stop() {
    if (worker.current) {
      if (videoWorker.current) worker.current.postMessage({ type: 'cancel' });
      else worker.current.terminate();
    }
    worker.current = null;
    clearTimeout(timer.current);
  }
  useEffect(
    () => () => {
      stop();
      revoke();
    },
    [],
  );
  function clear() {
    if (committingRef.current) return;
    cancelling.current = false;
    generation.current++;
    pendingResultScroll.current = undefined;
    setVideoDone(false);
    setSaving(false);
    setUncertainCommit(false);
    stop();
    revoke();
    setFile(undefined);
    setTemporaryDirectory(undefined);
    setScan(undefined);
    setOutput(undefined);
    confirmation.current?.close();
    operation.current = undefined;
    setPendingConsent(false);
    setFootprintResult(undefined);
    setBusy('');
    setError('');
    if (input.current) input.current.value = '';
  }
  function cancel() {
    if (committingRef.current) return;
    if (videoWorker.current && worker.current && busy) {
      cancelling.current = true;
      worker.current.postMessage({ type: 'cancel' });
      setError('İptal istendi; disk kapanışı bekleniyor.');
      clearTimeout(timer.current);
      const active = worker.current;
      timer.current = setTimeout(() => {
        if (worker.current !== active || committingRef.current) return;
        active.terminate();
        worker.current = null;
        setBusy('');
        setError(
          'İptal kapanışı zaman aşımına uğradı. Disk sonucu belirsiz; hedefi kontrol edin. Geçici site dosyası kalmış olabilir.',
        );
      }, 10000);
    } else {
      clear();
      setError('İşlem iptal edildi; kaynak ve çıktı bellekten bırakıldı. Yeniden dosya seçin.');
    }
  }
  function expire(active: Worker) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (worker.current !== active || committingRef.current) return;
      if (videoWorker.current) {
        active.postMessage({ type: 'cancel' });
        cancelling.current = true;
        setError('Zaman aşımı; disk kapanışı bekleniyor.');
        timer.current = setTimeout(() => {
          if (worker.current !== active || committingRef.current) return;
          active.terminate();
          worker.current = null;
          setBusy('');
          setError('Disk sonucu belirsiz; hedefi ve geçici site dosyalarını kontrol edin.');
        }, 10000);
      } else {
        clear();
        setError('İşlem zaman aşımına uğradı. Çıktı sunulmadı.');
      }
    }, 120000);
  }
  function select(files: FileList | null) {
    if ((videoWorker.current && busy) || committingRef.current || operation.current === 'metadata-consent') return;
    const list = files ? Array.from(files) : [];
    clear();
    if (!list.length) return;
    if (list.length !== 1) {
      setError('Bir seferde yalnız bir dosya seçin.');
      return;
    }
    const source = list[0];
    try {
      const format = validateSelection(source);
      const video = format === 'MP4' || format === 'MOV';
      videoWorker.current = video;
      if (!supported) throw new Error('Web Workers desteklenmiyor. Güncel bir tarayıcı kullanın.');
      pendingResultScroll.current = { version: generation.current, interrupted: false };
      setFile(source);
      setBusy('scan');
      const active = video
        ? new Worker(new URL('./video.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('./inspect.worker.ts', import.meta.url), { type: 'module' });
      worker.current = active;
      const version = generation.current;
      active.onmessage = ({ data }: MessageEvent<Response | VideoResponse>) => {
        if (worker.current !== active || generation.current !== version) return;
        if (data.type === 'committing') {
          committingRef.current = true;
          setCommitting(true);
          clearTimeout(timer.current);
          setError('Dosya yayınlanıyor; bu aşama iptal edilemez. Sekmeyi kapatmayın.');
          timer.current = setTimeout(() => {
            if (worker.current === active && committingRef.current) {
              setUncertainCommit(true);
              setError(
                'Disk yayınlama hâlâ bekliyor; sonuç belirsiz. Hedef dosyayı kontrol edin. Sekmeyi kapatmak geçici dosya bırakabilir.',
              );
            }
          }, 120000);
          return;
        }
        committingRef.current = false;
        setCommitting(false);
        setUncertainCommit(false);
        cancelling.current = false;
        clearTimeout(timer.current);
        operation.current = undefined;
        setBusy('');
        if ('cleanupWarning' in data && data.cleanupWarning) setError(data.cleanupWarning);
        else if (data.type !== 'error') setError('');
        if (data.type === 'cancelled') {
          clear();
          setError(data.cleanupWarning || 'İşlem iptal edildi; disk yazımı tamamlanmadı.');
          return;
        }
        if (data.type === 'scan') {
          setScan(data.scan);
        } else if (data.type === 'clean') {
          revoke();
          setFootprintResult(undefined);
          setOutput(data.output);
        } else if (data.type === 'clean-footprints') {
          revoke();
          setFootprintResult(data.footprintResult);
          const verified =
            data.footprintResult.status === 'REMOVED_VERIFIED' || data.footprintResult.status === 'PARTIALLY_REMOVED';
          setOutput(verified && data.output ? { ...data.output, footprintResult: data.footprintResult } : undefined);
        } else if (data.type === 'video-done') {
          setVideoRemoved(data.removed);
          setVideoDone(true);
        } else if (data.type === 'error') {
          if (videoWorker.current) {
            active.terminate();
            worker.current = null;
            setScan(undefined);
            if (input.current) input.current.value = '';
          }
          revoke();
          setOutput(undefined);
          setFootprintResult(undefined);
          setError(
            `${data.message}${'cleanupWarning' in data && data.cleanupWarning ? ` ${data.cleanupWarning}` : ''}`,
          );
        }
      };
      const workerFailure = (message: string) => {
        if (worker.current !== active || generation.current !== version) return;
        const videoFailure = videoWorker.current;
        committingRef.current = false;
        setCommitting(false);
        active.terminate();
        clear();
        setError(
          videoFailure
            ? `${message} Disk sonucu belirsiz; hedefi kontrol edin. Geçici site dosyası kalmış olabilir.`
            : `${message} Çıktı sunulmadı.`,
        );
      };
      active.onerror = () => workerFailure('Worker çalıştırılamadı.');
      active.onmessageerror = () => workerFailure('Worker yanıtı okunamadı.');
      expire(active);
      active.postMessage({ type: 'scan', file: source, ...(video ? { format } : {}) });
    } catch (cause) {
      stop();
      setBusy('');
      setError(cause instanceof Error ? cause.message : 'Dosya seçilemedi.');
    }
  }
  const { eligible, needsConsent, c2paRemovable, imageScan, footprintPlan, allMetadataRemovable } = deriveActions(
    scan,
    mode,
  );
  const confirming = pendingConsent;
  function requestAllMetadata() {
    if (
      !allMetadataRemovable ||
      !worker.current ||
      busy ||
      saving ||
      committing ||
      operation.current ||
      output ||
      footprintResult
    )
      return;
    operation.current = 'clean';
    revoke();
    setOutput(undefined);
    setFootprintResult(undefined);
    setError('');
    setBusy('clean');
    expire(worker.current);
    worker.current.postMessage({ type: 'clean-all-metadata' });
  }
  function removeC2pa() {
    if (!c2paRemovable || !worker.current || busy || saving || committing || operation.current || output) return;
    operation.current = 'clean';
    revoke();
    setOutput(undefined);
    setFootprintResult(undefined);
    setVideoDone(false);
    setError('');
    setBusy('clean');
    expire(worker.current);
    worker.current.postMessage({ type: 'clean-c2pa', c2paConsent: true });
  }
  function requestClean() {
    if (!eligible.length || busy || saving || committing || operation.current || output || videoDone) return;
    if (needsConsent) {
      consentTrigger.current = document.activeElement as HTMLElement;
      operation.current = 'metadata-consent';
      setPendingConsent(true);
      confirmation.current?.showModal();
    } else void clean(false);
  }
  async function clean(consent: boolean) {
    if (
      !worker.current ||
      !scan ||
      !eligible.length ||
      scan.cleaningBlocked ||
      saving ||
      busy ||
      committing ||
      output ||
      videoDone
    )
      return;
    if (operation.current && operation.current !== 'metadata-consent') return;
    if (needsConsent && (!consent || operation.current !== 'metadata-consent')) return;
    operation.current = 'clean';
    const selected = eligible.map(record => record.id);
    const active = worker.current,
      version = generation.current;
    revoke();
    setOutput(undefined);
    setFootprintResult(undefined);
    setVideoDone(false);
    setError('');
    try {
      if (isVideoFormat(scan.format)) {
        if (!supportsDiskOutput())
          throw new Error(
            'Video çıktısı için HTTPS üzerinde güncel Chrome/Edge ve doğrudan disk yazımı gerekir. Blob indirme alternatifi yoktur.',
          );
        setSaving(true);
        const handle = await chooseOutput(videoOutputName(file?.name, scan.format));
        if (generation.current !== version || worker.current !== active) return;
        setBusy('clean');
        expire(active);
        active.postMessage({ type: 'clean', ids: selected, rightsConsent: consent, handle, temporaryDirectory });
      } else {
        setBusy('clean');
        expire(active);
        active.postMessage({ type: 'clean', ids: selected, rightsConsent: consent, mode });
      }
    } catch (cause) {
      if (generation.current === version) {
        operation.current = undefined;
        setBusy('');
        setError(cause instanceof Error ? cause.message : 'Çıktı seçilemedi.');
      }
    } finally {
      if (generation.current === version) setSaving(false);
    }
  }
  function download() {
    if (!output || !file || busy) return;
    revoke();
    const url = URL.createObjectURL(output.blob);
    downloadURL.current = url;
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName(file.name, output);
    link.click();
  }
  const displayedScan = output?.scan ?? scan;
  const displayedImageScan = displayedScan && 'footprints' in displayedScan ? displayedScan : undefined;
  const displayedEligible = output ? [] : eligible;
  const preserved = (displayedScan?.records.length ?? 0) - displayedEligible.length;
  return (
    <div className="shell">
      <Atmosphere paused={!!busy || saving || committing} />
      <ConsentDialog dialog={confirmation} mode={mode} dismiss={dismissConsent} confirm={() => void clean(true)} />
      <a className="skip-link" href="#workspace">
        Dosya analizine geç
      </a>
      <Header />
      <main>
        <Hero />
        <div className="workspace" id="workspace" tabIndex={-1}>
          <FileDropzone
            input={input}
            dragging={dragging}
            disabled={!supported || (videoWorker.current && !!busy) || committing || confirming}
            setDragging={setDragging}
            select={select}
          />
          {!supported && (
            <p className="error" role="alert">
              Web Workers desteklenmiyor. Güncel bir tarayıcı kullan.
            </p>
          )}
          {file && <FileDetails file={file} scan={scan} />}
          {(file || error) && (
            <>
              <section
                ref={resultTarget}
                id="footprint-result"
                className="panel inspection-panel"
                aria-labelledby="inspection-title"
              >
                <div className="panel-heading">
                  <h2 id="inspection-title">{videoWorker.current ? 'Video · Gelişmiş Araçlar' : 'Analiz sonucu'}</h2>
                </div>
                {(videoWorker.current || !!busy || !!error) && (
                  <ScanStatus
                    busy={busy}
                    committing={committing}
                    done={videoDone}
                    output={output}
                    scan={scan}
                    error={error}
                    footprintResult={footprintResult}
                  />
                )}
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                {uncertainCommit && (
                  <button
                    onClick={() => {
                      worker.current?.terminate();
                      worker.current = null;
                      committingRef.current = false;
                      setCommitting(false);
                      clear();
                      setError(
                        'Disk sonucu belirsiz olarak izleme bırakıldı; bu iptal/geri alma garantisi değildir. Hedefi kontrol edin ve geçici site verilerini temizleyin.',
                      );
                    }}
                  >
                    Belirsiz sonucu kabul et ve seçimi sıfırla
                  </button>
                )}
                {!videoWorker.current && file && (
                  <>
                    {output && !displayedImageScan ? (
                      <section className="footprint-summary">
                        <h3 id="footprint-title">Gelişmiş işlem çıktısı doğrulandı</h3>
                        <p>
                          Çıktı metadata kayıtları ve bütünlük açısından yeniden tarandı. Bu gelişmiş işlem için yeni AI
                          kaynak analizi sonucu üretilmedi; tüm AI izlerinin kaldırıldığı söylenemez.
                        </p>
                      </section>
                    ) : (
                      <FootprintSummary
                        report={output ? displayedImageScan?.footprints : imageScan?.footprints}
                        plan={output ? displayedImageScan?.footprintPlan : footprintPlan}
                        result={footprintResult}
                        scanning={busy === 'scan'}
                        failed={
                          (!!error && !scan) ||
                          (output ? displayedImageScan : imageScan)?.c2paDecision?.code === 'BLOCKED_MALFORMED_METADATA'
                        }
                      />
                    )}
                    <div className="actions">
                      <button
                        className="primary"
                        id="remove-all-metadata"
                        onClick={requestAllMetadata}
                        aria-describedby="all-metadata-scope-note"
                        disabled={
                          !allMetadataRemovable ||
                          !!busy ||
                          saving ||
                          committing ||
                          confirming ||
                          !!output ||
                          !!footprintResult
                        }
                      >
                        Tüm Metadata'yı Kaldır
                      </button>
                    </div>
                    <p className="scan-note" id="all-metadata-scope-note">
                      AI kaynak kaydı (C2PA) ve AI beyanları dahil EXIF (konum, cihaz, tarih), XMP, IPTC, yorumlar ve
                      PNG metinleri tek seferde silinir; telif/yazar bilgileri de gider. Renk profili (ICC) ve görüntü
                      yönünü taşıyan EXIF görüntünün doğru görünmesi için korunur.
                    </p>
                    <p className="scan-note">
                      Yalnız desteklenen metadata kapsanır; piksel ve görünmez filigran analizi yapılmaz. Kaynak dosya
                      korunur.
                    </p>
                  </>
                )}
                {output?.footprintResult && (
                  <VerificationResult
                    output={output}
                    videoDone={false}
                    videoRemoved={0}
                    total={scan?.records.length ?? 0}
                    download={download}
                  />
                )}
                <div className="actions">
                  <button
                    className="text-button"
                    disabled={committing || confirming || (cancelling.current && !!busy) || (!file && !error)}
                    onClick={busy ? cancel : clear}
                  >
                    {busy ? 'İptal et' : 'Seçimi kaldır'}
                  </button>
                </div>
                {scan && (
                  <details className="metadata" id="advanced-tools" key={generation.current} open={videoWorker.current}>
                    <summary>
                      {videoWorker.current
                        ? 'Gelişmiş Araçlar · Video metadata'
                        : 'Teknik Ayrıntılar ve Gelişmiş Araçlar'}
                    </summary>
                    {!videoWorker.current && (
                      <>
                        <FootprintDetails
                          report={displayedImageScan?.footprints}
                          plan={output ? displayedImageScan?.footprintPlan : footprintPlan}
                        />
                        {!busy && !error && (
                          <ScanStatus
                            busy={busy}
                            committing={committing}
                            done={videoDone}
                            output={output}
                            scan={scan}
                            error={error}
                            footprintResult={footprintResult}
                          />
                        )}
                      </>
                    )}
                    {footprintResult && <FootprintOperationDetails result={footprintResult} />}
                    {!output?.footprintResult && (
                      <VerificationResult
                        output={output}
                        videoDone={videoDone}
                        videoRemoved={videoRemoved}
                        total={scan?.records.length ?? 0}
                        download={download}
                      />
                    )}
                    <h3>{output ? 'Çıktıda kalan metadata kayıtları' : 'Kaynak dosyanın metadata kayıtları'}</h3>
                    {scan && (
                      <>
                        <ScanSummary
                          total={displayedScan?.records.length ?? 0}
                          removable={displayedEligible.length}
                          preserved={preserved}
                        />
                        <CleaningEligibilityNote scan={scan} output={output} eligible={eligible} />
                      </>
                    )}
                    {scan && (
                      <CleaningModeSelector
                        mode={mode}
                        disabled={
                          !!busy || saving || committing || confirming || !!output || !!footprintResult || videoDone
                        }
                        changeMode={changeMode}
                        video={scan.format === 'MP4' || scan.format === 'MOV'}
                      />
                    )}
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={requestClean}
                        disabled={
                          !scan ||
                          !!busy ||
                          saving ||
                          committing ||
                          confirming ||
                          !eligible.length ||
                          !!output ||
                          videoDone
                        }
                      >
                        Metadata'yı Temizle
                      </button>
                      {c2paRemovable && (
                        <button
                          onClick={removeC2pa}
                          disabled={!!busy || saving || committing || confirming || !!output}
                          aria-describedby="c2pa-scope-note"
                        >
                          Yalnız C2PA’yı Kaldır
                        </button>
                      )}
                    </div>
                    {c2paRemovable && <C2paScopeNote />}
                    {scan && file && (
                      <MetadataResults
                        key={`${file.name}:${file.lastModified}:${file.size}:${output ? 'output' : 'source'}`}
                        scan={displayedScan!}
                        origin={output ? 'output' : 'source'}
                        file={
                          output
                            ? new File([output.blob], file.name, {
                                type: output.blob.type,
                                lastModified: file.lastModified,
                              })
                            : file
                        }
                      />
                    )}
                    {scan && (
                      <CleaningPolicyDetails
                        records={displayedScan?.records ?? []}
                        eligible={displayedEligible}
                        output={output}
                      />
                    )}
                    {isVideoFormat(scan?.format) && (
                      <VideoDiskOptions
                        disabled={!!busy || saving || committing}
                        temporaryDirectory={temporaryDirectory}
                        selectTemporaryDirectory={selectTemporaryDirectory}
                        useOpfs={() => setTemporaryDirectory(undefined)}
                      />
                    )}
                  </details>
                )}
              </section>
            </>
          )}
        </div>
        <HomeInformation />
      </main>
      <Footer />
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
