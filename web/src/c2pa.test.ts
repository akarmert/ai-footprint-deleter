import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readC2pa } from './c2pa.ts';
import { scanImage, cleanImage } from './engine.ts';

const utf8 = (text: string) => new TextEncoder().encode(text);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const u32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
};
const box = (type: string, ...content: Uint8Array[]) => {
  const data = join(...content);
  return join(u32(data.length + 8), utf8(type), data);
};
const superbox = (type: string, label: string, ...children: Uint8Array[]) =>
  box(
    'jumb',
    box(
      'jumd',
      utf8(type),
      new Uint8Array([0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113, 3]),
      utf8(label),
      new Uint8Array([0]),
    ),
    ...children,
  );
const cbor = (value: any): Uint8Array => {
  const header = (major: number, length: number) =>
    length < 24
      ? new Uint8Array([major * 32 + length])
      : length < 256
        ? new Uint8Array([major * 32 + 24, length])
        : new Uint8Array([major * 32 + 25, length >> 8, length & 255]);
  if (typeof value === 'string') {
    const data = utf8(value);
    return join(header(3, data.length), data);
  }
  if (Array.isArray(value)) return join(header(4, value.length), ...value.map(cbor));
  const entries = Object.entries(value);
  return join(header(5, entries.length), ...entries.flatMap(([key, value]) => [cbor(key), cbor(value)]));
};
const store = (ai: boolean | string = true, malformed = false, actionLabel = 'c2pa.actions.v2') =>
  superbox(
    'c2pa',
    'c2pa',
    superbox(
      'c2ma',
      'urn:uuid:test',
      superbox(
        'c2as',
        'c2pa.assertions',
        superbox(
          'cbor',
          actionLabel,
          box(
            'cbor',
            malformed
              ? new Uint8Array([0xa1])
              : cbor({
                  actions: [
                    {
                      action: 'c2pa.created',
                      digitalSourceType:
                        typeof ai === 'string'
                          ? ai
                          : ai
                            ? 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
                            : 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture',
                      softwareAgent: { name: 'Fixture software' },
                      description: 'Applied SynthID watermark',
                    },
                  ],
                }),
          ),
        ),
      ),
      superbox(
        'c2cl',
        'c2pa.claim.v2',
        box('cbor', cbor({ claim_generator_info: [{ name: 'Fixture Claim Generator' }] })),
      ),
      superbox('c2cs', 'c2pa.signature', box('cbor', new Uint8Array([0xd2, 0x80]))),
    ),
  );
