import { scanVideo, videoChunks, verifyVideo } from './video';
import type { VideoScan } from './video';
import type { VideoRequest, VideoResponse } from './protocol';

const scope = self as unknown as { onmessage: (event: MessageEvent<VideoRequest>) => void; postMessage: (value: VideoResponse) => void };
let source: File | undefined;
let scan: VideoScan | undefined;
let busy = false;
let cancelled = false;
let committing = false;
let target: FileSystemWritableFileStream | undefined;
const check = () => { if (cancelled) throw new Error('İşlem iptal edildi; çıktı tamamlanmadı.'); };
scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    if (!committing) cancelled = true;
    if (!busy) { scope.postMessage({ type: 'cancelled' }); self.close(); }
    return;
  }
  if (busy) { scope.postMessage({ type: 'error', message: 'Video Worker meşgul; işlem reddedildi.' }); return; }
  busy = true; cancelled = false;
  let root: FileSystemDirectoryHandle | undefined;
  let temporary: string | undefined;
  let result: VideoResponse | undefined;
  let cleanupWarning = '';
  try {
    if (data.type === 'scan') {
      source = data.file; scan = await scanVideo(source, data.format, check); check();
      result = { type: 'scan', scan };
    } else {
      if (!source || !scan) throw new Error('Önce videoyu yeniden tarayın.');
      if (data.handle.name === source.name) throw new Error('Orijinali korumak için farklı adlı bir çıktı dosyası seçin.');
      if (!data.temporaryDirectory) {
        const estimate = await navigator.storage.estimate(); check();
        if (typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number' || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) throw new Error('Tarayıcı kotası belirlenemedi; geçici yerel klasör seçin.');
        const required = source.size + 1024 * 1024;
        if (estimate.quota - estimate.usage < required) throw new Error(`Tahmini OPFS alanı yetersiz: ${required} bayt gerekli; geçici yerel klasör seçin.`);
      }
      root = data.temporaryDirectory ?? await navigator.storage.getDirectory(); check();
      const candidate = `afc-video-${crypto.randomUUID()}.tmp`;
      try { await root.getFileHandle(candidate); throw new Error('Geçici dosya adı zaten mevcut; işlem başlatılmadı.'); }
      catch (error) { if (!(error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError')) throw error; }
      const stage = await root.getFileHandle(candidate, { create: true });
      let sameEntry: boolean;
      try { sameEntry = await stage.isSameEntry(data.handle); }
      catch (error) { cleanupWarning = `Geçici dosya kimliği doğrulanamadı; silinmedi. Seçilen geçici alandaki ${candidate} dosyasını kontrol edin.`; throw error; }
      if (sameEntry) throw new Error('Geçici dosya ile hedef aynı olamaz.');
      temporary = candidate;
      const staging = await stage.createWritable();
      try {
        for await (const chunk of videoChunks(source, scan, data.ids, data.rightsConsent, check)) { check(); await staging.write(chunk as Uint8Array<ArrayBuffer>); }
        check(); await staging.close();
      } catch (error) { await staging.abort().catch(() => undefined); throw error; }
      const staged = await stage.getFile();
      const verified = await verifyVideo(source, staged, scan, data.ids, data.rightsConsent, check); check();
      target = await data.handle.createWritable();
      for (let position = 0; position < staged.size; position += 1024 * 1024) {
        check();
        await target.write(await staged.slice(position, position + 1024 * 1024).arrayBuffer());
      }
      check();
      // close is the irreversible publication boundary. Do not promise cancellation here.
      committing = true; scope.postMessage({ type: 'committing' });
      await target.close(); target = undefined;
      result = { type: 'video-done', scan: verified, removed: data.ids.length };
    }
  } catch (error) {
    let abortFailed = false;
    if (target) { try { await target.abort(); } catch { abortFailed = true; } }
    target = undefined;
    if (data.type === 'scan') { source = undefined; scan = undefined; }
    result = cancelled && !committing && !abortFailed ? { type: 'cancelled' } : { type: 'error', message: `${committing || abortFailed ? 'Disk işlem sonucu belirsiz; hedef dosyayı kontrol edin. ' : ''}${error && typeof error === 'object' && 'name' in error && error.name === 'QuotaExceededError' ? data.type === 'clean' && data.temporaryDirectory ? 'Depolama alanı yetersiz; seçilen geçici klasörün ve hedef diskin boş alanını kontrol edin. ' : 'Depolama kotası aşıldı; yeniden tarayın, ardından geçici yerel klasör seçip deneyin. Kota tahmini kapasite garantisi değildir. ' : ''}${error instanceof Error ? error.message : 'Video işlemi başarısız.'}` };
  } finally {
    if (root && temporary) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          root.removeEntry(temporary),
          new Promise<never>((_, reject) => { cleanupTimer = setTimeout(() => reject(new Error('cleanup timeout')), 10000); }),
        ]);
      }
      catch { cleanupWarning = data.type === 'clean' && data.temporaryDirectory ? `Geçici medya silinemedi: seçtiğiniz klasördeki ${temporary} dosyasını kontrol edip silin. Hedefin kayıt sonucu değişmez.` : 'Geçici yerel medya dosyası silinemedi. Tarayıcı site verilerini temizleyin; bu işlem hedef dosyanın kayıt sonucunu değiştirmez.'; }
      finally { clearTimeout(cleanupTimer); }
    }
    busy = false; committing = false;
    if (result) scope.postMessage({ ...result, ...(cleanupWarning ? { cleanupWarning } : {}) });
    if (cancelled) self.close();
  }
};
