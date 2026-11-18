import { scanImage, cleanAllMetadata } from './engine';
import { validateSelection } from './media';
import type { Request, Response } from './protocol';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (result: Response) => void;
};
const MIME = { JPEG: 'image/jpeg', PNG: 'image/png', WebP: 'image/webp' } as const;
let source: Uint8Array | undefined;
let working = false;

scope.onmessage = async ({ data }) => {
  if (working) return;
  working = true;
  try {
    if (data.type === 'scan') {
      source = undefined;
      const format = validateSelection(data.file);
      if (format === 'MP4' || format === 'MOV') throw new Error('Video dosyaları bu işleyiciyle taranmaz.');
      source = new Uint8Array(await data.file.arrayBuffer());
      let scan;
      try {
        scan = scanImage(source);
      } catch (cause) {
        // Parser messages are technical; keep them only as a parenthesised detail.
        const detail = cause instanceof Error ? ` (${cause.message})` : '';
        throw new Error(`Bu dosya okunamadı ya da yapısı desteklenmiyor${detail}.`, { cause });
      }
      if (scan.format !== format) throw new Error('Dosya uzantısı ile dosyanın gerçek biçimi uyuşmuyor.');
      scope.postMessage({ type: 'scan', scan });
    } else if (data.type === 'clean-all-metadata') {
      if (!source) throw new Error('Önce görseli yeniden seçin.');
      const { footprintResult, output } = await cleanAllMetadata(source);
      if (!output) {
        scope.postMessage({ type: 'cleaned', footprintResult });
        return;
      }
      // The Blob owns the verified bytes; no pixel decode or network request happens here.
      const { data: bytes, ...verified } = output;
      scope.postMessage({
        type: 'cleaned',
        footprintResult,
        output: {
          ...verified,
          footprintResult,
          blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[output.scan.format] }),
        },
      });
    } else throw new Error('Geçersiz işlem.');
  } catch (error) {
    if (data.type === 'scan') source = undefined;
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'İşlem tamamlanamadı; çıktı verilmedi.',
    });
  } finally {
    working = false;
  }
};
