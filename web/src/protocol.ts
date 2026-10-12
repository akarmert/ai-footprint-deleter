import type { Scan } from './engine';
export type Request = { type: 'scan'; file: File } | { type: 'clean'; ids: string[]; rightsConsent: boolean };
export interface VerifiedOutput { blob: Blob; scan: Scan; removed: number; retained: number; payloadHash: string; checks: string[] }
export type Response = { type: 'scan'; scan: Scan } | { type: 'clean'; output: VerifiedOutput } | { type: 'error'; message: string };
