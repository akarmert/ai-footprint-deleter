// Informational only: which AI tool a file *says* it was made with. Everything here is an
// unverified claim read from metadata/C2PA; it never proves or rules out AI generation and it
// does not feed the removal plan (see footprints.ts for that).
import { isAiDigitalSourceType } from './ai-source-types.ts';
import type { C2paReport } from './c2pa-types.ts';

export type AiToolSource = 'c2pa-action' | 'c2pa-claim-generator' | 'metadata';
export type AiToolClaim = {
  /** Normalized tool name, or the raw recorded name when it is not a known tool. */
  tool: string;
  /** Name exactly as recorded in the file (shortened). */
  raw: string;
  source: AiToolSource;
  /** True when the same manifest/record also carries an explicit AI Digital Source Type declaration. */
  declared: boolean;
};
export type AiToolSummary = { claims: AiToolClaim[]; aiDeclared: boolean };

type ScanLike = {
  records: { id: string; kind: string; preview: string }[];
  provenance?: C2paReport;
  footprints?: { evidence: { recordId?: string; category: string }[] };
};

const MAX_RAW = 80;

// Known generative tools. Order matters: the first match wins for a given string.
const KNOWN_TOOLS: { name: string; pattern: RegExp }[] = [
  { name: 'Google Gemini', pattern: /\bgemini\b|\bnano[\s-]?banana\b/i },
  { name: 'Google Imagen', pattern: /\bimagen\b/i },
  { name: 'OpenAI DALL·E', pattern: /\bdall[·\-\s]?e\b/i },
  { name: 'OpenAI ChatGPT', pattern: /\bchatgpt\b|\bgpt[-\s]?(?:4o|image)\b|\bsora\b/i },
  { name: 'OpenAI', pattern: /\bopenai\b/i },
  { name: 'Midjourney', pattern: /\bmidjourney\b/i },
  { name: 'Adobe Firefly', pattern: /\bfirefly\b/i },
  { name: 'Microsoft Designer / Bing Image Creator', pattern: /\bbing image creator\b|\bmicrosoft designer\b/i },
  { name: 'Meta AI', pattern: /\bmeta ai\b|\bimagine with meta\b/i },
  { name: 'Grok', pattern: /\bgrok\b/i },
  { name: 'Ideogram', pattern: /\bideogram\b/i },
  { name: 'Leonardo.Ai', pattern: /\bleonardo\.ai\b/i },
  { name: 'FLUX', pattern: /\bflux(?:\.1)?[\s-](?:dev|schnell|pro|kontext)\b|\bblack forest labs\b/i },
  { name: 'Runway', pattern: /\brunwayml\b|\brunway gen-?\d/i },
  { name: 'Stable Diffusion', pattern: /\bstable[\s-]?diffusion\b|\bsdxl\b/i },
  { name: 'ComfyUI', pattern: /\bcomfyui\b/i },
  { name: 'AUTOMATIC1111', pattern: /\bautomatic1111\b/i },
];

// Vendors whose claim generator does not name the product. Used only when the same manifest
// declares trainedAlgorithmicMedia, so a vendor's camera or editor is never reported as an AI tool.
const DECLARED_VENDORS: { name: string; pattern: RegExp }[] = [
  { name: 'Google AI (Gemini / Imagen)', pattern: /\bgoogle\b/i },
];

// Generator-specific parameter formats that identify the tool without naming it.
const PARAMETER_FORMATS: { name: string; pattern: RegExp }[] = [
  { name: 'Stable Diffusion (AUTOMATIC1111/Forge parametreleri)', pattern: /\bSteps:\s*\d+,\s*Sampler:/ },
  { name: 'ComfyUI', pattern: /"class_type"\s*:/ },
  { name: 'Midjourney', pattern: /\bJob ID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
];

const clean = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_RAW);

export function knownAiTool(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return KNOWN_TOOLS.find(tool => tool.pattern.test(value))?.name;
}

