// Test image builders for the browser tests (Node side). Synthetic C2PA stores follow the same
// JUMBF/CBOR shape as src/c2pa.test.ts; nothing here is a real producer's file.
import { readFileSync } from 'node:fs';

export const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
const utf8 = (s: string) => new TextEncoder().encode(s);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u32 = (v: number) => {
  const o = new Uint8Array(4);
  new DataView(o.buffer).setUint32(0, v);
  return o;
};
const box = (type: string, ...content: Uint8Array[]) => {
  const d = join(...content);
  return join(u32(d.length + 8), utf8(type), d);
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
type Cbor = string | Cbor[] | { [key: string]: Cbor };
const cbor = (value: Cbor): Uint8Array => {
  const head = (major: number, n: number) =>
    n < 24
      ? new Uint8Array([major * 32 + n])
      : n < 256
        ? new Uint8Array([major * 32 + 24, n])
        : new Uint8Array([major * 32 + 25, n >> 8, n & 255]);
  if (typeof value === 'string') {
    const d = utf8(value);
    return join(head(3, d.length), d);
  }
  if (Array.isArray(value)) return join(head(4, value.length), ...value.map(cbor));
  const entries = Object.entries(value);
  return join(head(5, entries.length), ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]));
};

/** JPEG with an EXIF block (from image-1.jpg) and a C2PA store declaring AI generation by `tool`. */
export function aiJpeg(tool = 'ChatGPT', generator = 'OpenAI Media Service API') {
  const actions = cbor({
    actions: [
      {
        action: 'c2pa.created',
        digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
        softwareAgent: { name: tool },
      },
    ],
  });
  const store = superbox(
    'c2pa',
    'c2pa',
    superbox(
      'c2ma',
      'urn:uuid:e2e',
      superbox('c2as', 'c2pa.assertions', superbox('cbor', 'c2pa.actions.v2', box('cbor', actions))),
      superbox('c2cl', 'c2pa.claim.v2', box('cbor', cbor({ claim_generator_info: [{ name: generator }] }))),
      superbox('c2cs', 'c2pa.signature', box('cbor', new Uint8Array([0xd2, 0x80]))),
    ),
  );
  const payload = join(new Uint8Array([74, 80, 0, 1]), u32(1), store.subarray(0, 8), store.subarray(8));
  const base = fixture('image-1.jpg');
  return join(
    base.subarray(0, 2),
    new Uint8Array([255, 235, (payload.length + 2) >> 8, (payload.length + 2) & 255]),
    payload,
    base.subarray(2),
  );
}
