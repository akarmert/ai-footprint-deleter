// Pure UI derivations used by App: which records can be cleaned, whether consent is needed,
// which one-click actions are available, and output file names. No React, no side effects.
import { isRemovable, type CleaningMode } from './engine.ts';
import type { MediaScan, VerifiedOutput } from './protocol.ts';

export const isVideoFormat = (format: string | undefined): format is 'MP4' | 'MOV' =>
  format === 'MP4' || format === 'MOV';

export function deriveActions(scan: MediaScan | undefined, mode: CleaningMode) {
  const eligible = scan?.cleaningBlocked
    ? []
    : (scan?.records.filter(record => isRemovable(record, isVideoFormat(scan.format) ? 'safe' : mode)) ?? []);
  const needsConsent = eligible.some(record => record.requiresRightsConsent || record.kind === 'ICC');
  const c2paRemovable =
    !!scan &&
    (scan.format === 'JPEG' || scan.format === 'PNG' || scan.format === 'WebP') &&
    scan.c2paRemovable === true;
  const imageScan = scan && 'footprintPlan' in scan ? scan : undefined;
  const footprintPlan = imageScan?.footprintPlan;
  // The one-click flow never removes blocks that need separate rights consent.
  const directMetadataIds =
    footprintPlan?.metadataIds.filter(
      id => !imageScan?.records.find(record => record.id === id)?.requiresRightsConsent,
    ) ?? [];
  const directRemovable =
    !!footprintPlan && !footprintPlan.blocked && (footprintPlan.removeC2pa || directMetadataIds.length > 0);
  return { eligible, needsConsent, c2paRemovable, imageScan, footprintPlan, directRemovable };
}

/** `<name>-removed.<ext>` for a verified image output; unsafe file-name characters become `_`. */
export function downloadName(fileName: string, output: Pick<VerifiedOutput, 'footprintResult' | 'scan'>): string {
  const base =
    fileName
      .replace(/\.[^.]*$/, '')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .slice(0, 120) || 'gorsel';
  const originalExtension = fileName.match(/\.(jpe?g|png|webp)$/i)?.[1];
  const extension =
    output.footprintResult && originalExtension
      ? originalExtension
      : output.scan.format === 'JPEG'
        ? 'jpg'
        : output.scan.format.toLowerCase();
  return `${base}-removed.${extension}`;
}

/** Suggested save name for a cleaned video. */
export function videoOutputName(fileName: string | undefined, format: 'MP4' | 'MOV'): string {
  return `${(fileName ?? 'video').replace(/\.[^.]*$/, '')}-removed.${format.toLowerCase()}`;
}
