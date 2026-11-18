import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveActions, downloadName, formatBytes, isVideoFormat, videoOutputName } from './app-state.ts';
import { scanImage } from './engine.ts';
import type { MediaScan } from './protocol.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)));

test('output names keep the base and image extension, sanitize unsafe characters and use -removed', () => {
  assert.equal(downloadName('kedi.PNG', 'PNG'), 'kedi-removed.PNG');
  assert.equal(downloadName('foto.jpeg', 'JPEG'), 'foto-removed.jpeg');
  assert.equal(downloadName('foto', 'JPEG'), 'foto-removed.jpg');
  assert.equal(downloadName('a:b*c?.webp', 'WebP'), 'a_b_c_-removed.webp');
  assert.equal(downloadName('.png', 'PNG'), 'gorsel-removed.png');
  assert.equal(downloadName(`${'x'.repeat(200)}.png`, 'PNG'), `${'x'.repeat(120)}-removed.png`);
  assert.equal(videoOutputName('klip.mov', 'MOV'), 'klip-removed.mov');
  assert.equal(videoOutputName('a/b.mp4', 'MP4'), 'a_b-removed.mp4');
  assert.equal(videoOutputName(undefined, 'MP4'), 'video-removed.mp4');
});

test('formatBytes uses decimal units and Turkish decimals', () => {
  assert.deepEqual([0, 999, 1000, 2_400_000, 53_200_000, 1_000_000_000].map(formatBytes), [
    '0 bayt',
    '999 bayt',
    '1 KB',
    '2,4 MB',
    '53 MB',
    '1 GB',
  ]);
});

test('isVideoFormat narrows only MP4/MOV', () => {
  assert.deepEqual(['MP4', 'MOV', 'JPEG', 'PNG', undefined].map(isVideoFormat), [true, true, false, false, false]);
});

test('deriveActions: removable records and remove-all availability', () => {
  const scan = scanImage(fixture('image-1.jpg')) as MediaScan;
  const actions = deriveActions(scan);
  assert.ok(actions.imageScan);
  assert.ok(actions.removable.length > 0);
  assert.ok(actions.removable.every(r => r.kind !== 'ICC'));
  assert.equal(actions.canRemoveAll, true);
  assert.equal(deriveActions(scanImage(fixture('progressive.jpg')) as MediaScan).canRemoveAll, false);
  assert.deepEqual(deriveActions(undefined), {
    imageScan: undefined,
    footprintPlan: undefined,
    removable: [],
    canRemoveAll: false,
  });
});

test('deriveActions: blocked scans without a removable C2PA store offer nothing', () => {
  const blocked = {
    ...(scanImage(fixture('image-1.jpg')) as MediaScan),
    cleaningBlocked: true,
    c2paRemovable: false,
  } as MediaScan;
  const actions = deriveActions(blocked);
  assert.deepEqual(actions.removable, []);
  assert.equal(actions.canRemoveAll, false);
});
