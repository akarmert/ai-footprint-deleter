import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  scanImage,
  cleanImage,
  cleanC2pa,
  cleanFootprints,
  cleanAllMetadata,
  verifyOutput,
  isRemovable,
} from './engine.ts';
const fixture = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)));
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};
const bytes = (s: string) => new TextEncoder().encode(s);
function crc(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(kind: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  out.set(bytes(kind), 4);
  out.set(payload, 8);
  view.setUint32(out.length - 4, crc(out.subarray(4, out.length - 4)));
  return out;
}
function pngInsert(data: Uint8Array, kind: string, payload: Uint8Array): Uint8Array {
  return concat(data.subarray(0, 33), pngChunk(kind, payload), data.subarray(33));
}
function jpgInsert(data: Uint8Array, marker: number, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]);
  return concat(data.subarray(0, 2), header, payload, data.subarray(2));
}
function webpInsert(data: Uint8Array, kind: string, payload: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + payload.length + (payload.length % 2));
  chunk.set(bytes(kind));
  new DataView(chunk.buffer).setUint32(4, payload.length, true);
  chunk.set(payload, 8);
  const out = concat(data, chunk);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}
function pngPayload(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  for (let p = 8; p < data.length;) {
    const n = new DataView(data.buffer, data.byteOffset + p, 4).getUint32(0);
    if (String.fromCharCode(...data.subarray(p + 4, p + 8)) === 'IDAT') parts.push(data.subarray(p + 8, p + 8 + n));
    p += n + 12;
  }
  return concat(...parts);
}
for (const ext of ['jpg', 'png', 'webp']) {
  test(`genuine ${ext}: scan and exact non-recompressing removal`, async () => {
    const original = fixture(`image-1.${ext}`),
      copy = original.slice(),
      scan = scanImage(original);
    assert.equal(scan.width, 24);
    assert.equal(scan.height, 16);
    assert.equal(scan.alpha, ext !== 'jpg');
    assert.equal(scan.orientation, 1);
    assert.ok(scan.records.some(r => r.kind === 'ICC' && r.status === 'protected'));
    assert.match(
      scan.records.find(r => r.kind === 'EXIF')!.preview,
      /Fixture software.*Fixture creator|Fixture creator.*Fixture software/,
    );
    const selected = scan.records.filter(r => r.requiresRightsConsent).map(r => r.id);
    await assert.rejects(cleanImage(original, selected, false), /onay/);
    const result = await cleanImage(original, selected, true);
    assert.deepEqual(original, copy);
    assert.equal(result.removed, selected.length);
    assert.equal(result.scan.records.filter(r => r.requiresRightsConsent).length, 0);
    assert.ok(result.scan.records.some(r => r.kind === 'ICC'));
    assert.match(result.payloadHash, /^[a-f0-9]{64}$/);
    const same = await cleanImage(original, [], false);
    assert.deepEqual(same.data, original);
    assert.equal(result.payloadHash, same.payloadHash);
    if (ext === 'png')
      assert.equal(result.payloadHash, createHash('sha256').update(pngPayload(original)).digest('hex'));
  });
  test(`${ext} orientation protected independently of consent`, async () => {
    const data = fixture(`image-6.${ext}`),
      scan = scanImage(data),
      exif = scan.records.find(r => r.kind === 'EXIF')!;
    assert.equal(scan.orientation, 6);
    assert.equal(exif.status, 'protected');
    await assert.rejects(cleanImage(data, [exif.id], true));
    const result = await cleanImage(
      data,
      scan.records.filter(r => r.requiresRightsConsent).map(r => r.id),
      true,
    );
    assert.equal(result.scan.orientation, 6);
  });
}
for (const ext of ['jpg', 'png', 'webp']) {
  test(`${ext} explicit comprehensive policy compared with safe on real ICC fixture`, async () => {
    const data = fixture(`image-1.${ext}`),
      scan = scanImage(data);
    const safeIds = scan.records.filter(r => isRemovable(r, 'safe')).map(r => r.id);
    const allIds = scan.records.filter(r => isRemovable(r, 'comprehensive')).map(r => r.id);
    const safe = await cleanImage(data, safeIds, true);
    const full = await cleanImage(data, allIds, true, 'comprehensive');
    assert.equal(safe.mode, 'safe');
    assert.equal(full.mode, 'comprehensive');
    assert.equal(full.payloadHash, safe.payloadHash);
    for (const key of ['width', 'height', 'orientation', 'alpha'] as const) assert.equal(full.scan[key], scan[key]);
    assert.equal(full.removed, allIds.length);
    assert.equal(full.retained, scan.records.length - allIds.length);
    assert.ok(safe.scan.records.some(r => r.kind === 'ICC'));
    assert.equal(
      full.scan.records.some(r => r.kind === 'ICC'),
      ext === 'png',
    );
    if (ext !== 'png') {
      await assert.rejects(verifyOutput(data, full.data, allIds, true, 'safe'));
      await assert.rejects(
        cleanImage(
          data,
          scan.records.filter(r => r.kind === 'ICC').map(r => r.id),
          false,
          'comprehensive',
        ),
        /onay/,
      );
    }
    assert.equal((await verifyOutput(data, full.data, allIds, true, 'comprehensive')).removed, allIds.length);
    const again = await cleanImage(full.data, [], false, 'comprehensive');
    assert.deepEqual(again.data, full.data);
    await assert.rejects(cleanImage(data, [], true, 'invalid' as never), /modu/);
    await assert.rejects(cleanImage(data.subarray(0, 30), [], true, 'comprehensive'));
  });
}
test('ICC-free genuine images and tampered comprehensive output remain guarded', async () => {
  for (const name of ['progressive.jpg', 'palette.png', 'lossless.webp']) {
    const data = fixture(name),
      scan = scanImage(data);
    const result = await cleanImage(
      data,
      scan.records.filter(r => isRemovable(r, 'comprehensive')).map(r => r.id),
      true,
      'comprehensive',
    );
    assert.equal(result.scan.width, scan.width);
    assert.equal(result.scan.alpha, scan.alpha);
  }
  const data = fixture('image-1.webp'),
    ids = scanImage(data)
      .records.filter(r => isRemovable(r, 'comprehensive'))
      .map(r => r.id);
  const result = await cleanImage(data, ids, true, 'comprehensive'),
    bad = result.data.slice();
  bad[20]! |= 32;
  await assert.rejects(verifyOutput(data, bad, ids, true, 'comprehensive'));
  const jpeg = fixture('image-1.jpg'),
    partial = scanImage(jpeg)
      .records.filter(r => r.kind === 'ICC')
      .map(r => r.id);
  const full = await cleanImage(jpeg, partial, true, 'comprehensive');
  const corrupt = full.data.slice();
  corrupt[corrupt.length - 4]! ^= 1;
  await assert.rejects(verifyOutput(jpeg, corrupt, partial, true, 'comprehensive'));
});
test('comprehensive rejects provenance in every format', async () => {
  for (const data of [
    jpgInsert(fixture('image-1.jpg'), 235, bytes('c2pa')),
    pngInsert(fixture('image-1.png'), 'caBX', bytes('manifest')),
    webpInsert(fixture('image-1.webp'), 'C2PA', bytes('manifest')),
  ]) {
    await assert.rejects(
      cleanImage(
        data,
        scanImage(data).records.map(r => r.id),
        true,
        'comprehensive',
      ),
      /provenance/,
    );
  }
});
test('comprehensive preserves orientation and rejects malformed JPEG ICC and unsafe JFIF', async () => {
  const oriented = fixture('image-6.jpg'),
    scan = scanImage(oriented);
  const full = await cleanImage(
    oriented,
    scan.records.filter(r => isRemovable(r, 'comprehensive')).map(r => r.id),
    true,
    'comprehensive',
  );
  assert.equal(full.scan.orientation, 6);
  const bad = jpgInsert(fixture('progressive.jpg'), 226, bytes('ICC_PROFILE\0\x01\x01broken'));
  const icc = scanImage(bad).records.find(r => r.kind === 'ICC')!;
  assert.equal(icc.comprehensiveOnly, undefined);
  await assert.rejects(cleanImage(bad, [icc.id], true, 'comprehensive'));
  const jfif = jpgInsert(fixture('progressive.jpg'), 224, bytes('JFIF\0broken'));
  for (const r of scanImage(jfif).records.filter(r => r.kind === 'JFIF' && !r.comprehensiveOnly))
    await assert.rejects(cleanImage(jfif, [r.id], true, 'comprehensive'));
});
test('progressive JPEG, lossless WebP and palette transparency', () => {
  assert.equal(scanImage(fixture('progressive.jpg')).width, 24);
  assert.equal(scanImage(fixture('lossless.webp')).alpha, true);
  assert.equal(scanImage(fixture('palette.png')).alpha, true);
});
test('caller IDs, duplicate selection, protected ICC, consent type', async () => {
  const data = fixture('image-1.png'),
    scan = scanImage(data),
    id = scan.records.find(r => r.requiresRightsConsent)!.id;
  for (const ids of [['missing'], [id, id], [scan.records.find(r => r.kind === 'ICC')!.id]])
    await assert.rejects(cleanImage(data, ids, true));
  await assert.rejects(cleanImage(data, [], 'yes' as unknown as boolean));
});
test('C2PA and opaque APP11 block ANY cleaning including no-op', async () => {
  for (const data of [
    pngInsert(fixture('image-1.png'), 'caBX', bytes('c2pa')),
    jpgInsert(fixture('progressive.jpg'), 235, bytes('opaque jumb')),
    webpInsert(fixture('lossless.webp'), 'C2PA', bytes('manifest')),
  ]) {
    const scan = scanImage(data);
    assert.equal(scan.c2pa, 'detected-not-verified');
    assert.equal(scan.cleaningBlocked, true);
    await assert.rejects(cleanImage(data, [], true), /provenance/);
  }
});
test('text provenance blocks, unknown chunks retained', async () => {
  const data = pngInsert(fixture('image-1.png'), 'vpAg', bytes('unknown bytes'));
  const scan = scanImage(data);
  assert.equal(scan.records.find(r => r.kind === 'vpAg')!.status, 'protected');
  const result = await cleanImage(
    data,
    scan.records.filter(r => r.kind === 'PNG text').map(r => r.id),
    true,
  );
  assert.ok(result.scan.records.some(r => r.kind === 'vpAg'));
  assert.equal(scanImage(pngInsert(data, 'tEXt', bytes('Comment\0c2pa manifest'))).cleaningBlocked, true);
});
test('compressed PNG text unsupported and protected', async () => {
  const data = pngInsert(fixture('image-1.png'), 'zTXt', new Uint8Array([65, 0, 0, 120, 156, 0]));
  const r = scanImage(data).records.find(r => r.kind === 'Compressed PNG text')!;
  assert.equal(r.status, 'unsupported');
  await assert.rejects(cleanImage(data, [r.id], true));
});
test('unknown EXIF parsing protected', async () => {
  const data = jpgInsert(fixture('progressive.jpg'), 225, bytes('Exif\0\0broken'));
  const scan = scanImage(data);
  assert.equal(scan.orientation, null);
  assert.equal(scan.records[0]!.status, 'protected');
  await assert.rejects(cleanImage(data, [scan.records[0]!.id], true));
});
test('XMP orientation and rights protected conservatively', async () => {
  const data = jpgInsert(
    fixture('progressive.jpg'),
    225,
    bytes('http://ns.adobe.com/xap/1.0/\0<tiff:Orientation>6</tiff:Orientation>'),
  );
  const r = scanImage(data).records[0]!;
  assert.equal(r.status, 'protected');
  await assert.rejects(cleanImage(data, [r.id], true));
  const ordinary = jpgInsert(
    fixture('progressive.jpg'),
    225,
    bytes('http://ns.adobe.com/xap/1.0/\0<dc:rights>copyright</dc:rights>'),
  );
  const id = scanImage(ordinary).records[0]!.id;
  await assert.rejects(cleanImage(ordinary, [id], false));
  assert.equal((await cleanImage(ordinary, [id], true)).removed, 1);
});
test('PNG CRC/order/critical/animation/trailing/truncation rejected', () => {
  const data = fixture('image-1.png'),
    corrupt = data.slice();
  corrupt[45]! ^= 1;
  for (const bad of [
    corrupt,
    data.subarray(0, data.length - 1),
    concat(data, bytes('tail')),
    pngInsert(data, 'acTL', new Uint8Array(8)),
    pngInsert(data, 'ABCD', bytes('unknown')),
    pngInsert(data, 'IHDR', data.subarray(16, 29)),
    pngInsert(data, 'tEXt', bytes('no separator')),
  ])
    assert.throws(() => scanImage(bad));
});
test('JPEG truncation, trailing bytes and bad frame rejected', () => {
  const data = fixture('progressive.jpg');
  for (const bad of [
    data.subarray(0, data.length - 2),
    concat(data, bytes('tail')),
    jpgInsert(data, 192, new Uint8Array(9)),
    jpgInsert(data, 218, new Uint8Array(6)),
  ])
    assert.throws(() => scanImage(bad));
});
test('WebP RIFF flags, duplicate image, padding, animation rejected', () => {
  const data = fixture('image-1.webp'),
    flags = data.slice();
  flags[20]! ^= 8;
  const size = data.slice();
  size[4]! ^= 1;
  const padding = webpInsert(fixture('lossless.webp'), 'zzzz', bytes('a'));
  padding[padding.length - 1] = 1;
  for (const bad of [
    flags,
    size,
    padding,
    webpInsert(data, 'ANIM', new Uint8Array(6)),
    webpInsert(data, 'VP8L', new Uint8Array(5)),
  ])
    assert.throws(() => scanImage(bad));
});
test('post-scan JPEG comment removed without recompression', async () => {
  const source = fixture('progressive.jpg'),
    segment = new Uint8Array([255, 254, 0, 6, 116, 101, 115, 116]);
  const data = concat(source.subarray(0, source.length - 2), segment, source.subarray(source.length - 2));
  const r = scanImage(data).records.find(r => r.kind === 'Comment')!;
  assert.deepEqual((await cleanImage(data, [r.id], true)).data, source);
});
test('embedded PNG XMP orientation and oversized text cannot be removed', async () => {
  for (const payload of [
    bytes('XML:com.adobe.xmp\0<tiff:Orientation>6</tiff:Orientation>'),
    bytes('raw profile type exif\0hidden'),
    bytes('Comment\0' + 'x'.repeat(1024 * 1024)),
  ]) {
    const data = pngInsert(fixture('palette.png'), 'tEXt', payload);
    const r = scanImage(data).records.find(r => r.kind === 'PNG text' || r.kind === 'XMP')!;
    assert.equal(r.status, 'protected');
    assert.equal(r.requiresRightsConsent, false);
    await assert.rejects(cleanImage(data, [r.id], true));
  }
});
test('cyclic TIFF, duplicate EXIF and malformed ICC rejected or permanently protected', async () => {
  const tiff = new Uint8Array([73, 73, 42, 0, 8, 0, 0, 0, 0, 0, 8, 0, 0, 0]);
  const malformed = jpgInsert(fixture('progressive.jpg'), 225, concat(bytes('Exif\0\0'), tiff));
  assert.equal(scanImage(malformed).orientation, null);
  const dup = jpgInsert(fixture('image-1.jpg'), 225, concat(bytes('Exif\0\0'), tiff));
  for (const r of scanImage(dup).records.filter(r => r.kind === 'EXIF')) {
    assert.equal(r.requiresRightsConsent, false);
    await assert.rejects(cleanImage(dup, [r.id], true));
  }
  assert.throws(() => scanImage(pngInsert(fixture('palette.png'), 'iCCP', bytes('invalid'))));
});
test('UTF16/32 XMP orientation and provenance cannot bypass guards', async () => {
  for (const stride of [2, 4])
    for (const be of [false, true])
      for (const value of ['<tiff:Orientation>6</tiff:Orientation>', '<c2pa:manifest>opaque</c2pa:manifest>']) {
        const encoded = new Uint8Array(value.length * stride + stride);
        if (stride === 2) {
          encoded[be ? 0 : 1] = 254;
          encoded[be ? 1 : 0] = 255;
        } else {
          encoded[be ? 2 : 1] = 254;
          encoded[be ? 3 : 0] = 255;
        }
        for (let i = 0; i < value.length; i++)
          encoded[stride + i * stride + (be ? stride - 1 : 0)] = value.charCodeAt(i);
        const data = jpgInsert(
          fixture('progressive.jpg'),
          225,
          concat(bytes('http://ns.adobe.com/xap/1.0/\0'), encoded),
        );
        assert.equal(scanImage(data).cleaningBlocked, true);
        await assert.rejects(cleanImage(data, [], true));
      }
});
test('invalid UTF8, entities and nonUTF8 declarations block opaque XMP', async () => {
  for (const xml of [
    new Uint8Array([60, 255, 62]),
    bytes('<?xml encoding="UTF-16"?><rdf:RDF/>'),
    bytes('<rdf:Description tiff:Orien&#116;ation="6"/>'),
    bytes('<!DOCTYPE x><x>&hidden;</x>'),
  ]) {
    const data = jpgInsert(fixture('progressive.jpg'), 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), xml));
    assert.equal(scanImage(data).cleaningBlocked, true);
    await assert.rejects(cleanImage(data, [], true));
  }
});
test('provenance detection precedes oversized/raw/compressed text guards', async () => {
  for (const payload of [
    bytes('Comment\0' + 'x'.repeat(1024 * 1024 + 10) + 'c2pa'),
    bytes('raw profile type exif\0c2pa'),
    bytes('XML:com.adobe.xmp\0c2pa'),
  ]) {
    const data = pngInsert(fixture('palette.png'), 'tEXt', payload);
    assert.equal(scanImage(data).c2pa, 'detected-not-verified');
    await assert.rejects(cleanImage(data, [], true));
  }
  const compressed = pngInsert(
    fixture('palette.png'),
    'zTXt',
    concat(bytes('XML:com.adobe.xmp\0'), new Uint8Array([0, 120, 156, 0])),
  );
  assert.equal(scanImage(compressed).cleaningBlocked, true);
  await assert.rejects(cleanImage(compressed, [], true));
});
test('independent verification rejects malicious retained payload and metadata bytes', async () => {
  const original = fixture('image-1.png'),
    ids = scanImage(original)
      .records.filter(r => r.kind === 'PNG text')
      .map(r => r.id),
    good = (await cleanImage(original, ids, true)).data;
  assert.equal((await verifyOutput(original, good, ids, true)).removed, ids.length);
  for (const kind of ['IDAT', 'iCCP']) {
    const bad = good.slice();
    for (let p = 8; p < bad.length;) {
      const n = new DataView(bad.buffer).getUint32(p);
      if (String.fromCharCode(...bad.subarray(p + 4, p + 8)) === kind) {
        bad[p + 8 + n - 1]! ^= 1;
        new DataView(bad.buffer).setUint32(p + 8 + n, crc(bad.subarray(p + 4, p + 8 + n)));
        break;
      }
      p += n + 12;
    }
    await assert.rejects(verifyOutput(original, bad, ids, true), /baytları/);
  }
  await assert.rejects(verifyOutput(original, good, [], true));
  await assert.rejects(verifyOutput(original, good, ids, false));
});
test('hash rejection never returns a verified result', async () => {
  const digest = globalThis.crypto.subtle.digest;
  globalThis.crypto.subtle.digest = (() => Promise.reject(new Error('fixture hash failure'))) as typeof digest;
  try {
    await assert.rejects(cleanImage(fixture('palette.png'), [], true), /fixture hash failure/);
  } finally {
    globalThis.crypto.subtle.digest = digest;
  }
});
function jumbBox(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(bytes(type), 4);
  out.set(payload, 8);
  return out;
}
function c2paStore(): Uint8Array {
  const uuid = new Uint8Array([0x63, 0x32, 0x70, 0x61, 0, 0x11, 0, 0x10, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71]);
  const manifestUuid = uuid.slice();
  manifestUuid[2] = 0x6d;
  return jumbBox(
    'jumb',
    concat(
      jumbBox('jumd', concat(uuid, new Uint8Array([3]), bytes('c2pa\0'))),
      jumbBox(
        'jumb',
        concat(
          jumbBox('jumd', concat(manifestUuid, new Uint8Array([3]), bytes('manifest\0'))),
          jumbBox('cbor', new Uint8Array([0xa0])),
        ),
      ),
    ),
  );
}
function app11(store: Uint8Array, sequence = 1, fragment = store.subarray(8)): Uint8Array {
  const header = new Uint8Array(8);
  header.set([74, 80, 0, 1]);
  new DataView(header.buffer).setUint32(4, sequence);
  return concat(header, store.subarray(0, 8), fragment);
}
for (const ext of ['jpg', 'png', 'webp'])
  test(`${ext} C2PA-only atomic removal preserves all other bytes and rejects normal cleaning`, async () => {
    const original = fixture(`image-6.${ext}`),
      store = c2paStore();
    const data =
      ext === 'jpg'
        ? jpgInsert(original, 235, app11(store))
        : ext === 'png'
          ? pngInsert(original, 'caBX', store)
          : webpInsert(original, 'C2PA', store);
    const copy = data.slice(),
      scan = scanImage(data);
    assert.equal(scan.c2paRemovable, true);
    assert.equal(scan.cleaningBlocked, true);
    for (const consent of [false, undefined, 'true', 1])
      await assert.rejects(cleanC2pa(data, consent as boolean), /onay/);
    await assert.rejects(cleanImage(data, [], true));
    await assert.rejects(verifyOutput(data, original, [], true));
    const result = await cleanC2pa(data, true);
    assert.deepEqual(result.data, original);
    assert.deepEqual(data, copy);
    assert.equal(result.operation, 'c2pa-store-removal');
    assert.equal(result.removed, 1);
    assert.equal(result.scan.cleaningBlocked, false);
    assert.equal(result.scan.c2pa, 'not-detected-not-guaranteed');
    assert.equal(result.scan.orientation, 6);
    assert.equal(result.payloadHash, (await cleanImage(original, [], false)).payloadHash);
  });
