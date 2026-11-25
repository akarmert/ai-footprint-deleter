import type { Scan, ChangedField } from './engine';
import type { VideoScan } from './video';
import type { C2paReport } from './c2pa-types';
import type { FootprintResult } from './footprints';

export type MediaScan = (Scan | VideoScan) & { provenance?: C2paReport };

// Image Worker (inspect.worker.ts)
export type Request = { type: 'scan'; file: File } | { type: 'clean-all-metadata' };
export interface VerifiedOutput {
  footprintResult: FootprintResult;
  /** Kinds of blocks deliberately kept (e.g. ICC, orientation EXIF). */
  retainedKinds: string[];
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
  | { type: 'cleaned'; footprintResult: FootprintResult; output?: VerifiedOutput }
  | { type: 'error'; message: string };

// Video Worker (video.worker.ts)
export type VideoRequest =
  | { type: 'scan'; file: File; format: 'MP4' | 'MOV' }
  | {
      type: 'clean';
      ids: string[];
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
