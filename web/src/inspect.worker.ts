import { scanImage, cleanImage } from './engine';
import { IMAGE_LIMIT, validateSelection } from './media';
import type { Request, Response } from './protocol';
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (result: Response) => void };
let source: Uint8Array | undefined;
let working = false;
scope.onmessage = async ({ data }) => {
  if (working) return;
  working = true;
  try {
    if (data.type === 'scan') {
      source = undefined;
      const format = validateSelection(data.file);
      if (format === 'MP4' || format === 'MOV') throw new Error('Video işleme Faz 2 kapsamında değil. JPEG, PNG veya WebP seçin.');
      if (data.file.size > IMAGE_LIMIT) throw new Error('Görsel sınırı 128 MiB.');
      source = new Uint8Array(await data.file.arrayBuffer());
      const scan = scanImage(source);
      if (scan.format !== format) throw new Error('Dosya uzantısı ve kapsayıcı formatı uyuşmuyor.');
      scope.postMessage({ type: 'scan', scan });
    } else if (data.type === 'clean') {
      if (!source) throw new Error('Önce görseli yeniden tarayın.');
      const result = await cleanImage(source, data.ids, data.rightsConsent);
      const mime = { JPEG:'image/jpeg', PNG:'image/png', WebP:'image/webp' }[result.scan.format];
      // Blob owns verified bytes. No full-resolution pixel decode or network operation.
      const blob = new Blob([result.data as Uint8Array<ArrayBuffer>], { type: mime });
      scope.postMessage({ type: 'clean', output: { blob, scan: result.scan, removed: result.removed, retained: result.retained, payloadHash: result.payloadHash, checks: result.checks } });
    } else throw new Error('Geçersiz işlem.');
  } catch (error) {
    if (data.type === 'scan') source = undefined;
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Yerel işlem başarısız. Çıktı sunulmadı.' });
  } finally { working = false; }
};