test('C2PA removal rejects mixed independent blockers regardless of metadata order', async () => {
  const base = jpgInsert(fixture('progressive.jpg'), 235, app11(c2paStore()));
  for (const payload of [
    bytes('unknown APP1'),
    bytes('http://ns.adobe.com/xap/1.0/\0<x>&opaque;</x>'),
    bytes('http://ns.adobe.com/xap/1.0/\0<dcterms : provenance>remote</dcterms : provenance>'),
  ]) {
    const data = jpgInsert(base, 225, payload);
    assert.equal(scanImage(data).c2paRemovable, false);
    await assert.rejects(cleanC2pa(data, true));
  }
  for (const [kind, payload] of [
    ['zTXt', new Uint8Array([65, 0, 0, 120, 156, 0])],
    ['tEXt', bytes('raw profile type exif\0hidden')],
    ['tEXt', bytes('Comment\0' + 'x'.repeat(1024 * 1024 + 1))],
    ['tEXt', bytes('Comment\0dcterms:provenance')],
  ] as const) {
    const data = pngInsert(pngInsert(fixture('palette.png'), kind, payload), 'caBX', c2paStore());
    assert.equal(scanImage(data).c2paRemovable, false);
    await assert.rejects(cleanC2pa(data, true));
  }
});
test('malformed unbound XMP self pointer remains blocked, not a second APP11 store part', async () => {
  const original = fixture('progressive.jpg');
  // Literal XMP pointer pattern observed in the official legacy Adobe JPEG; no source media is distributed.
  const xmp = bytes(
    'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><rdf:RDF><rdf:Description xmlns:dcterms="http://purl.org/dc/terms/" dcterms:provenance="self#jumbf=/c2pa/contentauth:urn:uuid:4d971750-1db4-4492-a87c-5c3e7ed33efc/c2pa.claim"/></rdf:RDF></x:xmpmeta>',
  );
  const supported = jpgInsert(original, 235, app11(c2paStore()));
  assert.equal(scanImage(supported).c2paRemovable, true);
  for (const data of [
    jpgInsert(supported, 225, xmp),
    jpgInsert(jpgInsert(original, 225, xmp), 235, app11(c2paStore())),
  ]) {
    const scan = scanImage(data);
    assert.equal(scan.records.filter(r => r.kind === 'C2PA / opaque provenance').length, 1);
    assert.equal(scan.c2paDecision?.code, 'BLOCKED_MALFORMED_METADATA');
    assert.equal(scan.cleaningBlocked, true);
    assert.equal(scan.c2paRemovable, false);
    await assert.rejects(cleanC2pa(data, true), /diğer provenance/);
    await assert.rejects(cleanImage(data, [], true), /provenance/);
  }
});
function referenceStore(): Uint8Array {
  const uuid = (type: string) => concat(bytes(type), new Uint8Array([0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113]));
  const sb = (type: string, label: string, content: Uint8Array) =>
    jumbBox('jumb', concat(jumbBox('jumd', concat(uuid(type), new Uint8Array([3]), bytes(label + '\0'))), content));
  return sb('c2pa', 'c2pa', sb('c2ma', 'manifest', sb('c2cl', 'c2pa.claim', jumbBox('cbor', new Uint8Array([0xa0])))));
}
function localXmp(value = 'self#jumbf=/c2pa/manifest/c2pa.claim', extra = ''): Uint8Array {
  return bytes(
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Fixture"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:p="http://purl.org/dc/terms/" xmlns:dc="http://purl.org/dc/elements/1.1/" dc:rights="A &amp; B — Türkçe" p:provenance="${value}" ${extra}/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`,
  );
}
for (const ext of ['jpg', 'png', 'webp'])
  test(`${ext} local XMP reference removed atomically without unrelated metadata loss`, async () => {
    const original = fixture(`image-6.${ext}`),
      xml = localXmp(),
      store = referenceStore();
    let data: Uint8Array;
    if (ext === 'jpg')
      data = jpgInsert(
        jpgInsert(original, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), xml)),
        235,
        app11(store),
      );
    else if (ext === 'png')
      data = pngInsert(pngInsert(original, 'tEXt', concat(bytes('XML:com.adobe.xmp\0'), xml)), 'caBX', store);
    else {
      data = webpInsert(webpInsert(original, 'XMP ', xml), 'C2PA', store);
      data[20]! |= 4;
    }
    const copy = data.slice(),
      scan = scanImage(data);
    assert.equal(scan.c2paDecision?.code, 'SUPPORTED_WITH_LOCAL_XMP_REFERENCE');
    assert.equal(scan.cleaningBlocked, true);
    await assert.rejects(cleanImage(data, [], true));
    await assert.rejects(cleanC2pa(data, false));
    const result = await cleanC2pa(data, true);
    assert.deepEqual(data, copy);
    assert.equal(result.changedFields?.length, 1);
    assert.equal(result.removed, 1);
    assert.equal(result.scan.cleaningBlocked, false);
    assert.equal(result.scan.c2paDecision?.code, 'NO_EMBEDDED_MANIFEST');
    assert.equal(result.scan.orientation, 6);
    assert.ok(new TextDecoder().decode(result.data).includes('A &amp; B — Türkçe'));
    assert.equal(new TextDecoder().decode(result.data).includes('self#jumbf='), false);
    assert.equal(result.payloadHash, (await cleanImage(original, [], false)).payloadHash);
  });
