// User-gesture disk handle selection; video publishing is owned by video.worker.ts.
// A user gesture must obtain the handle BEFORE asynchronous processing starts.
interface WritableTarget { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
type SaveHandle = FileSystemFileHandle;
type SaveWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle> };
export function supportsDiskOutput(): boolean {
  return window.isSecureContext && typeof (window as SaveWindow).showSaveFilePicker === 'function' && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
}
export async function chooseOutput(suggestedName: string): Promise<SaveHandle> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (!supportsDiskOutput() || !picker) throw new Error('Doğrudan diske yazma desteklenmiyor.');
  return picker.call(window, { suggestedName });
}
export async function writeOutput(handle: { createWritable(): Promise<WritableTarget> }, chunks: AsyncIterable<Uint8Array>): Promise<void> {
  const target = await handle.createWritable();
  try {
    for await (const chunk of chunks) await target.write(chunk);
    await target.close();
  } catch (error) { await target.abort().catch(() => undefined); throw error; }
}
