import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveActions, downloadName, isVideoFormat, videoOutputName } from './app-state.ts';
import { scanImage } from './engine.ts';
import type { MediaScan, VerifiedOutput } from './protocol.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url)));
const output = (format: string, footprint: boolean) =>
  ({ scan: { format }, ...(footprint ? { footprintResult: { status: 'REMOVED_VERIFIED' } } : {}) }) as unknown as Pick<
    VerifiedOutput,
    'footprintResult' | 'scan'
  >;

test('download names keep the base, sanitize unsafe characters and use -removed', () => {
  assert.equal(downloadName('kedi.PNG', output('PNG', true)), 'kedi-removed.PNG');
  assert.equal(downloadName('foto.jpeg', output('JPEG', true)), 'foto-removed.jpeg');
  assert.equal(downloadName('foto.jpeg', output('JPEG', false)), 'foto-removed.jpg');
  assert.equal(downloadName('a:b*c?.webp', output('WebP', false)), 'a_b_c_-removed.webp');
  assert.equal(downloadName('.png', output('PNG', false)), 'gorsel-removed.png');
  assert.equal(downloadName(`${'x'.repeat(200)}.png`, output('PNG', false)), `${'x'.repeat(120)}-removed.png`);
  assert.equal(videoOutputName('klip.mov', 'MOV'), 'klip-removed.mov');
  assert.equal(videoOutputName(undefined, 'MP4'), 'video-removed.mp4');
});

test('isVideoFormat narrows only MP4/MOV', () => {
  assert.deepEqual(['MP4', 'MOV', 'JPEG', 'PNG', undefined].map(isVideoFormat), [true, true, false, false, false]);
});

test('deriveActions: rights-consent records need consent and are excluded from the one-click plan', () => {
  const scan = scanImage(fixture('image-1.jpg')) as MediaScan;
  const actions = deriveActions(scan, 'safe');
  assert.ok(actions.eligible.length > 0);
  assert.equal(actions.needsConsent, true);
  assert.equal(actions.c2paRemovable, false);
  assert.ok(actions.imageScan);
  assert.equal(actions.directRemovable, false);
  assert.deepEqual(deriveActions(undefined, 'safe'), {
    eligible: [],
    needsConsent: false,
    c2paRemovable: false,
    imageScan: undefined,
    footprintPlan: undefined,
    directRemovable: false,
    allMetadataRemovable: false,
  });
});

test('deriveActions: blocked scans offer no metadata cleaning', () => {
  const scan = { ...(scanImage(fixture('image-1.jpg')) as MediaScan), cleaningBlocked: true } as MediaScan;
  assert.deepEqual(deriveActions(scan, 'comprehensive').eligible, []);
});

test('deriveActions: remove-all is available for removable metadata or a removable C2PA store, not for blocked scans', () => {
  assert.equal(deriveActions(scanImage(fixture('image-1.jpg')) as MediaScan, 'safe').allMetadataRemovable, true);
  assert.equal(deriveActions(scanImage(fixture('progressive.jpg')) as MediaScan, 'safe').allMetadataRemovable, false);
  const blocked = {
    ...(scanImage(fixture('image-1.jpg')) as MediaScan),
    cleaningBlocked: true,
    c2paRemovable: false,
  } as MediaScan;
  assert.equal(deriveActions(blocked, 'safe').allMetadataRemovable, false);
});