test('external, repeated and mismatching XMP references stay blocked with reason codes', async () => {
  const base = jpgInsert(fixture('progressive.jpg'), 235, app11(referenceStore()));
  for (const [value, extra, code] of [
    ['https://example.invalid/manifest.c2pa', '', 'BLOCKED_EXTERNAL_REFERENCE'],
    ['self#jumbf=/c2pa/other', '', 'BLOCKED_AMBIGUOUS_PROVENANCE'],
    [
      'self#jumbf=/c2pa/manifest',
      'xmlns:q="http://purl.org/dc/terms/" q:provenance="self#jumbf=/c2pa/manifest"',
      'BLOCKED_MALFORMED_METADATA',
    ],
  ]) {
    const data = jpgInsert(base, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), localXmp(value, extra)));
    assert.equal(scanImage(data).c2paDecision?.code, code);
    await assert.rejects(cleanC2pa(data, true));
  }
});
test('multiple packets and separate valid provenance properties cannot be partially removed', async () => {
  const base = jpgInsert(fixture('progressive.jpg'), 235, app11(referenceStore()));
  const packet = concat(bytes('http://ns.adobe.com/xap/1.0/\0'), localXmp());
  const multiple = jpgInsert(jpgInsert(base, 225, packet), 225, packet);
  assert.equal(scanImage(multiple).c2paDecision?.code, 'BLOCKED_AMBIGUOUS_PROVENANCE');
  await assert.rejects(cleanC2pa(multiple, true));
  const xml = new TextDecoder()
    .decode(localXmp())
    .replace('/></rdf:RDF>', '><p:provenance>self#jumbf=/c2pa/manifest</p:provenance></rdf:Description></rdf:RDF>');
  const repeated = jpgInsert(base, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), bytes(xml)));
  assert.equal(scanImage(repeated).c2paDecision?.code, 'BLOCKED_AMBIGUOUS_PROVENANCE');
  await assert.rejects(cleanC2pa(repeated, true));
});
test('PNG uncompressed iTXt XMP local reference preserves language header and semantic fields', async () => {
  const header = bytes('XML:com.adobe.xmp\0\0\0en\0Description\0'),
    xml = localXmp();
  const data = pngInsert(pngInsert(fixture('palette.png'), 'iTXt', concat(header, xml)), 'caBX', referenceStore());
  assert.equal(scanImage(data).c2paRemovable, true);
  const result = await cleanC2pa(data, true);
  assert.ok(new TextDecoder().decode(result.data).includes('en\0Description\0'));
  assert.equal(result.scan.cleaningBlocked, false);
});
test('decoded XMP hints and container headers cannot bypass conservative guards', async () => {
  const wrap = (value: string) =>
    bytes(
      `<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:d="urn:test" d:value="${value}"/></r:RDF>`,
    );
  const base = fixture('progressive.jpg');
  for (const value of ['&#99;2pa', 'Orien&#116;ation=6']) {
    const data = jpgInsert(base, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), wrap(value)));
    const scan = scanImage(data);
    assert.equal(scan.records[0]!.status, 'protected');
    await assert.rejects(cleanImage(data, [scan.records[0]!.id], true));
    const withStore = jpgInsert(data, 235, app11(referenceStore()));
    assert.equal(scanImage(withStore).c2paRemovable, false);
  }
  const ns = bytes(
    '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:unused="http://&#99;2pa.org/ns"><r:Description/></r:RDF>',
  );
  assert.equal(
    scanImage(jpgInsert(base, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), ns))).cleaningBlocked,
    true,
  );
  const header = pngInsert(
    fixture('palette.png'),
    'iTXt',
    concat(bytes('XML:com.adobe.xmp\0\0\0en\0c2pa\0'), wrap('ok')),
  );
  assert.equal(scanImage(header).c2pa, 'detected-not-verified');
  const oversized = pngInsert(
    fixture('palette.png'),
    'tEXt',
    bytes('XML:com.adobe.xmp\0' + 'x'.repeat(1024 * 1024 + 10) + 'c2pa'),
  );
  assert.equal(scanImage(oversized).c2pa, 'detected-not-verified');
});
test('decision reasons distinguish missing local target and legacy whole-block metadata', () => {
  const base = fixture('progressive.jpg');
  const legacy = jpgInsert(base, 225, bytes('http://ns.adobe.com/xap/1.0/\0<dc:rights>copyright</dc:rights>'));
  assert.equal(scanImage(legacy).c2paDecision?.code, 'NO_EMBEDDED_MANIFEST');
  const dangling = jpgInsert(base, 225, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), localXmp()));
  assert.equal(scanImage(dangling).c2paDecision?.code, 'BLOCKED_AMBIGUOUS_PROVENANCE');
});
test('C2PA store rejects malformed UUID/length, duplicate and misplaced containers', async () => {
  const store = c2paStore(),
    wrong = store.slice();
  wrong[16]! ^= 1;
  const badLength = store.slice();
  new DataView(badLength.buffer).setUint32(0, 1);
  const png = fixture('palette.png'),
    webp = fixture('lossless.webp'),
    jpg = fixture('progressive.jpg');
  const segment = jpgInsert(new Uint8Array([255, 216]), 235, app11(store)).subarray(2);
  for (const data of [
    pngInsert(png, 'caBX', wrong),
    pngInsert(png, 'caBX', badLength),
    pngInsert(pngInsert(png, 'caBX', store), 'caBX', store),
    concat(png.subarray(0, png.length - 12), pngChunk('caBX', store), png.subarray(png.length - 12)),
    webpInsert(webpInsert(webp, 'C2PA', store), 'C2PA', store),
    webpInsert(webpInsert(webp, 'C2PA', store), 'zzzz', bytes('a')),
    jpgInsert(jpg, 235, app11(store, 2)),
    jpgInsert(jpg, 235, app11(store, 1, store.subarray(8, 20))),
    jpgInsert(jpgInsert(jpg, 235, app11(store)), 226, bytes('MPF\0test')),
    concat(jpg.subarray(0, jpg.length - 2), segment, jpg.subarray(jpg.length - 2)),
    concat(
      jpgInsert(jpg, 235, app11(store)).subarray(0, jpgInsert(jpg, 235, app11(store)).length - 2),
      segment,
      jpg.subarray(jpg.length - 2),
    ),
  ]) {
    assert.equal(scanImage(data).c2paRemovable, false);
    await assert.rejects(cleanC2pa(data, true));
  }
});
test('JPEG split APP11 store is all-or-nothing, consistent and contiguous', async () => {
  const store = c2paStore(),
    jpg = fixture('progressive.jpg'),
    split = 30;
  const good = jpgInsert(
    jpgInsert(jpg, 235, app11(store, 2, store.subarray(split))),
    235,
    app11(store, 1, store.subarray(8, split)),
  );
  assert.equal(scanImage(good).c2paRemovable, true);
  const result = await cleanC2pa(good, true);
  assert.equal(result.removed, 2);
  assert.deepEqual(result.data, jpg);
  const separated = jpgInsert(
    jpgInsert(jpgInsert(jpg, 235, app11(store, 2, store.subarray(split))), 254, bytes('gap')),
    235,
    app11(store, 1, store.subarray(8, split)),
  );
  assert.equal(scanImage(separated).c2paRemovable, false);
  await assert.rejects(cleanC2pa(separated, true));
});
test('preview and count limits', () => {
  const data = pngInsert(fixture('palette.png'), 'tEXt', bytes('Comment\0' + 'x'.repeat(10000)));
  assert.ok(scanImage(data).records.every(r => r.preview.length <= 512));
  let many = fixture('palette.png');
  const chunk = pngChunk('vpAg', new Uint8Array());
  many = concat(many.subarray(0, 33), ...Array.from({ length: 4096 }, () => chunk), many.subarray(33));
  assert.throws(() => scanImage(many), /sayısı/);
});

