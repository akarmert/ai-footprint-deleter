import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeAiTools, detectAiTools, knownAiTool } from './ai-generator.ts';
import { describeResults } from './results.ts';
import { scanImage } from './engine.ts';
import type { C2paAction, C2paManifest, C2paReport } from './c2pa-types.ts';

const AI = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
const manifest = (
  claimGenerator: string[],
  actions: Partial<C2paAction>[],
  aiSources: string[] = [],
): C2paManifest => ({
  label: 'urn:uuid:test',
  claimGenerator,
  assertions: [],
  actions: actions.map(a => ({ action: 'c2pa.created', source: 'test', ...a })),
  signature: 'present-unverified',
  aiSources,
});
const report = (...manifests: C2paManifest[]): C2paReport => ({
  status: 'readable-unverified',
  reason: '',
  manifests,
  signatureVerification: 'not-performed',
});
const record = (id: string, kind: string, preview: string) => ({ id, kind, preview });

test('known AI tool names are normalized; unrelated software is not', () => {
  assert.equal(knownAiTool('Google Gemini'), 'Google Gemini');
  assert.equal(knownAiTool('Nano Banana'), 'Google Gemini');
  assert.equal(knownAiTool('GPT-4o'), 'OpenAI ChatGPT');
  assert.equal(knownAiTool('OpenAI-API'), 'OpenAI');
  assert.equal(knownAiTool('DALL-E 3'), 'OpenAI DALL·E');
  assert.equal(knownAiTool('Adobe Firefly'), 'Adobe Firefly');
  for (const value of ['Adobe Photoshop 26.0', 'GIMP 2.10', 'Pixel 9 Camera', 'iPhone 15 Pro', 'geminid', undefined])
    assert.equal(knownAiTool(value), undefined, String(value));
});

test('the software agent of an AI-declared C2PA action names the tool', () => {
  const summary = detectAiTools({
    records: [],
    provenance: report(manifest(['Google C2PA SDK'], [{ sourceType: AI, software: 'Gemini' }], [AI])),
  });
  assert.deepEqual(
    summary.claims.map(c => [c.tool, c.source, c.declared]),
    [['Google Gemini', 'c2pa-action', true]],
  );
  assert.equal(summary.aiDeclared, true);
  const text = describeAiTools(summary);
  assert.equal(text.headline, 'Google Gemini');
  assert.equal(text.found, true);
  assert.match(text.detail, /kayıttaki ad: “Gemini”/);
  assert.match(text.detail, /Doğrulanmamış/);
});

