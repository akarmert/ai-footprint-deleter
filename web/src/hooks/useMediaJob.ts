import { useEffect, useRef, useState } from 'react';
import { validateSelection } from '../media';
import type { FootprintResult } from '../footprints';
import type { MediaScan, Request, Response, VerifiedOutput, VideoResponse } from '../protocol';

export type Busy = '' | 'scan' | 'clean';
export type Operation = 'metadata-consent' | 'clean' | undefined;

/** App-owned state that must be reset together with the job (consent dialog, file input, ...). */
export type JobCallbacks = {
  /** Called synchronously inside every reset of the selection. */
  onReset: () => void;
  /** Called after a file was accepted for scanning, with the new selection generation. */
  onSelected: (version: number) => void;
  /** Clears only the file input (video Worker error keeps the rest of the selection state). */
  resetInput: () => void;
};

/**
 * Owns one media job: the image or video Worker, its message handling, the 120 s operation and
 * 10 s cancel-close timers, the non-cancellable disk commit phase, selection generations and the
 * verified output's object URL. Logic moved unchanged from App; App keeps consent, mode and the
 * video save target.
 */
export function useMediaJob(callbacks: JobCallbacks) {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const [file, setFile] = useState<File>();
  const [scan, setScan] = useState<MediaScan>();
  const [output, setOutput] = useState<VerifiedOutput>();
  const [footprintResult, setFootprintResult] = useState<FootprintResult>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Busy>('');
  const [videoDone, setVideoDone] = useState(false);
  const [videoRemoved, setVideoRemoved] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [uncertainCommit, setUncertainCommit] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const downloadURL = useRef<string | undefined>(undefined);
  const videoWorker = useRef(false);
  const cancelling = useRef(false);
  const committingRef = useRef(false);
  const generation = useRef(0);
  const operation = useRef<Operation>(undefined);
  const supported = typeof Worker !== 'undefined';

  function revoke() {
    if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
    downloadURL.current = undefined;
  }
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
    setVideoDone(false);
    setUncertainCommit(false);
    stop();
    revoke();
    setFile(undefined);
    setScan(undefined);
    setOutput(undefined);
    operation.current = undefined;
    setFootprintResult(undefined);
    setBusy('');
    setError('');
    callbacksRef.current.onReset();
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
      callbacksRef.current.onSelected(generation.current);
      setFile(source);
      setBusy('scan');
      const active = video
        ? new Worker(new URL('../video.worker.ts', import.meta.url), { type: 'module' })
        : new Worker(new URL('../inspect.worker.ts', import.meta.url), { type: 'module' });
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
            callbacksRef.current.resetInput();
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
  /** Clears any previous output before a new image operation starts. */
  function resetOutput() {
    revoke();
    setOutput(undefined);
    setFootprintResult(undefined);
    setVideoDone(false);
    setError('');
  }
  /** Starts a one-shot image operation on the current Worker (caller has checked eligibility). */
  function start(request: Request) {
    if (!worker.current) return;
    operation.current = 'clean';
    resetOutput();
    setBusy('clean');
    expire(worker.current);
    worker.current.postMessage(request);
  }
  /** User gave up on an uncertain disk commit: stop watching and reset. Not a rollback. */
  function acceptUncertain() {
    worker.current?.terminate();
    worker.current = null;
    committingRef.current = false;
    setCommitting(false);
    clear();
    setError(
      'Disk sonucu belirsiz olarak izleme bırakıldı; bu iptal/geri alma garantisi değildir. Hedefi kontrol edin ve geçici site verilerini temizleyin.',
    );
  }
  /** Offers the verified output under `name`; the previous object URL is revoked. */
  function downloadBlob(blob: Blob, name: string) {
    revoke();
    const url = URL.createObjectURL(blob);
    downloadURL.current = url;
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
  }
  return {
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
    start,
    resetOutput,
    acceptUncertain,
    downloadBlob,
  };
}