// --- JPEG Multi-Picture Format (MPF / Ultra HDR gain-map style) ---
function mpfPayload(little: boolean, sizes: number[], offsets: number[]): Uint8Array {
  const tags = 3,
    entryOffset = 8 + 2 + tags * 12 + 4,
    n = sizes.length;
  const t = new Uint8Array(entryOffset + 16 * n),
    v = new DataView(t.buffer);
  t.set(bytes(little ? 'II' : 'MM'));
  v.setUint16(2, 42, little);
  v.setUint32(4, 8, little);
  v.setUint16(8, tags, little);
  const tag = (i: number, id: number, type: number, count: number, value: number | Uint8Array) => {
    const e = 10 + i * 12;
    v.setUint16(e, id, little);
    v.setUint16(e + 2, type, little);
    v.setUint32(e + 4, count, little);
    if (typeof value === 'number') v.setUint32(e + 8, value, little);
    else t.set(value, e + 8);
  };
  tag(0, 0xb000, 7, 4, bytes('0100'));
  tag(1, 0xb001, 4, 1, n);
  tag(2, 0xb002, 7, 16 * n, entryOffset);
  sizes.forEach((size, i) => {
    const e = entryOffset + 16 * i;
    v.setUint32(e, i ? 0 : 0x030000, little);
    v.setUint32(e + 4, size, little);
    v.setUint32(e + 8, offsets[i]!, little);
  });
  return concat(bytes('MPF\0'), t);
}
/** Inserts an APP2 MPF segment at byte `at` of the primary JPEG and appends the secondary JPEGs. */
function mpfFile(
  primary: Uint8Array,
  secondaries: Uint8Array[],
  {
    at = 2,
    little = false,
    tamper,
  }: { at?: number; little?: boolean; tamper?: (sizes: number[], offsets: number[]) => void } = {},
): Uint8Array {
  const count = Math.max(2, secondaries.length + 1);
  const segmentLength = 4 + mpfPayload(little, new Array(count).fill(0), new Array(count).fill(0)).length;
  const base = at + 4 + 4,
    primarySize = primary.length + segmentLength;
  const sizes = [primarySize, ...secondaries.map(s => s.length)],
    offsets = [0];
  let pos = primarySize;
  for (const s of secondaries) {
    offsets.push(pos - base);
    pos += s.length;
  }
  while (sizes.length < count) {
    sizes.push(0);
    offsets.push(0);
  }
  tamper?.(sizes, offsets);
  const payload = mpfPayload(little, sizes, offsets);
  return concat(
    primary.subarray(0, at),
    new Uint8Array([255, 226, (payload.length + 2) >> 8, (payload.length + 2) & 255]),
    payload,
    primary.subarray(at),
    ...secondaries,
  );
}
function mpfEntries(data: Uint8Array): { little: boolean; base: number; sizes: number[]; offsets: number[] } {
  let p = 2;
  while (!(data[p + 1] === 0xe2 && String.fromCharCode(...data.subarray(p + 4, p + 8)) === 'MPF\0'))
    p += 2 + ((data[p + 2]! << 8) | data[p + 3]!);
  const base = p + 8,
    v = new DataView(data.buffer, data.byteOffset + base),
    little = data[base] === 73;
  const ifd = v.getUint32(4, little),
    n = v.getUint16(ifd, little);
  let entryOffset = 0,
    count = 0;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12,
      id = v.getUint16(e, little);
    if (id === 0xb002) entryOffset = v.getUint32(e + 8, little);
    if (id === 0xb001) count = v.getUint32(e + 8, little);
  }
  return {
    little,
    base,
    sizes: Array.from({ length: count }, (_, i) => v.getUint32(entryOffset + i * 16 + 4, little)),
    offsets: Array.from({ length: count }, (_, i) => v.getUint32(entryOffset + i * 16 + 8, little)),
  };
}
function assertMpfConsistent(data: Uint8Array, secondaries: Uint8Array[]) {
  const { base, sizes, offsets } = mpfEntries(data);
  assert.equal(offsets[0], 0);
  let pos = sizes[0]!;
  secondaries.forEach((s, i) => {
    assert.equal(base + offsets[i + 1]!, pos);
    assert.equal(sizes[i + 1], s.length);
    assert.deepEqual(data.subarray(pos, pos + s.length), s);
    pos += s.length;
  });
  assert.equal(pos, data.length);
}

