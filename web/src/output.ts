// User-gesture disk handle selection; video publishing is owned by video.worker.ts.
// A user gesture must obtain the handle BEFORE asynchronous processing starts.
type SaveHandle = FileSystemFileHandle;
type SaveWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle> };
export function supportsDiskOutput(): boolean {
  return (
    window.isSecureContext &&
    typeof (window as SaveWindow).showSaveFilePicker === 'function' &&
    typeof FileSystemFileHandle !== 'undefined' &&
    'createWritable' in FileSystemFileHandle.prototype
  );
}
export async function chooseOutput(suggestedName: string): Promise<SaveHandle> {
  const picker = (window as SaveWindow).showSaveFilePicker;
  if (!supportsDiskOutput() || !picker) throw new Error('Bu tarayıcı dosyayı doğrudan kaydedemiyor.');
  return picker.call(window, { suggestedName });
}
export async function chooseTemporaryDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (
    window as Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  if (!window.isSecureContext || !picker)
    throw new Error('Bu tarayıcı klasör seçmeyi desteklemiyor; masaüstü Chrome veya Edge kullan.');
  return picker.call(window, { mode: 'readwrite' });
}
