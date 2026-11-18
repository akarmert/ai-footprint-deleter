import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { deriveActions, downloadName, isVideoFormat, videoOutputName } from './app-state';
import { useResultScroll } from './hooks/useResultScroll';
import { useMediaJob } from './hooks/useMediaJob';
import { FootprintOperationDetails, RecordList, VideoDiskOptions } from './components/AdvancedTools';
import { chooseOutput, chooseTemporaryDirectory, supportsDiskOutput } from './output';
import { MetadataResults } from './MetadataResults';
import { Header, Hero, HomeInformation, Footer } from './components/Home';
import { Atmosphere } from './components/Atmosphere';
import {
  FileDropzone,
  FileDetails,
  ScanStatus,
  ScanSummary,
  VerificationResult,
  FootprintSummary,
  FootprintDetails,
} from './components/Workspace';
import './style.css';

function App() {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [temporaryDirectory, setTemporaryDirectory] = useState<FileSystemDirectoryHandle>();
  const job = useMediaJob({
    onReset: () => {
      pendingResultScroll.current = undefined;
      setSaving(false);
      setTemporaryDirectory(undefined);
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
  const { imageScan, footprintPlan, removable, canRemoveAll } = deriveActions(scan);
  const video = videoWorker.current;
  const finished = !!output || !!footprintResult || videoDone;

  async function selectTemporaryDirectory() {
    const version = generation.current;
    setSaving(true);
    setError('');
    try {
      const directory = await chooseTemporaryDirectory();
      if (generation.current === version) setTemporaryDirectory(directory);
    } catch (cause) {
      if (generation.current === version) setError(cause instanceof Error ? cause.message : 'Klasör seçilemedi.');
    } finally {
      if (generation.current === version) setSaving(false);
    }
  }

  async function removeAll() {
    if (!canRemoveAll || !worker.current || !scan || busy || saving || committing || operation.current || finished)
      return;
    if (!isVideoFormat(scan.format)) {
      job.start({ type: 'clean-all-metadata' });
      return;
    }
    operation.current = 'clean';
    const active = worker.current,
      version = generation.current;
    job.resetOutput();
    try {
      if (!supportsDiskOutput()) throw new Error('Video kaydı için masaüstü Chrome veya Edge gerekir.');
      setSaving(true);
      const handle = await chooseOutput(videoOutputName(file?.name, scan.format));
      if (generation.current !== version || worker.current !== active) return;
      setBusy('clean');
      expire(active);
      const ids = removable.map(record => record.id);
      active.postMessage({ type: 'clean', ids, rightsConsent: true, handle, temporaryDirectory });
    } catch (cause) {
      if (generation.current === version) {
        operation.current = undefined;
        setBusy('');
        setError(cause instanceof Error ? cause.message : 'Kayıt yeri seçilemedi.');
      }
    } finally {
      if (generation.current === version) setSaving(false);
    }
  }

  function download() {
    if (!output || !file || busy) return;
    job.downloadBlob(output.blob, downloadName(file.name, output.scan.format));
  }

  const displayedScan = output?.scan ?? scan;
  const displayedImageScan = displayedScan && 'footprints' in displayedScan ? displayedScan : undefined;
  return (
    <div className="shell">
      <Atmosphere paused={!!busy || saving || committing} />
      <a className="skip-link" href="#workspace">
        Dosya seçimine geç
      </a>
      <Header />
      <main>
        <Hero />
        <div className="workspace" id="workspace" tabIndex={-1}>
          <FileDropzone
            input={input}
            dragging={dragging}
            disabled={!supported || (video && !!busy) || committing}
            setDragging={setDragging}
            select={select}
          />
          {!supported && (
            <p className="error" role="alert">
              Bu tarayıcı desteklenmiyor. Güncel bir tarayıcı kullan.
            </p>
          )}
          {file && <FileDetails file={file} scan={scan} />}
          {(file || error) && (
            <section
              ref={resultTarget}
              id="footprint-result"
              className="panel inspection-panel"
              aria-labelledby="inspection-title"
            >
              <div className="panel-heading">
                <h2 id="inspection-title">Analiz sonucu</h2>
              </div>
              {(video || !!busy || !!error) && (
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
              {uncertainCommit && <button onClick={job.acceptUncertain}>Sonucu bekleme ve seçimi sıfırla</button>}
              {!video && file && (
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
              {scan && (
                <>
                  <div className="actions">
                    <button
                      className="primary"
                      id="remove-all-metadata"
                      onClick={() => void removeAll()}
                      aria-describedby="all-metadata-scope-note"
                      disabled={!canRemoveAll || !!busy || saving || committing || finished}
                    >
                      Tüm Metadata'yı Kaldır
                    </button>
                  </div>
                  <p className="scan-note" id="all-metadata-scope-note">
                    {video
                      ? 'Videodaki başlık, tarih, konum, cihaz ve telif gibi metadata alanları boşaltılır; görüntü ve ses verisine dokunulmaz.'
                      : 'C2PA kaynak kaydı, AI beyanları ve EXIF (konum, cihaz, tarih), XMP, IPTC, yorum ve PNG metinleri tek seferde silinir; telif ve yazar bilgileri de gider. Renk profili ve görüntü yönü korunur.'}
                  </p>
                  {video && (
                    <VideoDiskOptions
                      disabled={!!busy || saving || committing}
                      temporaryDirectory={temporaryDirectory}
                      selectTemporaryDirectory={selectTemporaryDirectory}
                      useOpfs={() => setTemporaryDirectory(undefined)}
                    />
                  )}
                </>
              )}
              <VerificationResult
                output={output}
                videoDone={videoDone}
                videoRemoved={videoRemoved}
                download={download}
              />
              <div className="actions">
                <button
                  className="text-button"
                  disabled={committing || (cancelling.current && !!busy) || (!file && !error)}
                  onClick={busy ? cancel : clear}
                >
                  {busy ? 'İptal et' : 'Seçimi kaldır'}
                </button>
              </div>
              {scan && file && displayedScan && (
                <details className="metadata" id="advanced-tools" key={generation.current}>
                  <summary>Ayrıntılar</summary>
                  {!video && <FootprintDetails plan={output ? displayedImageScan?.footprintPlan : footprintPlan} />}
                  {footprintResult && <FootprintOperationDetails result={footprintResult} />}
                  <h3>{output ? 'Çıktıda kalan metadata' : 'Dosyadaki metadata'}</h3>
                  <ScanSummary total={displayedScan.records.length} removable={output ? 0 : removable.length} />
                  <MetadataResults
                    key={`${file.name}:${file.lastModified}:${file.size}:${output ? 'output' : 'source'}`}
                    scan={displayedScan}
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
                  <RecordList records={displayedScan.records} removable={output ? [] : removable} output={output} />
                </details>
              )}
            </section>
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
