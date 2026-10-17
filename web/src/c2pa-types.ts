export type C2paAction = { action: string; sourceType?: string; software?: string; description?: string; source: string };
export type C2paManifest = { label: string; claimGenerator: string[]; assertions: string[]; actions: C2paAction[]; signature: 'present-unverified' | 'unreadable'; aiSources: string[] };
export type C2paReport = {
  status: 'absent' | 'readable-unverified' | 'unreadable' | 'unsupported';
  manifests: C2paManifest[];
  reason: string;
  signatureVerification: 'not-performed';
};
