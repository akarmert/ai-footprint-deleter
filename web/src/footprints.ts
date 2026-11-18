import type { Scan } from './engine.ts';
import type { C2paReport } from './c2pa-types.ts';

export type FootprintRecordAnalysis = { complete: boolean; explicit: string[]; hints: string[]; dedicated: boolean };
export type FootprintEvidence = {
  category: 'explicit-ai' | 'metadata-hint' | 'provenance';
  recordId?: string;
  source: string;
  removable: boolean;
  verified: false;
};
export type FootprintReport = {
  evidence: FootprintEvidence[];
  incomplete: boolean;
  state: 'AI_DECLARATION' | 'METADATA_HINTS' | 'PROVENANCE_ONLY' | 'NO_RECORDS' | 'INCOMPLETE';
  scope: 'bounded-top-level-metadata';
  limitations: string[];
};
export type FootprintPlan = {
  metadataIds: string[];
  removeC2pa: boolean;
  unsupported: string[];
  blocked: boolean;
  preserved: string[];
  reasons: string[];
};
export type FootprintStatus =
  'REMOVED_VERIFIED' | 'PARTIALLY_REMOVED' | 'BLOCKED' | 'NOTHING_TO_REMOVE' | 'VERIFICATION_FAILED';
export type FootprintResult = {
  status: FootprintStatus;
  before: FootprintReport;
  after?: FootprintReport;
  plan: FootprintPlan;
  reason: string;
};

