import { scanImage, cleanImage, cleanC2pa, cleanFootprints } from './engine';
import { validateSelection } from './media';
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
      source = new Uint8Array(await data.file.arrayBuffer());
      const scan = scanImage(source);
      if (scan.format !== format) throw new Error('Dosya uzantısı ve kapsayıcı formatı uyuşmuyor.');
      scope.postMessage({ type: 'scan', scan });
    } else if (data.type === 'clean-footprints') {
      if (!source) throw new Error('Önce görseli yeniden tarayın.');
      const { footprintResult, output } = await cleanFootprints(source, data);
      if (!output) scope.postMessage({ type: 'clean-footprints', footprintResult });
      else {
        const { data: bytes, ...verified } = output;
        const mime = { JPEG:'image/jpeg', PNG:'image/png', WebP:'image/webp' }[output.scan.format];
        scope.postMessage({ type: 'clean-footprints', footprintResult, output: { ...verified, footprintResult, blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }) } });
      }
    } else if (data.type === 'clean' || data.type === 'clean-c2pa') {
      if (!source) throw new Error('Önce görseli yeniden tarayın.');
      if (data.type === 'clean-c2pa' && data.c2paConsent !== true) throw new Error('C2PA kaldırma için açık onay gerekir.');
      if (data.type === 'clean' && data.mode !== 'safe' && data.mode !== 'comprehensive') throw new Error('Geçersiz temizleme modu.');
      const result = data.type === 'clean-c2pa'
        ? await cleanC2pa(source, data.c2paConsent)
        : await cleanImage(source, data.ids, data.rightsConsent, data.mode);
      const mime = { JPEG:'image/jpeg', PNG:'image/png', WebP:'image/webp' }[result.scan.format];
      // Blob owns verified bytes. No full-resolution pixel decode or network operation.
      const blob = new Blob([result.data as Uint8Array<ArrayBuffer>], { type: mime });
      scope.postMessage({ type: 'clean', output: { ...(data.type === 'clean-c2pa' ? { operation: 'c2pa-store-removal' as const } : {}), mode: result.mode, blob, scan: result.scan, removed: result.removed, retained: result.retained, payloadHash: result.payloadHash, checks: result.checks, changedFields: result.changedFields } });
    } else throw new Error('Geçersiz işlem.');
  } catch (error) {
    if (data.type === 'scan') source = undefined;
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Yerel işlem başarısız. Çıktı sunulmadı.' });
  } finally { working = false; }
};