for (const little of [false, true])
  test(`MPF ${little ? 'little' : 'big'}-endian: secondary images are scanned as retained image data`, async () => {
    const gain = fixture('progressive.jpg'),
      data = mpfFile(fixture('image-1.jpg'), [gain], { little });
    const scan = scanImage(data);
    assert.equal(scan.width, 24);
    assert.equal(scan.cleaningBlocked, false);
    const mpf = scan.records.find(r => r.kind === 'MPF')!;
    assert.equal(mpf.status, 'protected');
    assert.equal(isRemovable(mpf, 'comprehensive'), false);
    assert.ok(scan.notes.some(n => /MPF/.test(n)));
    // The MPF index itself adds no "incomplete inspection"; only the primary's own records do.
    assert.equal(scan.footprints?.incomplete, scanImage(fixture('image-1.jpg')).footprints?.incomplete);
    // Removing EXIF shrinks the primary; the MPF primary size and secondary offset follow it.
    const ids = scan.records.filter(r => r.requiresRightsConsent).map(r => r.id);
    assert.ok(ids.length > 0);
    const result = await cleanImage(data, ids, true);
    assert.ok(result.data.length < data.length);
    assertMpfConsistent(result.data, [gain]);
    assert.equal(mpfEntries(result.data).little, little);
    assert.equal(result.payloadHash, (await cleanImage(data, [], false)).payloadHash);
    await verifyOutput(data, result.data, ids, true);
  });