test('without an action software agent the claim generator is reported as the recording app', () => {
  const declared = detectAiTools({
    records: [],
    provenance: report(manifest(['ChatGPT'], [{ sourceType: AI }], [AI])),
  });
  assert.deepEqual(
    declared.claims.map(c => [c.tool, c.source, c.declared]),
    [['OpenAI ChatGPT', 'c2pa-claim-generator', true]],
  );
  const unknownApp = detectAiTools({
    records: [],
    provenance: report(manifest(['Acme Image Studio 2'], [{ sourceType: AI }], [AI])),
  });
  assert.deepEqual(
    unknownApp.claims.map(c => [c.tool, c.declared]),
    [['Acme Image Studio 2', true]],
  );
  // A non-AI claim generator without any AI declaration is not reported as an AI tool.
  const camera = detectAiTools({
    records: [],
    provenance: report(
      manifest(
        ['Truepic Lens'],
        [{ sourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture', software: 'Camera' }],
      ),
    ),
  });
  assert.deepEqual(camera.claims, []);
  assert.equal(camera.aiDeclared, false);
});

test('AI declaration without any tool name says so', () => {
  const summary = detectAiTools({
    records: [record('XMP:1', 'XMP', `i:DigitalSourceType="${AI}"`)],
    footprints: { evidence: [{ recordId: 'XMP:1', category: 'explicit-ai' }] },
  });
  assert.deepEqual(summary.claims, []);
  assert.equal(summary.aiDeclared, true);
  assert.equal(describeAiTools(summary).headline, 'Belirtilmemiş');
  assert.equal(describeAiTools(detectAiTools({ records: [] })).headline, 'Dosyada belirtilmemiş');
  assert.match(describeAiTools(detectAiTools({ records: [] })).detail, /AI ile üretilmediği anlamına gelmez/);
});

test('metadata text: tool names and generator-specific parameter formats', () => {
  const summary = detectAiTools({
    records: [
      record('EXIF:1', 'EXIF', 'Software: Midjourney'),
      record('PNG text:2', 'PNG text', 'parameters a cat Steps: 20, Sampler: Euler a, CFG scale: 7'),
      record('PNG text:3', 'PNG text', 'prompt {"3": {"class_type": "KSampler"}}'),
    ],
  });
  assert.deepEqual(
    summary.claims.map(c => [c.tool, c.source, c.declared]),
    [
      ['Midjourney', 'metadata', false],
      ['Stable Diffusion (AUTOMATIC1111/Forge parametreleri)', 'metadata', false],
      ['ComfyUI', 'metadata', false],
    ],
  );
  assert.match(describeAiTools(summary).detail, /açık AI beyanı yok/);
});

test('declared claims come first and duplicates merge into the strongest claim', () => {
  const summary = detectAiTools({
    records: [record('EXIF:1', 'EXIF', 'Software: Adobe Firefly')],
    provenance: report(manifest(['Adobe Firefly'], [{ sourceType: AI, software: 'Adobe Firefly' }], [AI])),
  });
  assert.deepEqual(
    summary.claims.map(c => [c.tool, c.source, c.declared]),
    [['Adobe Firefly', 'c2pa-action', true]],
  );
});

test('file details show the declared tool for a real C2PA JPEG scan', () => {
  // Same synthetic C2PA builder shape as c2pa.test.ts, with a Gemini software agent.
  const utf8 = (s: string) => new TextEncoder().encode(s);
  const join = (...p: Uint8Array[]) => {
    const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
    let i = 0;
    for (const x of p) {
      o.set(x, i);
      i += x.length;
    }
    return o;
  };
  const u32 = (v: number) => {
    const o = new Uint8Array(4);
    new DataView(o.buffer).setUint32(0, v);
    return o;
  };
  const box = (t: string, ...c: Uint8Array[]) => {
    const d = join(...c);
    return join(u32(d.length + 8), utf8(t), d);
  };
  const sb = (t: string, l: string, ...c: Uint8Array[]) =>
    box(
      'jumb',
      box(
        'jumd',
        utf8(t),
        new Uint8Array([0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113, 3]),
        utf8(l),
        new Uint8Array([0]),
      ),
      ...c,
    );
  const cbor = (v: any): Uint8Array => {
    const h = (m: number, n: number) =>
      n < 24
        ? new Uint8Array([m * 32 + n])
        : n < 256
          ? new Uint8Array([m * 32 + 24, n])
          : new Uint8Array([m * 32 + 25, n >> 8, n & 255]);
    if (typeof v === 'string') {
      const d = utf8(v);
      return join(h(3, d.length), d);
    }
    if (Array.isArray(v)) return join(h(4, v.length), ...v.map(cbor));
    const e = Object.entries(v);
    return join(h(5, e.length), ...e.flatMap(([k, x]) => [cbor(k), cbor(x)]));
  };
  const store = sb(
    'c2pa',
    'c2pa',
    sb(
      'c2ma',
      'urn:uuid:test',
      sb(
        'c2as',
        'c2pa.assertions',
        sb(
          'cbor',
          'c2pa.actions.v2',
          box(
            'cbor',
            cbor({ actions: [{ action: 'c2pa.created', digitalSourceType: AI, softwareAgent: { name: 'Gemini' } }] }),
          ),
        ),
      ),
      sb('c2cl', 'c2pa.claim.v2', box('cbor', cbor({ claim_generator_info: [{ name: 'Google C2PA Core' }] }))),
      sb('c2cs', 'c2pa.signature', box('cbor', new Uint8Array([0xd2, 0x80]))),
    ),
  );
  const jpeg = new Uint8Array(readFileSync(new URL('../tests/fixtures/progressive.jpg', import.meta.url)));
  const payload = join(new Uint8Array([74, 80, 0, 1]), u32(1), store.subarray(0, 8), store.subarray(8));
  const data = join(
    jpeg.subarray(0, 2),
    new Uint8Array([255, 235, (payload.length + 2) >> 8, (payload.length + 2) & 255]),
    payload,
    jpeg.subarray(2),
  );
  const scan = scanImage(data);
  const field = describeResults(scan, { name: 'gemini.jpg', size: data.length }).fields.find(f => f.id === 'ai-tool')!;
  assert.equal(field.category, 'file');
  assert.equal(field.ai, true);
  assert.match(field.value, /^Google Gemini \(kayıttaki ad: “Gemini”\) — C2PA işlem kaydı, AI üretim beyanıyla/);
  const plain = describeResults(scanImage(jpeg), { name: 'plain.jpg', size: jpeg.length }).fields.find(
    f => f.id === 'ai-tool',
  )!;
  assert.equal(plain.ai, false);
  assert.match(plain.value, /^Dosyada belirtilmemiş/);
});

test('real-world shapes: OpenAI (ChatGPT agent + vendor generator) and Google (library generator only)', () => {
  const openai = detectAiTools({
    records: [],
    provenance: report(
      manifest(
        ['OpenAI Media Service API'],
        [{ sourceType: AI, software: 'ChatGPT' }, { action: 'c2pa.converted' }],
        [AI],
      ),
    ),
  });
  assert.deepEqual(
    openai.claims.map(c => [c.tool, c.source]),
    [['OpenAI ChatGPT', 'c2pa-action']],
  );
  assert.equal(describeAiTools(openai).headline, 'OpenAI ChatGPT');
  const google = detectAiTools({
    records: [],
    provenance: report(
      manifest(
        ['Google C2PA Core Generator Library'],
        [{ sourceType: AI }, { action: 'c2pa.edited', sourceType: AI }],
        [AI],
      ),
    ),
  });
  assert.deepEqual(
    google.claims.map(c => [c.tool, c.raw, c.declared]),
    [['Google AI (Gemini / Imagen)', 'Google C2PA Core Generator Library', true]],
  );
  // A Google-written manifest that only declares an AI-edited composite (e.g. a phone edit) is not attributed to Gemini.
  const composite = detectAiTools({
    records: [],
    provenance: report(
      manifest(
        ['Google C2PA Core Generator Library'],
        [
          {
            action: 'c2pa.edited',
            sourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
          },
        ],
        ['http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia'],
      ),
    ),
  });
  assert.deepEqual(
    composite.claims.map(c => c.tool),
    ['Google C2PA Core Generator Library'],
  );
});
