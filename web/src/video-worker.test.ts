import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('./video.worker.ts', import.meta.url), 'utf8');
async function harness(mode: 'ok' | 'verify-fail' | 'write-fail' | 'cancel' | 'close-fail' | 'commit-cancel' | 'cleanup-fail' | 'abort-fail' | 'cleanup-hang' | 'quota-low' | 'quota-unknown' | 'stage-quota' | 'external' | 'external-cleanup' | 'collision' | 'same-stage' | 'identity-fail') {
  const calls: string[] = [], messages: any[] = [];
  let resolve!: () => void;
  const done = new Promise<void>(r => { resolve = r; });
  const blob = new Blob([new Uint8Array(8)]);
  const self: any = { postMessage(value: any) { messages.push(value); }, close() { calls.push('worker-close'); } };
  const root = {
    async getFileHandle(name: string, options?: { create: boolean }) {
      assert.equal(name, 'afc-video-test.tmp');
      if (!options?.create && mode !== 'collision') throw Object.assign(new Error('not found'), { name: 'NotFoundError' });
      return { async isSameEntry() { if (mode === 'identity-fail') throw new Error('identity denied'); return mode === 'same-stage'; }, async createWritable() { return {
      async write() { calls.push('stage-write'); if (mode === 'stage-quota') throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); }, async close() { calls.push('stage-close'); }, async abort() { calls.push('stage-abort'); },
    }; }, async getFile() { return blob; } }; },
    async removeEntry(name: string) { assert.equal(name, 'afc-video-test.tmp'); calls.push('remove-stage'); resolve(); if (mode === 'cleanup-hang') return new Promise<void>(() => {}); if (mode === 'cleanup-fail' || mode === 'external-cleanup') throw new Error('delete denied'); },
  };
  const target = { name: 'out.mp4', async createWritable() { calls.push('target-open'); return {
    async write() { calls.push('target-write'); if (mode === 'write-fail' || mode === 'abort-fail') throw new Error('disk full'); if (mode === 'cancel') await self.onmessage({ data: { type: 'cancel' } }); },
    async close() { calls.push('target-close'); if (mode === 'commit-cancel') await self.onmessage({ data: { type: 'cancel' } }); if (mode === 'close-fail') throw new Error('close failed'); },
    async abort() { calls.push('target-abort'); if (mode === 'abort-fail') throw new Error('abort failed'); },
  }; } };
  const code = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''));
  runInNewContext(code, {
    self, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, mode === 'cleanup-hang' ? 1 : ms), clearTimeout, navigator: { storage: { async estimate() { calls.push('estimate'); return mode === 'quota-unknown' ? {} : { quota: mode === 'quota-low' ? 4 : 10_000_000, usage: 0 }; }, async getDirectory() { if (mode === 'external' || mode === 'external-cleanup') throw new Error('OPFS must not be opened'); return root; } } }, crypto: { randomUUID() { return 'test'; } },
    scanVideo: async () => ({ format: 'MP4', records: [] }),
    videoChunks: async function* () { yield new Uint8Array(8); },
    verifyVideo: async () => { calls.push('verify'); if (mode === 'verify-fail') throw new Error('verification rejected'); return { format: 'MP4' }; },
  });
  await self.onmessage({ data: { type: 'scan', file: { name: 'source.mp4', size: 8 }, format: 'MP4' } });
  messages.length = 0;
  await self.onmessage({ data: { type: 'clean', ids: ['one'], rightsConsent: true, handle: target, ...((mode === 'external' || mode === 'external-cleanup') ? { temporaryDirectory: root } : {}) } });
  if (!['quota-low', 'quota-unknown', 'collision', 'same-stage', 'identity-fail'].includes(mode)) await done;
  return { calls, messages };
}
test('video Worker verifies before opening destination and closes before success; removes staging', async () => {
  const { calls, messages } = await harness('ok');
  assert.deepEqual(calls, ['estimate', 'stage-write', 'stage-close', 'verify', 'target-open', 'target-write', 'target-close', 'remove-stage']);
  assert.equal(messages.at(-1).type, 'video-done');
  assert.match(source, /staged\.slice\(position, position \+ 1024 \* 1024\)/);
  assert.doesNotMatch(source, /staged\.arrayBuffer\(\)|source\.arrayBuffer\(\)|new Blob/);
});
for (const mode of ['quota-low', 'quota-unknown', 'collision', 'same-stage'] as const) test(`video Worker ${mode} rejects without opening destination or deleting unowned files`, async () => {
  const { calls, messages } = await harness(mode);
  assert.equal(calls.includes('target-open'), false);
  assert.equal(calls.includes('stage-write'), false);
  assert.equal(calls.includes('remove-stage'), false);
  assert.equal(messages.at(-1).type, 'error');
});
test('temporary identity rejection reports unremoved file without touching destination', async () => {
  const { calls, messages } = await harness('identity-fail');
  assert.equal(calls.includes('target-open'), false);
  assert.equal(calls.includes('remove-stage'), false);
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).cleanupWarning, /afc-video-test\.tmp/);
});
test('external temporary directory bypasses OPFS and cleans only the owned file', async () => {
  const { calls, messages } = await harness('external');
  assert.equal(calls.includes('estimate'), false);
  assert.equal(calls.at(-1), 'remove-stage');
  assert.equal(messages.at(-1).type, 'video-done');
});
test('external cleanup failure identifies the exact temporary file', async () => {
  const { messages } = await harness('external-cleanup');
  assert.equal(messages.at(-1).type, 'video-done');
  assert.match(messages.at(-1).cleanupWarning, /afc-video-test\.tmp/);
});
test('staging quota error aborts, cleans and never opens destination', async () => {
  const { calls, messages } = await harness('stage-quota');
  assert.deepEqual(calls, ['estimate', 'stage-write', 'stage-abort', 'remove-stage']);
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /kotası/);
});
test('video Worker verification rejection never opens destination', async () => {
  const { calls, messages } = await harness('verify-fail');
  assert.equal(calls.includes('target-open'), false);
  assert.equal(calls.at(-1), 'remove-stage'); assert.equal(messages[0].type, 'error');
});
test('cancel received while close is pending follows actual commit result', async () => {
  const { calls, messages } = await harness('commit-cancel');
  assert.equal(calls.includes('target-abort'), false);
  assert.deepEqual(messages.map(m => m.type), ['committing', 'video-done']);
});
test('abort failure reports uncertain disk result rather than cancellation success', async () => {
  const { messages } = await harness('abort-fail');
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /belirsiz/);
});
test('never settling cleanup is bounded and cannot hide committed output', async () => {
  const { messages } = await harness('cleanup-hang');
  assert.equal(messages.at(-1).type, 'video-done');
  assert.match(messages.at(-1).cleanupWarning, /silinemedi/);
});
test('cleanup failure is reported separately from successful target commit', async () => {
  const { messages } = await harness('cleanup-fail');
  assert.equal(messages.at(-1).type, 'video-done');
  assert.match(messages.at(-1).cleanupWarning, /silinemedi/);
});
for (const mode of ['write-fail', 'close-fail', 'cancel'] as const) test(`video Worker ${mode} aborts without success and removes staging`, async () => {
  const { calls, messages } = await harness(mode);
  assert.ok(calls.includes('target-abort')); assert.ok(calls.includes('remove-stage'));
  assert.equal(messages.some(m => m.type === 'video-done'), false);
  assert.equal(messages.at(-1).type, mode === 'cancel' ? 'cancelled' : 'error');
});
