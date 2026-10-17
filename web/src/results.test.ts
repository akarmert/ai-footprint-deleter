import test from 'node:test';
import assert from 'node:assert/strict';
import { aiEvidence, describeResults } from './results.ts';
import type { MediaScan } from './protocol';

const base: MediaScan = { format: 'PNG', width: 800, height: 600, alpha: false, orientation: 1, c2pa: 'not-detected-not-guaranteed', cleaningBlocked: false, notes: [], records: [] };
const file = { name: 'sample.png', size: 1200 };

test('empty scan has only actual file fields and no AI evidence', () => {
  const result = describeResults(base, file);
  assert.equal(result.aiCount, 0);
  assert.equal(result.fields.length, 7);
  assert.equal(result.sectionCount, 1);
  assert.equal(result.provenance, false);
  assert.equal(aiEvidence('Adobe Photoshop; camera; Applied SynthID watermark'), false);
});

test('AI claim counts one actual record, not individual keywords', () => {
  const result = describeResults({ ...base, records: [{ id: 'x', kind: 'XMP', bytes: 42, preview: 'trainedAlgorithmicMedia; Stable Diffusion; prompt: landscape', status: 'protected', reason: 'test', requiresRightsConsent: false }] }, file);
  assert.equal(result.aiCount, 1);
  assert.equal(result.fields.length, 8);
  assert.equal(result.fields.filter(field => field.category === 'production').length, 1);
});

test('unverified provenance is not automatically AI evidence', () => {
  for (const c2pa of ['detected-not-verified', 'detected-or-uncertain-not-verified']) {
    const result = describeResults({ ...base, c2pa, cleaningBlocked: true, records: [{ id: 'c', kind: 'C2PA / opaque provenance', bytes: 40, preview: '', status: 'protected', reason: 'unverified', requiresRightsConsent: false }] }, file);
    assert.equal(result.provenance, true);
    assert.equal(result.aiCount, 0);
    assert.equal(result.fields.filter(field => field.category === 'c2pa').length, 2);
  }
});

test('categories partition fields without mutating the scan or cleaning policy', () => {
  const scan: MediaScan = { ...base, records: ['ICC', 'EXIF', 'JFIF'].map((kind, index) => ({ id: String(index), kind, bytes: 3, preview: '', status: 'protected', reason: kind, requiresRightsConsent: false })) };
  const snapshot = JSON.stringify(scan);
  const result = describeResults(scan, file);
  assert.equal(result.fields.filter(field => field.category === 'color').length, 1);
  assert.equal(result.fields.filter(field => field.category === 'privacy').length, 1);
  assert.equal(result.fields.filter(field => field.category === 'other').length, 1);
  assert.equal(result.sectionCount, 4);
  assert.equal(JSON.stringify(scan), snapshot);
});
