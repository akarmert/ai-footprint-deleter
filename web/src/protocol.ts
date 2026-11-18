import type { Scan, CleaningMode, ChangedField } from './engine';
import type { VideoScan } from './video';
import type { C2paReport } from './c2pa-types';
import type { FootprintResult } from './footprints';
export type MediaScan = (Scan | VideoScan) & { provenance?: C2paReport };
export type Request =
  | { type: 'scan'; file: File }
  | { type: 'clean'; ids: string[]; rightsConsent: boolean; mode: CleaningMode }
  | { type: 'clean-c2pa'; c2paConsent: boolean }
  | { type: 'clean-footprints'; c2paConsent: boolean; rightsConsent: boolean };
export interface VerifiedOutput {
  footprintResult?: FootprintResult;
  operation?: 'c2pa-store-removal';
  mode: CleaningMode;
  blob: Blob;
  scan: Scan;
  removed: number;
  retained: number;
  payloadHash: string;
  checks: string[];
  changedFields?: ChangedField[];
}
export type Response =
  | { type: 'scan'; scan: MediaScan }
  | { type: 'clean'; output: VerifiedOutput }
  | { type: 'clean-footprints'; footprintResult: FootprintResult; output?: VerifiedOutput }
  | { type: 'error'; message: string };
export type VideoRequest =
  | { type: 'scan'; file: File; format: 'MP4' | 'MOV' }
  | {
      type: 'clean';
      ids: string[];
      rightsConsent: boolean;
      handle: FileSystemFileHandle;
      temporaryDirectory?: FileSystemDirectoryHandle;
    }
  | { type: 'cancel' };
export type VideoResponse = (
  | { type: 'scan'; scan: VideoScan }
  | { type: 'video-done'; scan: VideoScan; removed: number }
  | { type: 'error'; message: string }
  | { type: 'cancelled' }
  | { type: 'committing' }
) & { cleanupWarning?: string };