test('MPF with two secondary images keeps both byte-identical after cleaning', async () => {
  const a = fixture('progressive.jpg'),
    b = fixture('image-6.jpg'),
    data = mpfFile(fixture('image-1.jpg'), [a, b]);
  const ids = scanImage(data)
    .records.filter(r => r.requiresRightsConsent)
    .map(r => r.id);
  assertMpfConsistent((await cleanImage(data, ids, true)).data, [a, b]);
});
for (const order of ['APP11 after MPF', 'APP11 before MPF'] as const)
  test(`MPF + C2PA (${order}): store removal rewrites only MPF size/offset fields`, async () => {
    const gain = fixture('progressive.jpg'),
      store = c2paStore(),
      primary = jpgInsert(fixture('image-1.jpg'), 235, app11(store));
    const segment = 4 + app11(store).length;
    const data = order === 'APP11 after MPF' ? mpfFile(primary, [gain]) : mpfFile(primary, [gain], { at: 2 + segment });
    const scan = scanImage(data);
    assert.equal(scan.c2paRemovable, true, scan.c2paDecision?.reason);
    const result = await cleanC2pa(data, true);
    assert.equal(result.removed, 1);
    assertMpfConsistent(result.data, [gain]);
    assert.equal(result.data.length, data.length - segment);
    const before = mpfEntries(data),
      after = mpfEntries(result.data);
    assert.equal(after.sizes[0], before.sizes[0]! - segment);
    assert.equal(after.offsets[1], order === 'APP11 after MPF' ? before.offsets[1]! - segment : before.offsets[1]);
    const footprints = await cleanFootprints(data, { c2paConsent: true, rightsConsent: false });
    assert.ok(footprints.output, footprints.footprintResult.reason);
    assertMpfConsistent(footprints.output!.data, [gain]);
  });