// Only full, bounded metadata enters detection. Preview is deliberately not an input.
// Text identifies hints, not proof of AI generation. Only dedicated text blocks
// are eligible; EXIF and XMP are never silently removed as whole blocks.
export function classifyFootprintText(
  value: string,
  complete: boolean,
  context?: { kind: 'png' | 'jpeg'; keyword?: string; language?: string; translated?: string },
): FootprintRecordAnalysis {
  const hints = [
    ...new Set(
      value.match(
        /\b(?:Stable Diffusion|ComfyUI|AUTOMATIC1111|Midjourney|DALL[·-]?E|Adobe Firefly|AI generated)\b/gi,
      ) ?? [],
    ),
  ];
  if (
    /(?:^|[\s"'<:{,])(?:prompt|seed|negative[_ ]prompt|sampler(?:_name)?|cfg(?:_scale)?)\s*["']?\s*[:=>]/i.test(value)
  )
    hints.push('generation-parameters');
  const png = context?.kind === 'png';
  const body = png ? value : value.replace(/^AI parameters:\s*/i, '');
  const mixed =
    /\b(?:copyright|author|creator|licen[cs]e|credits?|trademark)\b|©|\(c\)|\brights\s+reserved\b|\bproperty\s+of\b|\bprivate\s+note\b|\b(?:not|never|no|non)[ -]+(?:AI|generated|ComfyUI|Stable Diffusion)|\b(?:article|mentioned|unrelated|not generated|is not|without AI)\b/i.test(
      value + ' ' + (context?.translated ?? ''),
    );
  // Every nonempty line must be a known parameter, after an optional tool header.
  // A prompt value can be arbitrary text, but cannot authorize later prose lines.
  const tool = /^(?:Stable Diffusion|ComfyUI|AUTOMATIC1111)\b\s*/i;
  const parameters = body
    .trim()
    .replace(tool, '')
    .split(/\r\n?|\n/)
    .map(line => line.trim())
    .filter(Boolean);
  const parameter =
    /^(?:prompt|negative[_ ]prompt|seed|steps|sampler(?:[_ ]name)?|cfg(?:[_ ]scale)?|model(?:[_ ]hash)?|size|width|height|denoising[_ ]strength|clip[_ ]skip|scheduler|batch[_ ]size|subseed|subseed[_ ]strength|version)\s*[:=]\s*\S.*$/i;
  const generation =
    (tool.test(body.trim()) || parameters.length > 0) && parameters.every(line => parameter.test(line));
  const dedicated =
    complete &&
    !mixed &&
    !value.includes('\0') &&
    generation &&
    (png
      ? ['parameters', 'ai parameters', 'generation parameters'].includes(context.keyword ?? '') &&
        !context.language &&
        !context.translated
      : context?.kind === 'jpeg' && /^AI parameters:\s*/i.test(value));
  return { complete, explicit: [], hints, dedicated };
}

export function buildFootprints(
  scan: Scan,
  provenance: C2paReport,
): { footprints: FootprintReport; footprintPlan: FootprintPlan } {
  const evidence: FootprintEvidence[] = [];
  const metadataIds: string[] = [];
  const unsupported: string[] = [];
  let incomplete =
    scan.orientation === null || provenance.status === 'unreadable' || provenance.status === 'unsupported';
  for (const record of scan.records) {
    const analysis = record.footprintAnalysis;
    if (
      (analysis && !analysis.complete) ||
      (!analysis &&
        ![
          'ICC',
          'JFIF',
          'C2PA / opaque provenance',
          'cHRM',
          'gAMA',
          'sRGB',
          'sBIT',
          'bKGD',
          'hIST',
          'pHYs',
          'tIME',
          'Adobe APP14',
        ].includes(record.kind))
    )
      incomplete = true;
    const removable =
      !!analysis?.dedicated &&
      record.status !== 'unsupported' &&
      (record.status === 'cleanable' || record.requiresRightsConsent);
    for (const source of analysis?.explicit ?? [])
      evidence.push({ category: 'explicit-ai', recordId: record.id, source, removable, verified: false });
    for (const source of analysis?.hints ?? [])
      evidence.push({ category: 'metadata-hint', recordId: record.id, source, removable, verified: false });
    if ((analysis?.explicit.length || analysis?.hints.length) && !removable) unsupported.push(record.id);
    if (removable) metadataIds.push(record.id);
  }
  const hasProvenance = scan.c2pa !== 'not-detected-not-guaranteed' || provenance.status !== 'absent';
  if (hasProvenance)
    evidence.push({ category: 'provenance', source: 'C2PA', removable: scan.c2paRemovable === true, verified: false });
  for (const manifest of provenance.manifests)
    for (const source of manifest.aiSources) {
      evidence.push({ category: 'explicit-ai', source, removable: scan.c2paRemovable === true, verified: false });
    }
  if (hasProvenance && !scan.c2paRemovable) unsupported.push('C2PA');
  const state = evidence.some(e => e.category === 'explicit-ai')
    ? 'AI_DECLARATION'
    : evidence.some(e => e.category === 'metadata-hint')
      ? 'METADATA_HINTS'
      : hasProvenance
        ? 'PROVENANCE_ONLY'
        : incomplete
          ? 'INCOMPLETE'
          : 'NO_RECORDS';
  const footprints: FootprintReport = {
    evidence,
    incomplete,
    state,
    scope: 'bounded-top-level-metadata',
    limitations: [
      'AI declarations are unverified claims, not proof of generation.',
      'No pixel, watermark, nested metadata or signature verification; absence is not a guarantee.',
      ...(incomplete ? ['Some retained metadata could not be fully interpreted.'] : []),
    ],
  };
  const removeC2pa = hasProvenance && scan.c2paRemovable === true;
  const blocked = scan.cleaningBlocked && !scan.c2paRemovable;
  const reasons = [
    ...(blocked ? [scan.c2paDecision?.reason ?? 'Kaynak kaydı güvenle kaldırılamıyor.'] : []),
    ...(unsupported.length ? ['Desteklenmeyen bazı metadata alanları korunur.'] : []),
    ...(incomplete ? ['Bazı metadata alanları tam incelenemedi.'] : []),
    ...(scan.orientation === null || scan.records.some(r => r.kind === 'XMP' && /orientation/i.test(r.preview))
      ? ['Görüntü yönü belirsiz ya da XMP içinde; ilgili kayıtlar korunur.']
      : []),
  ];
  return {
    footprints,
    footprintPlan: {
      metadataIds,
      removeC2pa,
      unsupported: [...new Set(unsupported)],
      blocked,
      preserved: scan.records
        .filter(r => !metadataIds.includes(r.id) && !(removeC2pa && r.kind === 'C2PA / opaque provenance'))
        .map(r => r.id),
      reasons,
    },
  };
}