const jpeg = new Uint8Array(readFileSync(new URL('../tests/fixtures/progressive.jpg', import.meta.url)));
const wrap = (data: Uint8Array, fragment = 60000, mutate?: (parts: Uint8Array[]) => void) => {
  const parts: Uint8Array[] = [];
  for (let offset = 8, sequence = 1; offset < data.length; offset += fragment, sequence++) {
    const payload = join(
      new Uint8Array([74, 80, 0, 1]),
      u32(sequence),
      data.subarray(0, 8),
      data.subarray(offset, offset + fragment),
    );
    parts.push(join(new Uint8Array([255, 235, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload));
  }
  mutate?.(parts);
  return join(jpeg.subarray(0, 2), ...parts, jpeg.subarray(2));
};

test('read-only C2PA actions and generator are unverified source claims', async () => {
  const data = wrap(store()),
    before = data.slice(),
    result = readC2pa(data, 'JPEG', true);
  assert.equal(result.status, 'readable-unverified');
  assert.equal(result.signatureVerification, 'not-performed');
  assert.deepEqual(result.manifests[0].claimGenerator, ['Fixture Claim Generator']);
  assert.equal(result.manifests[0].signature, 'present-unverified');
  assert.equal(result.manifests[0].aiSources.length, 1);
  assert.equal(result.manifests[0].actions[0].software, 'Fixture software');
  assert.deepEqual(data, before);
  const scan = scanImage(data);
  assert.equal(scan.cleaningBlocked, true);
  for (const mode of ['safe', 'comprehensive'] as const) await assert.rejects(cleanImage(data, [], true, mode));
});
test('no AI declaration does not erase provenance uncertainty', () => {
  const result = readC2pa(wrap(store(false)), 'JPEG', true);
  assert.equal(result.status, 'readable-unverified');
  assert.equal(result.manifests[0].aiSources.length, 0);
});
test('AI-edited composite Digital Source Type counts as an AI declaration; other algorithmic types do not', () => {
  const iptc = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
  assert.equal(
    readC2pa(wrap(store(`${iptc}compositeWithTrainedAlgorithmicMedia`)), 'JPEG', true).manifests[0].aiSources.length,
    1,
  );
  for (const term of ['algorithmicMedia', 'compositeSynthetic', 'digitalCapture'])
    assert.equal(readC2pa(wrap(store(`${iptc}${term}`)), 'JPEG', true).manifests[0].aiSources.length, 0, term);
});
test('APP11 fragmentation repeats box headers and enforces complete sequence', () => {
  assert.equal(readC2pa(wrap(store(), 50), 'JPEG', true).status, 'readable-unverified');
  for (const mutate of [
    (parts: Uint8Array[]) => parts.splice(1, 1),
    (parts: Uint8Array[]) => parts.splice(1, 0, parts[0]),
    (parts: Uint8Array[]) => parts.reverse(),
  ])
    assert.equal(readC2pa(wrap(store(), 50, mutate), 'JPEG', true).status, 'unreadable');
});
test('malformed CBOR, box lengths, budget, opaque and unsupported structures fail read-only', () => {
  assert.equal(readC2pa(wrap(store(true, true)), 'JPEG', true).status, 'unreadable');
  const invalid = store();
  invalid[3] = 1;
  assert.equal(readC2pa(wrap(invalid), 'JPEG', true).status, 'unreadable');
  let time = 0;
  assert.equal(readC2pa(wrap(store()), 'JPEG', true, () => (time += 300)).status, 'unreadable');
  assert.equal(readC2pa(jpeg, 'JPEG', true).status, 'unreadable');
  for (const format of ['PNG', 'WebP']) {
    assert.equal(readC2pa(new Uint8Array(), format, false).status, 'absent');
    assert.equal(readC2pa(new Uint8Array(), format, true).status, 'unreadable');
  }
  assert.equal(readC2pa(new Uint8Array(), 'TIFF', true).status, 'unsupported');
});
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)));
const crc = (data: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
};
const pngInsert = (data: Uint8Array, kind: string, payload: Uint8Array) => {
  const chunk = new Uint8Array(payload.length + 12),
    view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set(utf8(kind), 4);
  chunk.set(payload, 8);
  view.setUint32(chunk.length - 4, crc(chunk.subarray(4, chunk.length - 4)));
  return join(data.subarray(0, 33), chunk, data.subarray(33));
};
const webpInsert = (data: Uint8Array, kind: string, payload: Uint8Array) => {
  const chunk = new Uint8Array(8 + payload.length + (payload.length % 2));
  chunk.set(utf8(kind));
  new DataView(chunk.buffer).setUint32(4, payload.length, true);
  chunk.set(payload, 8);
  const out = join(data, chunk);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
};
for (const [format, build] of [
  ['PNG', (s: Uint8Array) => pngInsert(fixture('image-1.png'), 'caBX', s)],
  ['WebP', (s: Uint8Array) => webpInsert(fixture('image-1.webp'), 'C2PA', s)],
] as const) {
  test(`${format} embedded C2PA store contents are read as unverified claims`, () => {
    const data = build(store()),
      before = data.slice(),
      result = readC2pa(data, format, true);
    assert.equal(result.status, 'readable-unverified', result.reason);
    assert.deepEqual(result.manifests[0].claimGenerator, ['Fixture Claim Generator']);
    assert.equal(result.manifests[0].aiSources.length, 1);
    assert.deepEqual(data, before);
    assert.equal(readC2pa(build(store(false)), format, true).manifests[0].aiSources.length, 0);
    assert.equal(readC2pa(build(store(true, true)), format, true).status, 'unreadable');
    const scan = scanImage(data);
    assert.equal(scan.provenance?.status, 'readable-unverified');
    assert.equal(scan.footprints?.state, 'AI_DECLARATION');
  });
}
test('PNG/WebP reader rejects duplicate or misplaced stores and malformed containers', () => {
  const twice = pngInsert(pngInsert(fixture('image-1.png'), 'caBX', store()), 'caBX', store());
  assert.equal(readC2pa(twice, 'PNG', true).status, 'unreadable');
  const png = fixture('image-1.png'),
    afterIdat = png.slice();
  const idat = (() => {
    for (let p = 8; p < png.length;) {
      const n = new DataView(png.buffer, png.byteOffset + p).getUint32(0);
      if (String.fromCharCode(...png.subarray(p + 4, p + 8)) === 'IDAT') return p + 12 + n;
      p += n + 12;
    }
    return -1;
  })();
  const misplaced = join(
    afterIdat.subarray(0, idat),
    pngInsert(new Uint8Array(33), 'caBX', store()).subarray(33),
    afterIdat.subarray(idat),
  );
  assert.equal(readC2pa(misplaced, 'PNG', true).status, 'unreadable');
  const doubled = webpInsert(webpInsert(fixture('image-1.webp'), 'C2PA', store()), 'C2PA', store());
  assert.equal(readC2pa(doubled, 'WebP', true).status, 'unreadable');
  const truncated = webpInsert(fixture('image-1.webp'), 'C2PA', store());
  new DataView(truncated.buffer).setUint32(4, truncated.length + 100, true);
  assert.equal(readC2pa(truncated, 'WebP', true).status, 'unreadable');
  assert.equal(readC2pa(fixture('image-1.png'), 'PNG', false).status, 'absent');
});
test('numbered actions are read and duplicate manifest labels are rejected', () => {
  for (const label of ['c2pa.actions__1', 'c2pa.actions.v2__1'])
    assert.equal(readC2pa(wrap(store(true, false, label)), 'JPEG', true).manifests[0].aiSources.length, 1);
  const data = store(),
    manifest = data.subarray(8 + new DataView(data.buffer, data.byteOffset).getUint32(8));
  const result = readC2pa(wrap(superbox('c2pa', 'c2pa', manifest, manifest)), 'JPEG', true);
  assert.equal(result.status, 'unreadable');
  assert.equal(result.reason, 'Yinelenen manifest etiketi');
});
test('normal JPEG EXIF/XMP remains outside C2PA parsing', () => {
  const data = new Uint8Array(readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url)));
  assert.equal(readC2pa(data, 'JPEG', false).status, 'absent');
});