test('data after EOI is rejected unless an MPF index describes it exactly', () => {
  const primary = fixture('image-1.jpg'),
    gain = fixture('progressive.jpg');
  const bad = [
    concat(primary, gain),
    mpfFile(primary, [gain], {
      tamper: (_s, o) => {
        o[1]! += 1;
      },
    }),
    mpfFile(primary, [gain], {
      tamper: s => {
        s[0]! -= 1;
      },
    }),
    mpfFile(primary, [gain], {
      tamper: s => {
        s[1]! -= 1;
      },
    }),
    concat(mpfFile(primary, [gain]), new Uint8Array([0])),
    mpfFile(primary, [concat(new Uint8Array([0, 0]), gain.subarray(2))]),
  ];
  bad.forEach((data, i) => assert.throws(() => scanImage(data), Error, `case ${i}`));
});
test('MPF segment without described images blocks cleaning and C2PA removal', async () => {
  const data = jpgInsert(
    jpgInsert(fixture('image-1.jpg'), 235, app11(c2paStore())),
    226,
    mpfPayload(false, [10, 10], [0, 10]),
  );
  const scan = scanImage(data);
  assert.equal(scan.cleaningBlocked, true);
  assert.equal(scan.c2paRemovable, false);
  await assert.rejects(cleanC2pa(data, true));
});
test('provenance or AI declarations inside a secondary image are reported and block removal', async () => {
  const gain = jpgInsert(fixture('progressive.jpg'), 235, app11(c2paStore()));
  const data = mpfFile(jpgInsert(fixture('image-1.jpg'), 235, app11(c2paStore())), [gain]);
  const scan = scanImage(data);
  assert.equal(scan.cleaningBlocked, true);
  assert.equal(scan.c2paRemovable, false);
  await assert.rejects(cleanC2pa(data, true));
  const xmp = concat(
    bytes('http://ns.adobe.com/xap/1.0/\0'),
    bytes(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:i="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" i:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></r:RDF></x:xmpmeta>',
    ),
  );
  const declared = scanImage(mpfFile(fixture('image-1.jpg'), [jpgInsert(fixture('progressive.jpg'), 225, xmp)]));
  assert.ok(declared.footprints!.evidence.some(e => e.category === 'explicit-ai' && !e.removable));
});
test('Ultra HDR gain-map XMP in the primary is protected when MPF images are present', () => {
  const xmp = concat(
    bytes('http://ns.adobe.com/xap/1.0/\0'),
    bytes(
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0"/></r:RDF></x:xmpmeta>',
    ),
  );
  const record = scanImage(
    mpfFile(jpgInsert(fixture('image-1.jpg'), 225, xmp), [fixture('progressive.jpg')]),
  ).records.find(r => r.kind === 'XMP')!;
  assert.equal(record.status, 'protected');
  assert.equal(record.requiresRightsConsent, false);
  assert.match(record.reason, /Ultra HDR/);
  // Without MPF images the same XMP stays removable with rights consent.
  assert.equal(
    scanImage(jpgInsert(fixture('image-1.jpg'), 225, xmp)).records.find(r => r.kind === 'XMP')!.requiresRightsConsent,
    true,
  );
});
test('metadata in a secondary MPF image is reported as retained and keeps the result partial', async () => {
  const exif = fixture('image-1.jpg').subarray(20 + 2 + 2, 20 + 2 + 118);
  const gain = jpgInsert(fixture('progressive.jpg'), 225, exif);
  const data = mpfFile(fixture('image-1.jpg'), [gain]);
  const scan = scanImage(data);
  assert.equal(scan.footprints?.incomplete, true);
  assert.match(scan.records.find(r => r.kind === 'MPF')!.reason, /ikincil görüntülerde/);
  assert.ok(scan.notes.some(n => /İkincil görüntülerde EXIF/.test(n)));
  const ids = scan.records.filter(r => r.requiresRightsConsent).map(r => r.id);
  const result = await cleanImage(data, ids, true);
  assertMpfConsistent(result.data, [gain]);
});

