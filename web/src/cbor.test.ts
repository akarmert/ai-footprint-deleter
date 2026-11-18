import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCbor } from './cbor.ts';

const decode = (bytes: number[]) => decodeCbor(new Uint8Array(bytes), () => {});
test('CBOR bounded definite map decoding', () => {
  assert.deepEqual(decode([0xa1, 0x61, 0x61, 0x82, 1, 0xf5]), new Map([['a', [1, true]]]));
});
test('CBOR rejects truncated, indefinite, invalid UTF8, duplicate and trailing values', () => {
  for (const bytes of [[0x7f, 0xff], [0x63, 1], [0x61, 0xff], [0xa2, 1, 2, 1, 3], [0, 0], [0xd8, 18, 0], [0x9b, 255, 255, 255, 255, 255, 255, 255, 255]]) assert.throws(() => decode(bytes));
});
test('CBOR enforces depth, size and time budget callbacks', () => {
  assert.throws(() => decode([...Array(22).fill(0x81), 0]));
  assert.throws(() => decode([0x5a, 0, 16, 0, 0]));
  assert.throws(() => decodeCbor(new Uint8Array([0]), () => { throw new Error('deadline'); }), /deadline/);
});
test('CBOR accepts only date/time tags 0 (text) and 1 (epoch) and drops the tag', () => {
  // tag 0 "2025" (RFC 3339 text, as in OpenAI C2PA action "when"), tag 1 epoch 100
  assert.equal(decode([0xc0, 0x64, 0x32, 0x30, 0x32, 0x35]), '2025');
  assert.equal(decode([0xc1, 0x18, 100]), 100);
  assert.deepEqual(decode([0xa1, 0x64, 0x77, 0x68, 0x65, 0x6e, 0xc0, 0x61, 0x78]), new Map([['when', 'x']]));
  for (const bytes of [[0xc0, 0x01], [0xc1, 0x61, 0x78], [0xd8, 18, 0x80], [0xc2, 0x41, 0x01], [0xd8, 32, 0x61, 0x78], [0xc0]]) assert.throws(() => decode(bytes), String(bytes));
});
