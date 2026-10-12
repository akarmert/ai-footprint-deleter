import { inspect, type WorkerResult } from './media';
const scope = self as unknown as { onmessage: ((event: MessageEvent<File>) => void) | null; postMessage: (result: WorkerResult) => void };
scope.onmessage = async ({ data }) => {
  try { scope.postMessage({ type: 'result', result: await inspect(data) }); }
  catch { scope.postMessage({ type: 'error', message: 'Dosya başlığı geçersiz, desteklenmiyor veya dosya okunamadı. Metadata taranmadı.' }); }
};
