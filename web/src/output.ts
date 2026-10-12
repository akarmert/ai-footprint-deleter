// Phase 2/3 output contract. Not invoked until a verified cleaning engine exists.
// A user gesture must obtain the handle BEFORE asynchronous processing starts.
interface WritableTarget { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }
interface SaveHandle { createWritable(): Promise<WritableTarget> }
type SaveWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle> };
export function supportsDiskOutput(): boolean {
  return window.isSecureContext && typeof (window as SaveWindow).showSaveFilePicker === 'function' && typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
}
export async function chooseOutput(suggestedName: string): Promise<SaveHandle> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (!supportsDiskOutput() || !picker) throw new Error('Doğrudan diske yazma desteklenmiyor.');
  return picker.call(window, { suggestedName });
}
export async function writeOutput(handle: SaveHandle, chunks: AsyncIterable<Uint8Array>): Promise<void> {
  const target = await handle.createWritable();
  try {
    for await (const chunk of chunks) await target.write(chunk);
    await target.close();
  } catch (error) { await target.abort().catch(() => undefined); throw error; }
}
