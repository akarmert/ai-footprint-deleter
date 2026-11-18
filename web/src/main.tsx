import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CleaningMode } from './engine';
import { deriveActions, downloadName, isVideoFormat, videoOutputName } from './app-state';
import { useResultScroll } from './hooks/useResultScroll';
import { useMediaJob } from './hooks/useMediaJob';
import {
  C2paScopeNote,
  CleaningEligibilityNote,
  CleaningPolicyDetails,
  FootprintOperationDetails,
  VideoDiskOptions,
} from './components/AdvancedTools';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import { MetadataResults } from './MetadataResults';
import { Header, Hero, HomeInformation, Footer } from './components/Home';
import { ConsentDialog } from './components/ConsentDialog';
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
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pendingConsent, setPendingConsent] = useState(false);
  const consentTrigger = useRef<HTMLElement | null>(null);
  const focusReturn = useRef<number | undefined>(undefined);
  const [mode, setMode] = useState<CleaningMode>('safe');
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [temporaryDirectory, setTemporaryDirectory] = useState<FileSystemDirectoryHandle>();
  const job = useMediaJob({
    onReset: () => {
      pendingResultScroll.current = undefined;
      setSaving(false);
      setTemporaryDirectory(undefined);
      confirmation.current?.close();
      setPendingConsent(false);
      if (input.current) input.current.value = '';
    },
    onSelected: version => {
      pendingResultScroll.current = { version, interrupted: false };
    },
    resetInput: () => {
      if (input.current) input.current.value = '';
    },
  });
  const {
    file,
    scan,
    output,
    footprintResult,
    error,
    setError,
    busy,
    setBusy,
    committing,
    uncertainCommit,
    videoDone,
    videoRemoved,
    worker,
    videoWorker,
    generation,
    operation,
    cancelling,
    supported,
    clear,
    cancel,
    expire,
    select,
  } = job;
  const resultTarget = useRef<HTMLElement>(null);
  const pendingResultScroll = useResultScroll(resultTarget, generation, !busy && (!!scan || !!error), [
    scan,
    busy,
    error,
  ]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; runs when the dialog closes
  }, [pendingConsent]);
  function changeMode(next: CleaningMode) {
    if (busy || saving || committing || operation.current || output || footprintResult || videoDone) return;
    setMode(next);
  }
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
    job.start({ type: 'clean-all-metadata' });
  }
  function removeC2pa() {
    if (!c2paRemovable || !worker.current || busy || saving || committing || operation.current || output) return;
    job.start({ type: 'clean-c2pa', c2paConsent: true });
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
    job.resetOutput();
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
    job.downloadBlob(output.blob, downloadName(file.name, output));
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
                  <button onClick={job.acceptUncertain}>Belirsiz sonucu kabul et ve seçimi sıfırla</button>
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
