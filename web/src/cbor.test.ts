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