// --- cleanAllMetadata ("Tüm Metadata'yı Kaldır") ---
test('remove all metadata: EXIF needing rights consent goes, ICC stays, payload unchanged', async () => {
  const data = fixture('image-1.jpg');
  const before = scanImage(data);
  assert.ok(before.records.some(r => r.kind === 'EXIF' && r.requiresRightsConsent));
  const { footprintResult, output } = await cleanAllMetadata(data);
  assert.ok(output, footprintResult.reason);
  assert.equal(
    output.scan.records.some(r => r.kind === 'EXIF'),
    false,
  );
  assert.ok(output.retainedKinds.includes('ICC'));
  assert.equal(
    output.scan.records.some(r => isRemovable(r, 'safe')),
    false,
  );
  assert.equal(output.payloadHash, (await cleanImage(data, [], false)).payloadHash);
});
for (const ext of ['jpg', 'png', 'webp'] as const)
  test(`remove all metadata (${ext}): C2PA store and rights metadata removed in one verified operation`, async () => {
    const original = fixture(`image-1.${ext}`),
      store = c2paStore();
    const data =
      ext === 'jpg'
        ? jpgInsert(original, 235, app11(store))
        : ext === 'png'
          ? pngInsert(original, 'caBX', store)
          : webpInsert(original, 'C2PA', store);
    const scan = scanImage(data);
    assert.equal(scan.c2paRemovable, true);
    assert.equal(scan.cleaningBlocked, true);
    const { footprintResult, output } = await cleanAllMetadata(data);
    assert.ok(output, footprintResult.reason);
    assert.equal(output.scan.c2pa, 'not-detected-not-guaranteed');
    assert.equal(
      output.scan.records.some(r => r.kind === 'C2PA / opaque provenance' || r.kind === 'EXIF'),
      false,
    );
    assert.ok(output.removed >= 2);
    assert.equal(output.payloadHash, (await cleanImage(original, [], false)).payloadHash);
  });
test('remove all metadata keeps EXIF that carries a non-default orientation', async () => {
  const data = jpgInsert(fixture('image-6.jpg'), 235, app11(c2paStore()));
  const { footprintResult, output } = await cleanAllMetadata(data);
  assert.ok(output, footprintResult.reason);
  assert.equal(output.scan.orientation, 6);
  assert.ok(output.retainedKinds.includes('EXIF'));
  assert.equal(output.scan.c2pa, 'not-detected-not-guaranteed');
});
test('remove all metadata is blocked for provenance it cannot remove and releases no output', async () => {
  const data = jpgInsert(fixture('image-1.jpg'), 235, bytes('opaque jumb'));
  const { footprintResult, output } = await cleanAllMetadata(data);
  assert.equal(footprintResult.status, 'BLOCKED');
  assert.equal(output, undefined);
});
test('remove all metadata reports nothing to remove for a bare JPEG', async () => {
  const { footprintResult, output } = await cleanAllMetadata(fixture('progressive.jpg'));
  assert.equal(footprintResult.status, 'NOTHING_TO_REMOVE');
  assert.equal(output, undefined);
});
