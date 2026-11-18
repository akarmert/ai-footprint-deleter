import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cleanFootprints, scanImage, cleanImage } from './engine.ts'
import { buildFootprints, classifyFootprintText, consentFootprintPlan } from './footprints.ts'
import { validateC2paStore, resolveLocalC2paReference } from './c2pa-structure.ts'
import { removeXmpReference } from './xmp.ts'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { cleanC2pa } from './engine.ts'
import { readC2pa } from './c2pa.ts'
import { analyzeXmp } from './xmp.ts'
import { validateSelection } from './media.ts'
import { describeResults } from './results.ts'
const bytes = (s: string) => new TextEncoder().encode(s)
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let p = 0; for (const part of parts) { out.set(part, p); p += part.length } return out }
const fixture = (s: string) => new Uint8Array(readFileSync(new URL(`../tests/fixtures/${s}`, import.meta.url)))
const jpg = (data: Uint8Array, marker: number, payload: Uint8Array) => cat(data.subarray(0, 2), new Uint8Array([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload, data.subarray(2))
const box = (kind: string, payload: Uint8Array) => { const out = new Uint8Array(payload.length + 8); new DataView(out.buffer).setUint32(0, out.length); out.set(bytes(kind), 4); out.set(payload, 8); return out }
const sb = (type: string, label: string, payload: Uint8Array): Uint8Array => box('jumb', cat(box('jumd', cat(bytes(type), new Uint8Array([0,17,0,16,128,0,0,170,0,56,155,113,3]), bytes(label + '\0'))), payload))
const store = () => sb('c2pa', 'c2pa', sb('c2ma', 'manifest', sb('c2cl', 'c2pa.claim', box('cbor', new Uint8Array([0xa0])))))
const app11 = (s: Uint8Array) => cat(new Uint8Array([74,80,0,1,0,0,0,1]), s)
const xml = (attrs = '') => `<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:d="http://purl.org/dc/terms/" xmlns:i="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:t="urn:unrelated" t:rights="Copyright retained" ${attrs}/></r:RDF>`
const xmp = (s: string) => bytes('http://ns.adobe.com/xap/1.0/\0' + s)
const consent = { c2paConsent: true, rightsConsent: true }
function crc(data: Uint8Array) { let c = 0xffffffff; for (const b of data) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 } return (c ^ 0xffffffff) >>> 0 }
function png(data: Uint8Array, kind: string, payload: Uint8Array) { const chunk = new Uint8Array(payload.length + 12); const v = new DataView(chunk.buffer); v.setUint32(0, payload.length); chunk.set(bytes(kind), 4); chunk.set(payload, 8); v.setUint32(chunk.length - 4, crc(chunk.subarray(4, chunk.length - 4))); return cat(data.subarray(0, 33), chunk, data.subarray(33)) }
function webp(data: Uint8Array, kind: string, payload: Uint8Array) { const chunk = new Uint8Array(8 + payload.length + (payload.length & 1)); chunk.set(bytes(kind)); new DataView(chunk.buffer).setUint32(4, payload.length, true); chunk.set(payload, 8); const out = cat(data, chunk); new DataView(out.buffer).setUint32(4, out.length - 8, true); return out }

test('combined JPEG removes C2PA local pointer then fresh text IDs, preserving unrelated XMP ICC orientation and original', async () => {
  const original = fixture('image-6.jpg')
  let data = jpg(original, 254, bytes('AI parameters: ComfyUI prompt: ' + 'x'.repeat(600)))
  data = jpg(data, 225, xmp(xml('d:provenance="self#jumbf=/c2pa/manifest/c2pa.claim"')))
  data = jpg(data, 235, app11(store()))
  const copy = data.slice(), scan = scanImage(data)
  assert.equal(scan.footprintPlan!.removeC2pa, true)
  assert.equal(scan.footprintPlan!.metadataIds.length, 1)
  for (const c of [{ c2paConsent: false, rightsConsent: true }, { c2paConsent: false, rightsConsent: false }]) {
    const denied = await cleanFootprints(data, c); assert.equal(denied.footprintResult.status, 'BLOCKED'); assert.equal(denied.output, undefined)
  }
  const result = await cleanFootprints(data, consent)
  assert.equal(result.footprintResult.status, 'PARTIALLY_REMOVED') // retained EXIF is deliberately incomplete
  assert.equal(result.output!.removed, 2)
  assert.equal(result.output!.scan.orientation, 6)
  assert.ok(result.output!.scan.records.some(r => r.kind === 'ICC'))
  const decoded = new TextDecoder().decode(result.output!.data)
  assert.ok(decoded.includes('Copyright retained')); assert.equal(decoded.includes('self#jumbf='), false); assert.equal(decoded.includes('ComfyUI'), false)
  assert.equal(result.output!.payloadHash, (await cleanImage(original, [], false)).payloadHash)
  assert.deepEqual(data, copy)
})

test('direct C2PA removal preserves full independent rights text and unrelated local XMP bytes', async () => {
  const base = fixture('image-6.jpg')
  const text = 'AI parameters: ComfyUI prompt: ' + 'x'.repeat(700)
  const retainedXml = xml('t:note="unchanged"')
  const retained = jpg(jpg(base, 254, bytes(text)), 225, xmp(retainedXml))
  const data = jpg(jpg(jpg(base, 254, bytes(text)), 225, xmp(xml('t:note="unchanged" d:provenance="self#jumbf=/c2pa/manifest/c2pa.claim"'))), 235, app11(store()))
  const copy = data.slice(), initial = scanImage(data)
  const rights = initial.records.find(r => r.kind === 'Comment')!
  assert.equal(rights.requiresRightsConsent, true)
  assert.deepEqual(initial.footprintPlan!.metadataIds, [rights.id])
  const result = await cleanFootprints(data, { c2paConsent: true, rightsConsent: false })
  assert.equal(result.footprintResult.status, 'PARTIALLY_REMOVED')
  assert.ok(result.output)
  assert.deepEqual(result.output.data, retained)
  assert.deepEqual(data, copy)
  assert.equal(result.output.removed, 1)
  assert.equal(result.output.payloadHash, (await cleanImage(base, [], false)).payloadHash)
  assert.equal(result.output.scan.c2pa, 'not-detected-not-guaranteed')
  assert.ok(result.footprintResult.after!.evidence.some(e => e.source === 'ComfyUI'))
  const plan = result.footprintResult.plan
  assert.deepEqual(plan.metadataIds, [])
  assert.equal(plan.blocked, false)
  assert.equal(plan.requiresRightsConsent, false)
  assert.equal(plan.fullySupported, false)
  assert.ok(plan.reasons.some(reason => reason.includes('hak onayı')))
  assert.equal(plan.changes.length, 1)
  assert.deepEqual(plan.preserved, result.output.scan.records.map(r => r.id))
  assert.equal(plan.unsupported.includes(rights.id), false)
})

test('direct C2PA authorization works for JPEG PNG WebP and rejects missing or invalid consent', async () => {
  for (const [base, data] of [
    [fixture('progressive.jpg'), jpg(fixture('progressive.jpg'), 235, app11(store()))],
    [fixture('palette.png'), png(fixture('palette.png'), 'caBX', store())],
    [fixture('image-6.webp'), webp(fixture('image-6.webp'), 'C2PA', store())],
  ]) {
    const copy = data!.slice()
    for (const c2paConsent of [false, undefined, 'true', 1]) {
      const denied = await cleanFootprints(data!, { c2paConsent, rightsConsent: false } as any)
      assert.equal(denied.footprintResult.status, 'BLOCKED')
      assert.equal(denied.output, undefined)
    }
    const result = await cleanFootprints(data!, { c2paConsent: true, rightsConsent: false })
    assert.ok(result.output)
    assert.deepEqual(result.output.data, base)
    assert.equal(result.output.payloadHash, (await cleanImage(base!, [], false)).payloadHash)
    assert.deepEqual(data, copy)
  }
})

test('rights-only dedicated metadata without rights consent returns no output and stays preserved', async () => {
  for (const data of [jpg(fixture('progressive.jpg'), 254, bytes('AI parameters: ComfyUI prompt: cat')), png(fixture('palette.png'), 'tEXt', bytes('parameters\0ComfyUI prompt: cat'))]) {
    const copy = data.slice(), scan = scanImage(data)
    assert.equal(scan.footprintPlan!.requiresRightsConsent, true)
    const result = await cleanFootprints(data, { c2paConsent: true, rightsConsent: false })
    assert.equal(result.footprintResult.status, 'BLOCKED')
    assert.equal(result.output, undefined)
    assert.deepEqual(result.footprintResult.plan.metadataIds, [])
    assert.deepEqual(result.footprintResult.plan.changes, [])
    assert.ok(result.footprintResult.plan.preserved.includes(scan.footprintPlan!.metadataIds[0]!))
    assert.deepEqual(data, copy)
    assert.ok((await cleanFootprints(data, consent)).output)
  }
})

test('full bounded PNG text detection beyond 512 preview and exact dedicated block removal', async () => {
  const source = fixture('palette.png')
  const data = png(source, 'tEXt', bytes('parameters\0Prompt: ' + 'x'.repeat(700) + ' Stable Diffusion'))
  const record = scanImage(data).records.find(r => r.kind === 'PNG text')!
  assert.equal(record.preview.includes('Stable Diffusion'), false)
  assert.ok(scanImage(data).footprints!.evidence.some(e => e.category === 'metadata-hint'))
  const result = await cleanFootprints(data, consent)
  assert.ok(result.output); assert.deepEqual(result.output.data, source)
})

test('namespace-aware XMP declaration beyond preview is detected and mixed XMP is never removed', async () => {
  const attrs = `t:padding="${'x'.repeat(700)}" i:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"`
  const data = jpg(fixture('progressive.jpg'), 225, xmp(xml(attrs)))
  const scan = scanImage(data)
  assert.equal(scan.footprints!.state, 'AI_DECLARATION'); assert.equal(scan.footprintPlan!.metadataIds.length, 0)
  assert.equal(describeResults(scan, { name: 'x.jpg', size: data.length }).declarationCount, 1)
  const result = await cleanFootprints(data, consent); assert.equal(result.footprintResult.status, 'BLOCKED'); assert.equal(result.output, undefined)
  const spoof = jpg(fixture('progressive.jpg'), 225, xmp(xml('t:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"')))
  assert.equal(scanImage(spoof).footprints!.evidence.some(e => e.category === 'explicit-ai'), false)
})

test('WebP supported C2PA removal preserves existing metadata and color, while opaque PNG C2PA blocks', async () => {
  const original = fixture('image-6.webp'), data = webp(original, 'C2PA', store()), copy = data.slice()
  const result = await cleanFootprints(data, consent)
  assert.ok(result.output); assert.deepEqual(result.output.data, original); assert.deepEqual(data, copy)
  assert.equal(result.output.scan.orientation, 6)
  const opaque = png(fixture('palette.png'), 'caBX', bytes('opaque'))
  const denied = await cleanFootprints(opaque, consent)
  assert.equal(denied.footprintResult.status, 'BLOCKED'); assert.equal(denied.output, undefined)
})

test('failed hash verification releases neither C2PA intermediate nor any bytes', async () => {
  const source = jpg(fixture('progressive.jpg'), 235, app11(store())), copy = source.slice()
  const digest = globalThis.crypto.subtle.digest
  globalThis.crypto.subtle.digest = async () => { throw new Error('hash unavailable') }
  try {
    const result = await cleanFootprints(source, consent)
    assert.equal(result.footprintResult.status, 'VERIFICATION_FAILED'); assert.equal(result.output, undefined); assert.deepEqual(source, copy)
  } finally { globalThis.crypto.subtle.digest = digest }
})

test('Worker unified contract returns report without blob on denial and verified output on success, preserving source for retry', async () => {
  const worker = readFileSync(new URL('./inspect.worker.ts', import.meta.url), 'utf8')
  const messages: any[] = []
  const self = { onmessage: undefined as any, postMessage: (value: unknown) => messages.push(value) }
  runInNewContext(stripTypeScriptTypes(worker.replace(/^import\b[\s\S]*?\bfrom\s*['"][^'"]+['"];?[ \t]*\r?\n/gm, '')), { self, Error, Uint8Array, Blob, validateSelection, scanImage, cleanImage, cleanC2pa, cleanFootprints, readC2pa })
  const data = png(fixture('palette.png'), 'tEXt', bytes('parameters\0ComfyUI'))
  await self.onmessage({ data: { type: 'scan', file: new File([data], 'sample.png') } })
  assert.equal(messages.at(-1).scan.footprints.state, 'METADATA_HINTS')
  assert.equal(messages.at(-1).scan.footprintPlan.metadataIds.length, 1)
  await self.onmessage({ data: { type: 'clean-footprints', c2paConsent: false, rightsConsent: false } })
  assert.equal(messages.at(-1).footprintResult.status, 'BLOCKED'); assert.equal(messages.at(-1).output, undefined)
  await self.onmessage({ data: { type: 'clean-footprints', ...consent } })
  const result = messages.at(-1)
  assert.equal(result.type, 'clean-footprints'); assert.equal(result.footprintResult.status, 'REMOVED_VERIFIED')
  assert.equal(result.output.blob.type, 'image/png'); assert.equal(result.output.footprintResult.status, 'REMOVED_VERIFIED')
  assert.deepEqual(new Uint8Array(await result.output.blob.arrayBuffer()), fixture('palette.png'))
})

test('Worker ignores concurrent clean requests and never publishes an intermediate C2PA stage', async () => {
  const worker = readFileSync(new URL('./inspect.worker.ts', import.meta.url), 'utf8')
  const messages: any[] = []
  const self = { onmessage: undefined as any, postMessage: (value: unknown) => messages.push(value) }
  runInNewContext(stripTypeScriptTypes(worker.replace(/^import\b[\s\S]*?\bfrom\s*['"][^'"]+['"];?[ \t]*\r?\n/gm, '')), { self, Error, Uint8Array, Blob, validateSelection, scanImage, cleanImage, cleanC2pa, cleanFootprints, readC2pa })
  const data = jpg(fixture('progressive.jpg'), 235, app11(store()))
  await self.onmessage({ data: { type: 'scan', file: new File([data], 'sample.jpg') } })
  const digest = globalThis.crypto.subtle.digest
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  globalThis.crypto.subtle.digest = async function (...args: Parameters<typeof digest>) { entered(); await gate; return digest.apply(this, args) }
  try {
    const pending = self.onmessage({ data: { type: 'clean-footprints', ...consent } })
    await started
    await self.onmessage({ data: { type: 'clean-footprints', ...consent } })
    assert.equal(messages.length, 1)
    release(); await pending
    assert.equal(messages.length, 2)
    assert.equal(messages[1].type, 'clean-footprints')
    assert.ok(messages[1].output)
  } finally { release(); globalThis.crypto.subtle.digest = digest }
})

test('provenance does not imply AI; only standard aiSources does, never vendor name', () => {
  const scan = scanImage(fixture('palette.png'))
  const manifest = { label: 'x', claimGenerator: ['Gemini'], assertions: [], actions: [], signature: 'present-unverified' as const, aiSources: [] as string[] }
  const report = { status: 'readable-unverified' as const, manifests: [manifest], reason: '', signatureVerification: 'not-performed' as const }
  assert.equal(buildFootprints(scan, report).footprints.state, 'PROVENANCE_ONLY')
  manifest.aiSources.push('http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia')
  assert.equal(buildFootprints(scan, report).footprints.state, 'AI_DECLARATION')
})

test('plan lists preserved mixed metadata, planned effects and unsupported scope separately from detection', () => {
  const data = jpg(jpg(fixture('progressive.jpg'), 225, xmp(xml('i:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"'))), 254, bytes('AI parameters: ComfyUI'))
  const scan = scanImage(data), plan = scan.footprintPlan!
  assert.equal(scan.footprints!.state, 'AI_DECLARATION')
  assert.equal(plan.metadataIds.length, 1)
  assert.equal(plan.unsupported.length, 1)
  assert.ok(plan.preserved.includes(scan.records.find(r => r.kind === 'XMP')!.id))
  assert.equal(plan.fullySupported, false)
  assert.ok(plan.changes.length && plan.impacts.length && plan.reasons.length)
})

test('external and duplicate local references block the entire unified operation without releasing output', async () => {
  for (const attrs of ['d:provenance="https://example.invalid/store.c2pa"', 'd:provenance="self#jumbf=/c2pa/manifest/c2pa.claim"']) {
    let data = jpg(jpg(fixture('progressive.jpg'), 235, app11(store())), 225, xmp(xml(attrs)))
    if (!attrs.includes('https:')) data = jpg(data, 225, xmp(xml(attrs)))
    data = jpg(data, 254, bytes('AI parameters: ComfyUI'))
    for (const rightsConsent of [false, true]) {
      const result = await cleanFootprints(data, { c2paConsent: true, rightsConsent })
      assert.equal(result.footprintResult.status, 'BLOCKED')
      assert.equal(result.output, undefined)
      assert.equal(result.footprintResult.plan.blocked, true)
    }
  }
})

test('C2PA-only JPEG and PNG produce verified removal without declaring AI generation', async () => {
  for (const data of [jpg(fixture('progressive.jpg'), 235, app11(store())), png(fixture('palette.png'), 'caBX', store())]) {
    assert.equal(scanImage(data).footprints!.state, 'PROVENANCE_ONLY')
    const result = await cleanFootprints(data, consent)
    assert.ok(result.output)
    assert.ok(['REMOVED_VERIFIED', 'PARTIALLY_REMOVED'].includes(result.footprintResult.status))
    assert.equal(result.output.scan.c2pa, 'not-detected-not-guaranteed')
  }
})

test('dedicated contexts preserve rights, negation, unrelated prose and PNG language headers', async () => {
  for (const body of ['ComfyUI prompt: cat Copyright Alice', 'ComfyUI prompt: cat author Alice', 'ComfyUI prompt: cat creator Alice', 'ComfyUI prompt: cat license CC0', 'ComfyUI prompt: cat credit Alice', 'ComfyUI prompt: cat © Alice', 'ComfyUI prompt: cat not AI generated', 'ComfyUI mentioned in article']) {
    for (const data of [jpg(fixture('progressive.jpg'), 254, bytes('AI parameters: ' + body)), png(fixture('palette.png'), 'tEXt', bytes('parameters\0' + body))]) {
      const result = await cleanFootprints(data, consent)
      assert.equal(result.footprintResult.plan.metadataIds.length, 0)
      assert.equal(result.output, undefined)
    }
  }
  const nulComment = jpg(fixture('progressive.jpg'), 254, bytes('parameters\0ComfyUI'))
  assert.equal(scanImage(nulComment).footprintPlan!.metadataIds.length, 0)
  for (const payload of ['parameters\0\0\0en\0Copyright Alice\0ComfyUI prompt: cat', 'Parameters\0ComfyUI']) {
    const scan = scanImage(png(fixture('palette.png'), payload.includes('en\0') ? 'iTXt' : 'tEXt', bytes(payload)))
    assert.equal(scan.footprintPlan!.metadataIds.length, 0)
  }
  const pure = png(fixture('palette.png'), 'iTXt', bytes('parameters\0\0\0\0\0ComfyUI prompt: cat'))
  assert.equal(scanImage(pure).footprintPlan!.metadataIds.length, 1)
})

test('dedicated parameter grammar rejects unknown keys, narrative and embedded ownership without output', async () => {
  for (const body of ['Prompt: cat\nprivate note:555', 'ComfyUI prompt:cat\nAll rights reserved', 'Prompt: cat\nunknown: value', 'Prompt: cat\nunkeyed narrative', 'Prompt: cat All rights reserved', 'Prompt: cat (c) Alice', 'Prompt: cat property of Alice', 'Prompt: cat trademark Alice', 'Prompt: cat private note:555', 'x'.repeat(700) + ' Stable Diffusion']) {
    for (const data of [png(fixture('palette.png'), 'tEXt', bytes('parameters\0' + body)), jpg(fixture('progressive.jpg'), 254, bytes('AI parameters: ' + body))]) {
      const result = await cleanFootprints(data, consent)
      assert.equal(result.footprintResult.plan.metadataIds.length, 0, body)
      assert.equal(result.output, undefined, body)
    }
  }
})

test('known parameter lines and inline recognized tool header remain removable with uncertain hints', async () => {
  for (const body of ['Prompt: cat\nNegative_prompt: dog\nSeed: 555\nSteps: 20\nSampler: Euler\nCFG scale: 7\nModel: example\nSize: 512x512', 'ComfyUI\nPrompt: cat\nSeed: 555', 'ComfyUI prompt: synthetic test only', 'Prompt: arbitrary single prompt value']) {
    for (const data of [png(fixture('palette.png'), 'tEXt', bytes('parameters\0' + body)), jpg(fixture('progressive.jpg'), 254, bytes('AI parameters: ' + body))]) {
      const scan = scanImage(data)
      assert.equal(scan.footprintPlan!.metadataIds.length, 1, body)
      assert.equal(describeResults(scan, { name: 'sample', size: data.length }).aiState, 'uncertain')
      assert.ok((await cleanFootprints(data, consent)).output, body)
    }
  }
  const hinted = scanImage(png(fixture('palette.png'), 'tEXt', bytes('Description\0ComfyUI')))
  assert.equal(hinted.footprints!.state, 'METADATA_HINTS')
  assert.equal(hinted.footprints!.incomplete, false)
  assert.equal(describeResults(hinted, { name: 'hint.png', size: 1 }).aiState, 'uncertain')
})

test('XMP source syntax rejects nested, structured, mixed, qualified and conflicting claims', () => {
  const type = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'
  const wrapper = (body: string) => `<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:i="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:t="urn:test"><r:Description>${body}</r:Description></r:RDF>`
  for (const body of [`<t:object i:DigitalSourceType="${type}"/>`, `<i:DigitalSourceType><r:Bag/></i:DigitalSourceType>`, `<i:DigitalSourceType r:resource="${type}">other</i:DigitalSourceType>`, `<i:DigitalSourceType t:qualifier="x">${type}</i:DigitalSourceType>`, `<i:DigitalSourceType>${type}</i:DigitalSourceType><i:DigitalSourceType>https://example.test/other</i:DigitalSourceType>`]) {
    const scan = scanImage(jpg(fixture('progressive.jpg'), 225, xmp(wrapper(body))))
    assert.equal(scan.footprints!.incomplete, true)
    assert.equal(scan.footprints!.evidence.some(e => e.category === 'explicit-ai'), false)
    assert.equal(describeResults(scan, { name: 'x.jpg', size: 1 }).aiState, 'uncertain')
  }
  for (const key of ['prompt', 'seed', 'negative_prompt', 'sampler', 'cfg_scale']) {
    assert.ok(analyzeXmp(bytes(wrapper(`<t:${key}>123</t:${key}>`))).hints?.includes('generation-parameters'))
  }
  const raw = scanImage(jpg(fixture('progressive.jpg'), 225, xmp('<broken>ComfyUI')))
  assert.ok(raw.footprints!.evidence.some(e => e.category === 'metadata-hint'))
  assert.equal(raw.footprints!.incomplete, true)
})

test('retained opaque profiles APP0 and IPTC cannot become no-records or fully supported', () => {
  for (const data of [png(fixture('palette.png'), 'tEXt', bytes('raw profile type exif\0ComfyUI')), jpg(fixture('progressive.jpg'), 224, bytes('JFXX\0opaque')), jpg(fixture('progressive.jpg'), 224, bytes('unknown APP0')), jpg(fixture('progressive.jpg'), 224, bytes('JFIF\0opaque')), jpg(fixture('progressive.jpg'), 237, bytes('ComfyUI prompt: cat'))]) {
    const scan = scanImage(data)
    assert.equal(scan.footprints!.incomplete, true)
    assert.equal(scan.footprintPlan!.fullySupported, false)
    assert.equal(describeResults(scan, { name: 'x', size: data.length }).aiState, 'uncertain')
  }
  assert.ok(scanImage(jpg(fixture('progressive.jpg'), 237, bytes('ComfyUI'))).footprints!.evidence.length)
  assert.equal(scanImage(fixture('image-6.jpg')).footprints!.incomplete, true)
})

test('fresh target mismatch rejects atomic output instead of silently changing the initial plan', async () => {
  const engine = readFileSync(new URL('./engine.ts', import.meta.url), 'utf8')
  let calls = 0
  const isolated = runInNewContext(stripTypeScriptTypes(engine.replace(/^import\b[\s\S]*?\bfrom\s*['"][^'"]+['"];?[ \t]*\r?\n/gm, '').replace(/\bexport /g, '')) + '\ncleanFootprints', {
    Uint8Array, Uint32Array, DataView, TextDecoder, TextEncoder, SharedArrayBuffer, crypto: globalThis.crypto,
    validateC2paStore, resolveLocalC2paReference, analyzeXmp, removeXmpReference, readC2pa, classifyFootprintText, consentFootprintPlan,
    buildFootprints: (...args: Parameters<typeof buildFootprints>) => {
      const report = buildFootprints(...args)
      if (++calls === 2) report.footprintPlan.metadataIds = []
      return report
    },
  }) as typeof cleanFootprints
  const data = png(fixture('palette.png'), 'tEXt', bytes('parameters\0ComfyUI prompt: cat'))
  const result = await isolated(data, consent)
  assert.equal(calls, 2)
  assert.equal(result.footprintResult.status, 'VERIFICATION_FAILED')
  assert.equal(result.output, undefined)
})

test('orientation retained after dedicated removal reports partial with final preserved count and shared provenance', async () => {
  const data = jpg(jpg(fixture('progressive.jpg'), 225, xmp(xml('t:orientation="6"'))), 254, bytes('AI parameters: ComfyUI prompt: cat'))
  const scan = scanImage(data)
  assert.ok(scan.provenance)
  assert.ok(scan.footprintPlan!.reasons.some(reason => reason.includes('Yön')))
  const result = await cleanFootprints(data, consent)
  assert.equal(result.footprintResult.status, 'PARTIALLY_REMOVED')
  assert.equal(result.output!.retained, result.output!.scan.records.length)
  assert.deepEqual(result.footprintResult.plan.preserved, result.output!.scan.records.map(r => r.id))
})

test('no records, ordinary hint, malformed XMP and compressed data have honest non-output states', async () => {
  assert.equal((await cleanFootprints(fixture('palette.png'), consent)).footprintResult.status, 'NOTHING_TO_REMOVE')
  for (const data of [jpg(fixture('progressive.jpg'), 254, bytes('Copyright Alice. ComfyUI mentioned in article.')), jpg(fixture('progressive.jpg'), 225, xmp('<broken>')), png(fixture('palette.png'), 'zTXt', new Uint8Array([65,0,0,120,156,0]))]) {
    const result = await cleanFootprints(data, consent)
    assert.equal(result.footprintResult.status, 'BLOCKED'); assert.equal(result.output, undefined)
  }
})
