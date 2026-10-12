import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeOutput } from './output.ts';

test('future disk writer awaits chunks and closes, aborts on failure', async () => {
  const calls: string[] = [];
  const handle = { async createWritable() { return {
    async write(data: Uint8Array) { calls.push(`write:${data.length}`); },
    async close() { calls.push('close'); }, async abort() { calls.push('abort'); },
  }; } };
  async function* chunks() { yield new Uint8Array(2); yield new Uint8Array(3); }
  await writeOutput(handle, chunks());
  assert.deepEqual(calls,['write:2','write:3','close']);
  calls.length=0;
  async function* failure() { yield new Uint8Array(1); throw new Error('read failure'); }
  await assert.rejects(writeOutput(handle, failure()), /read failure/);
  assert.deepEqual(calls,['write:1','abort']);
});
