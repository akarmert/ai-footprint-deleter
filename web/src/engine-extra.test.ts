import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { scanImage, cleanImage, cleanAllMetadata } from './engine.ts';
import { validateSelection } from './media.ts';
import type { Request, Response } from './protocol.ts';

function imageWorker() {
  const source = readFileSync(new URL('./inspect.worker.ts', import.meta.url), 'utf8');
  const messages: Response[] = [];
  const self = {
    onmessage: undefined as unknown as (event: { data: Request }) => Promise<void>,
    postMessage: (value: Response) => messages.push(structuredClone(value)),
  };
  runInNewContext(stripTypeScriptTypes(source.replace(/^import\b[\s\S]*?\bfrom\s*['"][^'"]+['"];?[ \t]*\r?\n/gm, '')), {
    self,
    Error,
    Uint8Array,
    Blob,
    validateSelection,
    scanImage,
    cleanAllMetadata,
  });
  return { self, messages };
}

test('image Worker removes all metadata and returns a verified output', async () => {
  const { self, messages } = imageWorker();
  const file = new File([readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url))], 'image.jpg');
  await self.onmessage({ data: { type: 'scan', file } });
  await self.onmessage({ data: { type: 'clean-all-metadata' } });
  const last = messages.at(-1);
  assert.ok(last?.type === 'cleaned');
  assert.equal(last.footprintResult.status, 'REMOVED_VERIFIED');
  assert.equal(last.output?.blob.type, 'image/jpeg');
  assert.equal(
    last.output?.scan.records.some(r => r.kind === 'EXIF'),
    false,
  );
});
test('image Worker rejects removal before a scan and unknown requests without output', async () => {
  const { self, messages } = imageWorker();
  await self.onmessage({ data: { type: 'clean-all-metadata' } });
  assert.deepEqual(messages.at(-1), { type: 'error', message: 'Önce görseli yeniden seçin.' });
  const file = new File([readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url))], 'image.jpg');
  await self.onmessage({ data: { type: 'scan', file } });
  for (const type of ['clean', 'clean-c2pa', 'clean-footprints'])
    await self.onmessage({ data: { type } as unknown as Request });
  assert.deepEqual(messages.at(-1), { type: 'error', message: 'Geçersiz işlem.' });
  assert.equal(
    messages.some(message => message.type === 'cleaned'),
    false,
  );
});

test('image Worker rejects oversized images before reading bytes and invalidates previous source', async () => {
  const { self, messages } = imageWorker();
  const file = new File([readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url))], 'image.jpg');
  await self.onmessage({ data: { type: 'scan', file } });
  assert.equal(messages.at(-1)?.type, 'scan');
  let reads = 0;
  const oversized = {
    name: 'large.jpg',
    size: 134_217_729,
    arrayBuffer: async () => {
      reads++;
      return new ArrayBuffer(0);
    },
  } as File;
  await self.onmessage({ data: { type: 'scan', file: oversized } });
  assert.deepEqual(messages.at(-1), { type: 'error', message: 'Görsel en fazla 128 MiB olabilir.' });
  assert.equal(reads, 0);
  await self.onmessage({ data: { type: 'clean-all-metadata' } });
  assert.deepEqual(messages.at(-1), { type: 'error', message: 'Önce görseli yeniden seçin.' });
});

test('image Worker ignores concurrent requests until the current scan completes', async () => {
  const { self, messages } = imageWorker();
  const bytes = readFileSync(new URL('../tests/fixtures/image-1.jpg', import.meta.url));
  let release!: (buffer: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>(resolve => {
    release = resolve;
  });
  const file = { name: 'image.jpg', size: bytes.length, arrayBuffer: () => pending } as File;
  const scanning = self.onmessage({ data: { type: 'scan', file } });
  await self.onmessage({ data: { type: 'clean-all-metadata' } });
  assert.equal(messages.length, 0);
  release(Uint8Array.from(bytes).buffer);
  await scanning;
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'scan');
  await self.onmessage({ data: { type: 'clean-all-metadata' } });
  assert.equal(messages.at(-1)?.type, 'cleaned');
});

const encode = (text: string) => new TextEncoder().encode(text);
const source = () => new Uint8Array(readFileSync(new URL('../tests/fixtures/progressive.jpg', import.meta.url)));
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};
const insert = (data: Uint8Array, marker: number, payload: Uint8Array) =>
  join(
    data.subarray(0, 2),
    new Uint8Array([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]),
    payload,
    data.subarray(2),
  );
test('genuine JPEG with XMP CreatorTool, model, prompt and seed: preview, consent, removal', async () => {
  const xmp = encode(
    'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:ai="urn:fixture:ai" xmp:CreatorTool="Fixture generator" ai:model="test-model" ai:prompt="blue mountain" ai:seed="42"/></rdf:RDF></x:xmpmeta>',
  );
  const original = source(),
    data = insert(original, 225, xmp),
    record = scanImage(data).records.find(r => r.kind === 'XMP')!;
  assert.match(record.preview, /CreatorTool.*test-model.*blue mountain.*42/);
  const result = await cleanImage(data, [record.id]);
  assert.deepEqual(result.data, original);
  assert.equal(result.removed, 1);
});
test('genuine JPEG Photoshop IPTC copyright resource remains unless explicitly authorized', async () => {
  // Photoshop Image Resource Block 0x0404 containing IIM dataset 2:116 (copyright notice).
  const value = encode('Copyright fixture owner');
  const iim = join(new Uint8Array([0x1c, 2, 116, 0, value.length]), value);
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, iim.length);
  const resource = join(
    encode('Photoshop 3.0\0'),
    encode('8BIM'),
    new Uint8Array([4, 4, 0, 0]),
    size,
    iim,
    ...(iim.length % 2 ? [new Uint8Array(1)] : []),
  );
  const original = source(),
    data = insert(original, 237, resource),
    record = scanImage(data).records.find(r => r.kind === 'IPTC')!;
  assert.equal(record.status, 'protected');
  assert.equal(record.requiresRightsConsent, true);
  assert.match(record.preview, /Copyright fixture owner/);
  assert.deepEqual((await cleanImage(data, [record.id])).data, original);
});

test('crc32 (slicing-by-8) matches zlib for every length and alignment', async () => {
  const { crc32 } = await import('./engine.ts');
  const { crc32: zlibCrc } = await import('node:zlib');
  const data = new Uint8Array(4099);
  for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
  for (const [start, end] of [
    [0, 0],
    [0, 1],
    [0, 7],
    [0, 8],
    [0, 9],
    [3, 4099],
    [1, 4096],
    [5, 13],
  ] as const) {
    const slice = data.subarray(start, end);
    assert.equal(crc32(slice), zlibCrc(slice), `${start}-${end}`);
  }
});
