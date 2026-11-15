import test from 'node:test'
import assert from 'node:assert/strict'
import { validateC2paStore } from './c2pa-structure.ts'
const bytes = (s: string) => new TextEncoder().encode(s)
const join = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let pos = 0; for (const p of parts) { out.set(p, pos); pos += p.length } return out }
function box(type: string, data: Uint8Array) { const out = new Uint8Array(data.length + 8); new DataView(out.buffer).setUint32(0, out.length); out.set(bytes(type), 4); out.set(data, 8); return out }
const uuid = new Uint8Array([99, 50, 112, 97, 0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113])
const desc = (id = uuid, label = 'c2pa') => box('jumd', join(id, new Uint8Array([3]), bytes(label + '\0')))
const manifestUuid = uuid.slice(); manifestUuid[2] = 0x6d
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
test('structural validator enforces deterministic depth and size budgets', () => {
  let nested = box('jumb', join(desc(new Uint8Array(16), 'leaf'), box('cbor', bytes('x'))))
  for (let i = 0; i < 14; i++) nested = box('jumb', join(desc(new Uint8Array(16), `depth-${i}`), nested))
  assert.throws(() => validateC2paStore(store(nested)), /depth/)
  assert.throws(() => validateC2paStore(new Uint8Array(4 * 1024 * 1024 + 1)), /size/)
})
