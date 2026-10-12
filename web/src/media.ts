export const VIDEO_LIMIT = 1_000_000_000; // 1 GB, decimal; not 1 GiB
export const IMAGE_LIMIT = 128 * 1024 * 1024;
export const READ_CHUNK = 64 * 1024;
export type Format = 'JPEG' | 'PNG' | 'WebP' | 'MP4' | 'MOV';
export interface Inspection { format: Format; bytesRead: number; scope: 'header-only' }
export type WorkerResult = { type: 'result'; result: Inspection } | { type: 'error'; message: string };
const extensions: Record<string, Format> = { jpg: 'JPEG', jpeg: 'JPEG', png: 'PNG', webp: 'WebP', mp4: 'MP4', mov: 'MOV' };
export function validateSelection(file: Pick<File, 'name' | 'size'>): Format {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const format = Object.hasOwn(extensions, extension) ? extensions[extension] : undefined;
  if (!format) throw new Error('Desteklenmeyen format. JPEG, PNG, WebP, MP4 veya MOV seçin.');
  if (file.size === 0) throw new Error('Boş dosya açılamaz.');
  const video = format === 'MP4' || format === 'MOV';
  if (file.size > (video ? VIDEO_LIMIT : IMAGE_LIMIT)) throw new Error(video ? 'Video sınırı 1 GB (1.000.000.000 bayt).' : 'Görsel sınırı 128 MiB.');
  return format;
}
export async function readRange(blob: Blob, start: number, length: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 0 || length > READ_CHUNK) throw new Error('Geçersiz okuma aralığı.');
  return new Uint8Array(await blob.slice(start, Math.min(start + length, blob.size)).arrayBuffer());
}
// Future engines can consume bounded chunks with backpressure; never collect the iterator into an array.
export async function* readChunks(blob: Blob): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < blob.size; offset += READ_CHUNK) yield await readRange(blob, offset, READ_CHUNK);
}
export function detectHeader(bytes: Uint8Array, expected: Format): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (expected === 'JPEG') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (expected === 'PNG') return [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (expected === 'WebP') return bytes.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  if (expected !== 'MP4' && expected !== 'MOV') return false;
  // Conservative Phase 1: require an initial ISO BMFF ftyp box; legacy MOV without ftyp is not accepted.
  if (bytes.length < 16 || ascii(4,8) !== 'ftyp') return false;
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (size < 16 || size % 4 !== 0 || size > bytes.length) return false;
  const major = ascii(8,12);
  if (expected === 'MOV') return major === 'qt  ';
  return ['isom','iso2','mp41','mp42','avc1','M4V ','MSNV','dash'].includes(major);
}
export async function inspect(file: File): Promise<Inspection> {
  const format = validateSelection(file);
  const header = await readRange(file, 0, READ_CHUNK);
  if (!detectHeader(header, format)) throw new Error('Dosya başlığı uzantıyla uyuşmuyor veya bu kapsayıcı desteklenmiyor.');
  return { format, bytesRead: header.byteLength, scope: 'header-only' };
}
