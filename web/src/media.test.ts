import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSelection, detectHeader, inspect, readChunks, readRange, VIDEO_LIMIT, IMAGE_LIMIT, READ_CHUNK } from './media.ts';

test('allowlist, empty, image and exact decimal video boundaries', () => {
  for (const name of ['a.jpg','a.JPEG','a.png','a.webp','a.mp4','a.mov']) assert.ok(validateSelection({name,size:1}));
  for (const name of ['a.svg','a.html','a.gif','a.mp4.exe','a.constructor','a.__proto__','a.toString']) assert.throws(() => validateSelection({name,size:1}));
  assert.throws(() => validateSelection({name:'a.png',size:0}));
  assert.equal(validateSelection({name:'a.mp4',size:VIDEO_LIMIT}), 'MP4');
  assert.throws(() => validateSelection({name:'a.mov',size:VIDEO_LIMIT+1}));
  assert.equal(validateSelection({name:'a.png',size:IMAGE_LIMIT}), 'PNG');
  assert.throws(() => validateSelection({name:'a.png',size:IMAGE_LIMIT+1}));
});
test('header detection is conservative, does not trust MIME or extension', async () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
  assert.ok(detectHeader(png,'PNG'));
  assert.equal(detectHeader(png,'JPEG'),false);
  assert.ok(detectHeader(Uint8Array.from([255,216,255]),'JPEG'));
  assert.ok(detectHeader(new TextEncoder().encode('RIFF0000WEBP'),'WebP'));
  const mp4 = Uint8Array.from([0,0,0,16,...new TextEncoder().encode('ftypisom'),0,0,0,0]);
  assert.ok(detectHeader(mp4,'MP4'));
  for (const name of ['a.constructor','a.__proto__','a.toString']) await assert.rejects(inspect(new File([mp4], name)));
  assert.equal(detectHeader(mp4,'MOV'),false);
  assert.equal(detectHeader(mp4.subarray(0,12),'MP4'),false);
  assert.equal((await inspect(new File([png],'a.png'))).scope,'header-only');
  await assert.rejects(inspect(new File(['bad'],'a.png')));
});
test('bounded reads never request the entire large file', async () => {
  let read = 0;
  const fake = { name:'a.mp4',size:VIDEO_LIMIT, slice(start:number,end:number) {
    read += end-start; assert.ok(end-start <= READ_CHUNK);
    return new Blob([Uint8Array.from([0,0,0,16,...new TextEncoder().encode('ftypisom'),0,0,0,0])]);
  }, arrayBuffer() { throw new Error('full-file read prohibited'); } } as unknown as File;
  await inspect(fake); assert.equal(read,READ_CHUNK);
  await assert.rejects(readRange(fake,0,READ_CHUNK+1));
  const sizes:number[]=[];
  for await (const chunk of readChunks(new Blob([new Uint8Array(READ_CHUNK+7)]))) sizes.push(chunk.length);
  assert.deepEqual(sizes,[READ_CHUNK,7]);
});