export function detectAiTools(scan: ScanLike): AiToolSummary {
  const claims: AiToolClaim[] = [];
  const add = (claim: AiToolClaim) => {
    const existing = claims.find(c => c.tool === claim.tool);
    if (!existing) claims.push(claim);
    else if (claim.declared && !existing.declared) Object.assign(existing, claim);
  };
  let aiDeclared = false;

  for (const manifest of scan.provenance?.manifests ?? []) {
    const aiActions = manifest.actions.filter(action => isAiDigitalSourceType(action.sourceType));
    const manifestDeclared = aiActions.length > 0 || manifest.aiSources.length > 0;
    aiDeclared ||= manifestDeclared;
    // 1. The software agent of an action that itself declares AI generation/editing.
    for (const action of aiActions)
      if (action.software?.trim()) {
        const raw = clean(action.software);
        add({ tool: knownAiTool(raw) ?? raw, raw, source: 'c2pa-action', declared: true });
      }
    // 2. Other actions naming a known AI tool (no AI source type on that action).
    for (const action of manifest.actions)
      if (!aiActions.includes(action) && knownAiTool(action.software)) {
        const raw = clean(action.software!);
        add({ tool: knownAiTool(raw)!, raw, source: 'c2pa-action', declared: manifestDeclared });
      }
    // 3. The claim generator: the app that wrote the record. Used when it is a known AI tool,
    //    or as the only available name when the manifest declares AI without naming a tool.
    const namedByAction = aiActions.some(action => action.software?.trim());
    const generated =
      manifest.aiSources.some(source => /trainedAlgorithmicMedia$/.test(source)) ||
      aiActions.some(action => /\/trainedAlgorithmicMedia$/.test(action.sourceType ?? ''));
    for (const generator of manifest.claimGenerator) {
      const raw = clean(generator);
      const known =
        knownAiTool(raw) ??
        (generated && !namedByAction ? DECLARED_VENDORS.find(vendor => vendor.pattern.test(raw))?.name : undefined);
      // Skip a vendor name already covered by a more specific tool (OpenAI vs OpenAI ChatGPT).
      if (known && claims.some(c => c.tool !== known && (c.tool.startsWith(known) || known.startsWith(c.tool))))
        continue;
      if (known) add({ tool: known, raw, source: 'c2pa-claim-generator', declared: manifestDeclared });
      else if (manifestDeclared && !namedByAction && raw)
        add({ tool: raw, raw, source: 'c2pa-claim-generator', declared: true });
    }
  }

  // 4. Plain metadata text (EXIF Software, XMP CreatorTool, PNG parameters, comments...).
  for (const record of scan.records) {
    if (/c2pa|provenance/i.test(record.kind)) continue;
    const recordDeclared = !!scan.footprints?.evidence.some(
      e => e.recordId === record.id && e.category === 'explicit-ai',
    );
    aiDeclared ||= recordDeclared;
    const text = record.preview;
    const known = knownAiTool(text) ?? PARAMETER_FORMATS.find(format => format.pattern.test(text))?.name;
    if (known) {
      const match = KNOWN_TOOLS.find(tool => tool.name === known)?.pattern.exec(text)?.[0] ?? known;
      add({ tool: known, raw: clean(match), source: 'metadata', declared: recordDeclared });
    }
  }

  // Declared claims first, then by source strength.
  const rank: Record<AiToolSource, number> = { 'c2pa-action': 0, 'c2pa-claim-generator': 1, metadata: 2 };
  claims.sort((a, b) => Number(b.declared) - Number(a.declared) || rank[a.source] - rank[b.source]);
  return { claims, aiDeclared };
}

const sourceLabel: Record<AiToolSource, string> = {
  'c2pa-action': 'C2PA işlem kaydı',
  'c2pa-claim-generator': 'C2PA kaydını oluşturan uygulama',
  metadata: 'metadata metni',
};

/** One-line Turkish summary for the file details. */
export function describeAiTools(summary: AiToolSummary): { headline: string; detail: string; found: boolean } {
  const { claims, aiDeclared } = summary;
  if (!claims.length)
    return aiDeclared
      ? {
          headline: 'Belirtilmemiş',
          detail: 'Dosyada AI üretim beyanı var ama araç adı yazılmamış. Doğrulanmamış beyan.',
          found: false,
        }
      : {
          headline: 'Dosyada belirtilmemiş',
          detail:
            'Metadata/C2PA kayıtlarında AI aracı adı bulunamadı. Bu, görselin AI ile üretilmediği anlamına gelmez.',
          found: false,
        };
  const headline = [...new Set(claims.map(c => c.tool))].join(' · ');
  const parts = claims.map(
    c =>
      `${c.tool}${c.raw && c.raw !== c.tool ? ` (kayıttaki ad: “${c.raw}”)` : ''} — ${sourceLabel[c.source]}${c.declared ? ', AI üretim beyanıyla' : ', açık AI beyanı yok'}`,
  );
  return {
    headline,
    detail: `${parts.join('; ')}. Doğrulanmamış beyan; kayıtlar değiştirilebilir veya sahte olabilir.`,
    found: true,
  };
}
