// Pure UI derivations used by App: what "Tüm Metadata'yı Kaldır" would remove and output file
// names. No React, no side effects.
import { isRemovable } from './engine.ts';
import type { MediaScan } from './protocol.ts';

export const isVideoFormat = (format: string | undefined): format is 'MP4' | 'MOV' =>
  format === 'MP4' || format === 'MOV';

export function deriveActions(scan: MediaScan | undefined) {
  const imageScan = scan && 'footprintPlan' in scan ? scan : undefined;
  const c2paRemovable = imageScan?.c2paRemovable === true;
  // Records the one-click removal deletes (videos: sent to the video Worker; images: re-derived
  // by cleanAllMetadata after the C2PA stage).
  const removable = scan && !scan.cleaningBlocked ? scan.records.filter(isRemovable) : [];
  const canRemoveAll = imageScan
    ? (!imageScan.cleaningBlocked || c2paRemovable) && (c2paRemovable || imageScan.records.some(isRemovable))
    : removable.length > 0;
  return { imageScan, footprintPlan: imageScan?.footprintPlan, removable, canRemoveAll };
}

/** Human-readable size in Turkish locale, decimal units (e.g. "2,4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} bayt`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1000,
    unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

const safeBase = (fileName: string) =>
  fileName
    .replace(/\.[^.]*$/, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 120);

/** `<name>-removed.<ext>`; keeps the original image extension, unsafe characters become `_`. */
export function downloadName(fileName: string, format: 'JPEG' | 'PNG' | 'WebP'): string {
  const extension = fileName.match(/\.(jpe?g|png|webp)$/i)?.[1] ?? (format === 'JPEG' ? 'jpg' : format.toLowerCase());
  return `${safeBase(fileName) || 'gorsel'}-removed.${extension}`;
}

/** Suggested save name for a cleaned video. */
export function videoOutputName(fileName: string | undefined, format: 'MP4' | 'MOV'): string {
  return `${safeBase(fileName ?? '') || 'video'}-removed.${format.toLowerCase()}`;
}
