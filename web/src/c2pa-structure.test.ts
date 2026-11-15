import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveLocalC2paReference, validateC2paStore } from './c2pa-structure.ts'
const bytes = (s: string) => new TextEncoder().encode(s)
const join = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length } return out }
function box(type: string, data: Uint8Array) { const out = new Uint8Array(data.length + 8); new DataView(out.buffer).setUint32(0, out.length); out.set(bytes(type), 4); out.set(data, 8); return out }
const uuid = new Uint8Array([99, 50, 112, 97, 0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113])
const desc = (id = uuid, label = 'c2pa') => box('jumd', join(id, new Uint8Array([3]), bytes(label + '\0')))
const manifestUuid = uuid.slice(); manifestUuid[2] = 0x6d
const claimUuid = uuid.slice(); claimUuid.set(bytes('c2cl'))
const claim = (label = 'c2pa.claim', id = claimUuid, ...content: Uint8Array[]) => box('jumb', join(desc(id, label), ...(content.length ? content : [box('cbor', new Uint8Array([255]))])))
const labelledStore = (label: string, ...content: Uint8Array[]) => box('jumb', join(desc(), box('jumb', join(desc(manifestUuid, label), ...content))))
const store = (...content: Uint8Array[]) => box('jumb', join(desc(), box('jumb', join(desc(manifestUuid, 'manifest'), ...content))))
test('structural validator accepts opaque CBOR without treating it as verified semantic content', () => {
  assert.doesNotThrow(() => validateC2paStore(store(box('cbor', new Uint8Array([255])))))
})
test('structural validator rejects malformed trees, UUID/label, open/extended lengths and duplicate descriptions', () => {
  const valid = store(box('cbor', new Uint8Array([0xa0])))
  const wrongUuid = valid.slice(); wrongUuid[31]! ^= 1
  const zero = valid.slice(); new DataView(zero.buffer).setUint32(0, 0)
  const extended = valid.slice(); new DataView(extended.buffer).setUint32(0, 1)
  const overrun = valid.slice(); new DataView(overrun.buffer).setUint32(overrun.length - 9, 100)
  const badLabel = box('jumb', join(desc(uuid, 'not-c2pa'), box('cbor', bytes('x'))))
  for (const bad of [wrongUuid, zero, extended, overrun, badLabel, join(valid, valid), store(desc()), store(valid), box('jumb', box('cbor', bytes('x'))), store(box('jumb', box('cbor', bytes('x'))))]) assert.throws(() => validateC2paStore(bad))
})
test('local targets index only a manifest and its single exact claim with opaque CBOR', () => {
  for (const label of ['c2pa.claim', 'c2pa.claim.v2']) {
    const index = validateC2paStore(store(claim(label)))
    assert.deepEqual(index, { targets: ['/c2pa/manifest', `/c2pa/manifest/${label}`] })
    for (const path of index.targets) {
      assert.equal(resolveLocalC2paReference('self#jumbf=' + path, index), true)
      assert.equal(resolveLocalC2paReference('self#jumbf=' + path.slice(1), index), true)
    }
    assert.equal(resolveLocalC2paReference('self#jumbf=/c2pa/manifest/' + (label === 'c2pa.claim' ? 'c2pa.claim.v2' : 'c2pa.claim'), index), false)
  }
})
test('canonical manifest URN labels resolve their exact claim path', () => {
  const label = 'urn:uuid:0f630bfb-8f31-4c65-9b98-26cf96a858e7'
  const index = validateC2paStore(labelledStore(label, claim()))
  assert.deepEqual(index.targets, [`/c2pa/${label}`, `/c2pa/${label}/c2pa.claim`])
  assert.equal(resolveLocalC2paReference(`self#jumbf=/c2pa/${label}/c2pa.claim`, index), true)
})
test('missing, wrongly labelled, and non-CBOR claims never make local targets eligible', () => {
  for (const content of [box('cbor', bytes('opaque')), claim('other'), claim('c2pa.claim', claimUuid, box('json', bytes('{}'))), claim('c2pa.claim', claimUuid, box('cbor', bytes('x')), box('cbor', bytes('y')))]) {
    const index = validateC2paStore(store(content))
    assert.deepEqual(index.targets, [])
    assert.equal(resolveLocalC2paReference('self#jumbf=/c2pa/manifest', index), false)
  }
})
test('claim labels require the exact c2cl UUID and manifests cannot contain multiple claims', () => {
  const wrongUuid = claimUuid.slice(); wrongUuid[15] ^= 1
  for (const label of ['c2pa.claim', 'c2pa.claim.v2']) assert.throws(() => validateC2paStore(store(claim(label, wrongUuid))), /UUID/)
  assert.throws(() => validateC2paStore(store(claim(), claim('c2pa.claim.v2'))), /Multiple/)
  assert.throws(() => validateC2paStore(store(claim(), claim())), /duplicate/)
  assert.throws(() => validateC2paStore(store(claim(), claim('other'))), /Multiple/)
})
test('ambiguous manifest labels remain store-only and cannot resolve local references', () => {
  for (const label of ['a/b', 'a%b', 'a?b', 'a#b', '..', 'a..b', 'a\\b', 'a b']) {
    const index = validateC2paStore(labelledStore(label, claim()))
    assert.deepEqual(index.targets, [])
    assert.equal(resolveLocalC2paReference('self#jumbf=/c2pa/' + label, index), false)
  }
})
test('local reference resolution rejects external references, selectors and normalization', () => {
  const index = validateC2paStore(store(claim()))
  for (const value of [
    'https://example.test/#jumbf=/c2pa/manifest', '#jumbf=/c2pa/manifest', 'self#jumbf=//c2pa/manifest',
    ' self#jumbf=/c2pa/manifest', 'self#jumbf=/c2pa/manifest ', 'SELF#jumbf=/c2pa/manifest',
    'self#jumbf=/C2PA/manifest', 'self#jumbf=/c2pa/%6danifest', 'self#jumbf=/c2pa/../manifest',
    'self#jumbf=/c2pa/manifest?x=1', 'self#jumbf=/c2pa/manifest#extra', 'self#jumbf=/c2pa/manifest/',
    'self#jumbf=/c2pa/manifest/c2pa.claim/cbor', 'self#jumbf=/c2pa/manifest/c2pa.claim?x=1',
    'self#jumbf=/c2pa/manifest/c2pa.claim#extra', 'self#jumbf=/c2pa/absent',
  ]) assert.equal(resolveLocalC2paReference(value, index), false, value)
})
test('structural validator enforces deterministic depth and size budgets', () => {
  let nested = box('jumb', join(desc(new Uint8Array(16), 'leaf'), box('cbor', bytes('x'))))
  for (let i = 0; i < 14; i++) nested = box('jumb', join(desc(new Uint8Array(16), `depth-${i}`), nested))
  assert.throws(() => validateC2paStore(store(nested)), /depth/)
  assert.throws(() => validateC2paStore(new Uint8Array(4 * 1024 * 1024 + 1)), /size/)
})
