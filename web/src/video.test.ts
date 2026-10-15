import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanVideo, videoChunks, verifyVideo } from './video.ts'

const cat = (...arrays: Uint8Array[]) => Uint8Array.from(arrays.flatMap(a => Array.from(a)))
const word = (n: number) => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n); return a }
const str = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const box = (type: string, ...payload: Uint8Array[]) => { const data = cat(...payload); return cat(word(data.length + 8), str(type), data) }
const full = (type: string, ...payload: Uint8Array[]) => box(type, word(0), ...payload)
const set = (a: Uint8Array, p: number, n: number) => { new DataView(a.buffer).setUint32(p, n) }
const ftyp = box('ftyp', str('isom'), word(0), str('isom'))
const validAvc = Uint8Array.of(1, 66, 0, 31, 255, 225, 0, 1, 103, 1, 0, 1, 104)
const validEsds = cat(word(0), Uint8Array.of(3, 25, 0, 1, 0, 4, 17, 64, 21), new Uint8Array(11), Uint8Array.of(5, 2, 18, 16, 6, 1, 2))
const fixture = (options: { front?: boolean; co64?: boolean; extra?: Uint8Array; metadata?: string; mediaSize?: number; rotation?: boolean; version1?: boolean; sampleLeaves?: Uint8Array; mediaHeader?: Uint8Array; audio?: boolean } = {}) => {
  const mv = new Uint8Array(options.version1 ? 112 : 100), tk = new Uint8Array(options.version1 ? 96 : 84), md = new Uint8Array(options.version1 ? 36 : 24)
  for (const a of [mv, tk, md]) { a[0] = options.version1 ? 1 : 0; set(a, 4, 42); set(a, options.version1 ? 12 : 8, 43) }
  for (const a of [mv, md]) { set(a, options.version1 ? 20 : 12, 1000); set(a, options.version1 ? 28 : 16, 1000) }
  set(tk, options.version1 ? 20 : 12, 1)
  const matrix = options.version1 ? 52 : 40
  set(tk, matrix, options.rotation ? 0 : 65536); set(tk, matrix + 4, options.rotation ? 65536 : 0)
  set(tk, matrix + 12, options.rotation ? 0xffff0000 : 0); set(tk, matrix + 16, options.rotation ? 0 : 65536); set(tk, matrix + 32, 1073741824)
  set(tk, tk.length - 8, 32 * 65536); set(tk, tk.length - 4, 24 * 65536)
  const sample = new Uint8Array(78); sample[7] = 1; sample[75] = 24
  const payload = new Uint8Array(options.mediaSize ?? 32).fill(7)
  const moov = (offset: number) => {
    const stbl = box('stbl',
      full('stsd', word(1), options.audio ? box('mp4a', cat(new Uint8Array(7), Uint8Array.of(1), new Uint8Array(20)), options.sampleLeaves ?? box('esds', validEsds)) : box('avc1', sample, options.sampleLeaves ?? box('avcC', validAvc))),
      full('stts', word(1), word(1), word(1000)), full('stsc', word(1), word(1), word(1), word(1)),
      full('stsz', word(payload.length), word(1)),
      full(options.co64 ? 'co64' : 'stco', word(1), ...(options.co64 ? [word(0), word(offset)] : [word(offset)])))
    const minf = box('minf', options.mediaHeader ?? (options.audio ? full('smhd', new Uint8Array(4)) : box('vmhd', word(1), new Uint8Array(8))), box('dinf', full('dref', word(1), box('url ', word(1)))), stbl)
    const mdia = box('mdia', box('mdhd', md), full('hdlr', word(0), str(options.audio ? 'soun' : 'vide'), new Uint8Array(12), str(options.audio ? 'SoundHandler\0' : 'VideoHandler\0')), minf)
    const tag = box('©too', box('data', word(1), word(0), new TextEncoder().encode(options.metadata ?? 'Fixture software')))
    const meta = box('meta', word(0), full('hdlr', word(0), str('mdir'), new Uint8Array(12)), box('ilst', tag))
    return box('moov', box('mvhd', mv), box('trak', box('tkhd', tk), mdia), box('udta', meta), ...(options.extra ? [options.extra] : []))
  }
  const movie = moov(0)
  const actual = moov(ftyp.length + (options.front ? movie.length : 0) + 8)
  return new Blob(options.front ? [ftyp, actual, box('mdat', payload)] : [ftyp, box('mdat', payload), actual])
}
const clean = async (file: Blob, format: 'MP4' | 'MOV' = 'MP4') => {
  const scan = await scanVideo(file, format), chunks: Uint8Array[] = []
  for await (const chunk of videoChunks(file, scan, scan.records.map(r => r.id), true)) chunks.push(chunk)
  const output = new Blob(chunks)
  return { scan, output, result: await verifyVideo(file, output, scan, scan.records.map(r => r.id), true) }
}
const mutate = async (file: Blob, type: string, offset: number, value: number) => {
  const bytes = new Uint8Array(await file.arrayBuffer()), needle = str(type)
  const p = bytes.findIndex((_, i) => needle.every((v, j) => bytes[i + j] === v))
  assert.ok(p >= 0, type)
  set(bytes, p + 4 + offset, value)
  return new Blob([bytes])
}

for (const front of [false, true]) for (const co64 of [false, true]) test(`same-size cleanup moov front=${front} co64=${co64}`, async () => {
  const file = fixture({ front, co64 }), { scan, output, result } = await clean(file)
  assert.equal(scan.cleaningBlocked, false)
  assert.equal(output.size, file.size)
  assert.deepEqual([result.width, result.height, result.orientation], [32, 24, 1])
  assert.equal(result.records.length, 0)
  const a = new Uint8Array(await file.arrayBuffer()), b = new Uint8Array(await output.arrayBuffer())
  assert.deepEqual(a.subarray(ftyp.length + (front ? file.size - ftyp.length - 40 : 0) + 8, ftyp.length + (front ? file.size - ftyp.length - 40 : 0) + 40), b.subarray(ftyp.length + (front ? file.size - ftyp.length - 40 : 0) + 8, ftyp.length + (front ? file.size - ftyp.length - 40 : 0) + 40))
})

test('timestamp v1 and rotation preserved', async () => {
  const { result } = await clean(fixture({ version1: true, rotation: true }))
  assert.equal(result.orientation, 6)
})
test('rights consent, duplicate IDs, stale scans and unknown selections fail closed', async () => {
  const file = fixture(), scan = await scanVideo(file, 'MP4'), tag = scan.records.find(r => r.kind === '©too')!
  assert.equal(tag.status, 'protected')
  const drain = async (ids: string[], rights: boolean, s = scan) => { for await (const chunk of videoChunks(file, s, ids, rights)) assert.ok(chunk) }
  await assert.rejects(drain([tag.id], false), /rights consent/)
  await assert.rejects(drain([tag.id, tag.id], true), /duplicate/)
  await assert.rejects(drain(['bogus'], true), /selection/)
  await assert.rejects(drain([], false, { ...scan, width: 999 }), /stale/)
  const chunks: Uint8Array[] = []
  const ids = scan.records.filter(r => !r.requiresRightsConsent).map(r => r.id)
  for await (const c of videoChunks(file, scan, ids, false)) chunks.push(c)
  const result = await verifyVideo(file, new Blob(chunks), scan, ids, false)
  assert.deepEqual(result.records, [tag])
})
for (const extra of [box('uuid', new Uint8Array(16)), box('moof'), box('pssh'), box('mvex'), box('zzzz'), box('free', str('hidden'))]) test(`unsafe box ${four(extra)} blocks all cleaning`, async () => {
  const file = fixture({ extra }), scan = await scanVideo(file, 'MP4')
  assert.equal(scan.cleaningBlocked, true)
  await assert.rejects(clean(file), /cleaning blocked/)
})
function four(bytes: Uint8Array) { return String.fromCharCode(...bytes.subarray(4, 8)) }
test('C2PA text blocks entire cleaning even with consent', async () => {
  const file = fixture({ metadata: 'c2pa manifest store' }), scan = await scanVideo(file, 'MP4')
  assert.equal(scan.cleaningBlocked, true)
  assert.notEqual(scan.c2pa, 'not-detected-not-guaranteed')
  await assert.rejects(clean(file), /cleaning blocked/)
})
for (const [type, offset, value, message] of [
  ['stco', 8, 0, /outside mdat/], ['stco', 8, 99999999, /outside mdat/],
  ['co64', 8, 0x200000, /64-bit/], ['stco', 4, 200001, /budget/],
  ['stsc', 12, 2, /overrun/], ['stts', 8, 2, /sample count/],
  ['stsz', 8, 0, /count/], ['tkhd', 0, 0x02000000, /layout/],
  ['mvhd', 12, 0, /timescale/], ['stsd', 4, 2, /cleaning blocked/],
] as const) test(`corrupt ${type}/${offset} rejected`, async () => {
  const file = await mutate(fixture({ co64: type === 'co64' }), type, offset, value)
  await assert.rejects(clean(file), message)
})
test('external data references and encrypted sample entries block', async () => {
  const external = await mutate(fixture(), 'url ', 0, 0)
  assert.equal((await scanVideo(external, 'MP4')).cleaningBlocked, true)
  const bytes = new Uint8Array(await fixture().arrayBuffer())
  const at = bytes.findIndex((_, i) => four(bytes.subarray(i - 4, i + 4)) === 'avc1')
  bytes.set(str('encv'), at)
  assert.equal((await scanVideo(new Blob([bytes]), 'MP4')).cleaningBlocked, true)
})
test('file size, box boundaries, count, depth and metadata budgets', async () => {
  await assert.rejects(scanVideo(new Blob([new Uint8Array(10)]), 'MP4'), /size/)
  await assert.rejects(scanVideo({ size: 1000000001 } as Blob, 'MP4'), /size/)
  await assert.rejects(scanVideo(new Blob([ftyp, word(1000), str('moov')]), 'MP4'), /bounds/)
  await assert.rejects(scanVideo(new Blob([ftyp, word(1), str('moov')]), 'MP4'), /extended/)
  await assert.rejects(scanVideo(new Blob([ftyp, word(0), str('moov')]), 'MP4'), /zero-size/)
  await assert.rejects(scanVideo(new Blob([ftyp, ...Array.from({ length: 16384 }, () => box('free'))]), 'MP4'), /count limit/)
  await assert.rejects(scanVideo(fixture({ metadata: 'x'.repeat(1024 * 1024) }), 'MP4'), /metadata budget/)
})
test('all output bytes independently checked including media, table, header and nonselected metadata', async () => {
  const file = fixture({ mediaSize: 2 * 1024 * 1024 + 100 }), { scan, output } = await clean(file)
  const ids = scan.records.map(r => r.id)
  for (const position of [0, 30, 1024 * 1024, output.size - 1]) {
    const bytes = new Uint8Array(await output.arrayBuffer()); bytes[position] ^= 1
    await assert.rejects(verifyVideo(file, new Blob([bytes]), scan, ids, true), /byte mismatch/)
  }
  await assert.rejects(verifyVideo(file, output.slice(1), scan, ids, true), /size/)
})
test('incremental Blob reads never exceed 1MiB or read entire file', async () => {
  const original = fixture({ mediaSize: 3 * 1024 * 1024 + 100 })
  let reads = 0, maximum = 0
  class Guarded extends Blob {
    async arrayBuffer(): Promise<ArrayBuffer> { throw new Error('whole Blob forbidden') }
    slice(start = 0, end = this.size, contentType = ''): Blob {
      const length = end - start
      maximum = Math.max(maximum, length); reads++
      assert.ok(length <= 1024 * 1024)
      return super.slice(start, end, contentType)
    }
  }
  const guarded = new Guarded([original]), { output, scan } = await clean(guarded)
  await verifyVideo(guarded, new Guarded([output]), scan, scan.records.map(r => r.id), true)
  assert.equal(maximum, 1024 * 1024)
  assert.ok(reads > 10)
})

test('parser reuses a bounded 64KiB window without swallowing cancellation or short reads', async () => {
  let reads = 0
  class Counted extends Blob {
    slice(start = 0, end = this.size, type = ''): Blob {
      reads++
      assert.ok(end - start <= 65536)
      return super.slice(start, end, type)
    }
  }
  const file = new Counted([fixture({ mediaSize: 128 * 1024 })])
  const scan = await scanVideo(file, 'MP4')
  assert.equal(scan.cleaningBlocked, false)
  assert.equal(reads, 4)
  let checks = 0
  await assert.rejects(scanVideo(file, 'MP4', () => { if (++checks === 10) throw new Error('cancel cached read') }), /cancel cached read/)
  class Short extends Blob { slice(): Blob { return new Blob([]) } }
  await assert.rejects(scanVideo(new Short([file]), 'MP4'), /short read/)
})

test('cooperative cancellation during scanning and output verification rejects', async () => {
  const file = fixture({ mediaSize: 2 * 1024 * 1024 })
  const cancelled = () => { throw new Error('cancelled') }
  await assert.rejects(scanVideo(file, 'MP4', cancelled), /cancelled/)
  const { scan, output } = await clean(file)
  await assert.rejects(verifyVideo(file, output, scan, scan.records.map(r => r.id), true, cancelled), /cancelled/)
  let stop = false
  const iterator = videoChunks(file, scan, [], false, () => { if (stop) cancelled() })
  assert.equal((await iterator.next()).done, false)
  stop = true
  await assert.rejects(iterator.next(), /cancelled/)
})
test('replacement spanning 1MiB chunk boundary and extended box preserves layout', async () => {
  await clean(fixture({ front: false, mediaSize: 1024 * 1024 - 600, metadata: 'x'.repeat(3000) }))
  const bytes = new Uint8Array(await fixture().arrayBuffer())
  const mdat = ftyp.length
  const extended = cat(bytes.subarray(0, mdat), word(1), str('mdat'), word(0), word(48), bytes.subarray(mdat + 8))
  const stco = extended.findIndex((_, i) => str('stco').every((v, j) => extended[i + j] === v))
  set(extended, stco + 12, ftyp.length + 16)
  await clean(new Blob([extended]))
})
test('invalid metadata encoding and opaque meta handler block cleaning', async () => {
  const encoded = await mutate(fixture(), 'data', 0, 2)
  assert.equal((await scanVideo(encoded, 'MP4')).cleaningBlocked, true)
  const bytes = new Uint8Array(await fixture().arrayBuffer())
  const at = bytes.findIndex((_, i) => str('mdir').every((v, j) => bytes[i + j] === v))
  bytes.set(str('mdta'), at)
  assert.equal((await scanVideo(new Blob([bytes]), 'MP4')).cleaningBlocked, true)
})

for (const type of ['vmhd', 'smhd']) for (const variant of ['short', 'long', 'version', 'flags', 'fields']) test(`${type} rejects ${variant} layout`, async () => {
  const data = cat(word(type === 'vmhd' ? 1 : 0), new Uint8Array(type === 'vmhd' ? 8 : 4))
  if (variant === 'version') data[0] = 1
  if (variant === 'flags') data[3] = type === 'vmhd' ? 0 : 1
  if (variant === 'fields') data[data.length - 1] = 1
  const payload = variant === 'short' ? data.subarray(0, data.length - 1) : variant === 'long' ? cat(data, Uint8Array.of(0)) : data
  await assert.rejects(scanVideo(fixture({ audio: type === 'smhd', mediaHeader: box(type, payload) }), 'MP4'), new RegExp(type))
})
const validLeaves = {
  pasp: cat(word(1), word(1)), btrt: new Uint8Array(12), fiel: Uint8Array.of(1, 0),
  colr: cat(str('nclx'), Uint8Array.of(0, 1, 0, 1, 0, 1, 128)), avcC: validAvc, esds: validEsds,
}
for (const [type, data] of Object.entries(validLeaves)) for (const variant of ['short', 'long']) test(`${type} rejects ${variant} payload`, async () => {
  const payload = variant === 'short' ? data.subarray(0, data.length - 1) : cat(data, Uint8Array.of(0))
  const leaves = type === 'avcC' || type === 'esds' ? box(type, payload) : cat(box('avcC', validAvc), box(type, payload))
  await assert.rejects(scanVideo(fixture({ audio: type === 'esds', sampleLeaves: leaves }), 'MP4'), new RegExp(type))
})
test('supported fixed sample leaves preserved byte-for-byte and unknown colr blocked', async () => {
  for (const colr of [validLeaves.colr, cat(str('nclc'), Uint8Array.of(0, 1, 0, 1, 0, 1))]) {
    const leaves = cat(box('avcC', validAvc), box('pasp', validLeaves.pasp), box('btrt', validLeaves.btrt), box('fiel', validLeaves.fiel), box('colr', colr))
    await clean(fixture({ sampleLeaves: leaves }))
  }
  const scan = await scanVideo(fixture({ sampleLeaves: cat(box('avcC', validAvc), box('colr', str('prof'), new Uint8Array(12))) }), 'MP4')
  assert.equal(scan.cleaningBlocked, true)
  assert.ok(scan.notes.some(n => n.includes('Unknown colr')))
  const audio = await scanVideo(fixture({ audio: true }), 'MP4')
  assert.ok(audio.notes.some(n => n.includes('video track')))
})
for (const [type, offset, value] of [
  ['pasp', 3, 0], ['fiel', 1, 255], ['colr', 10, 1], ['avcC', 0, 2], ['avcC', 4, 254], ['avcC', 5, 224], ['avcC', 7, 255], ['avcC', 8, 104],
  ['esds', 0, 1], ['esds', 3, 1], ['esds', 5, 127], ['esds', 8, 128], ['esds', 9, 7], ['esds', 12, 0],
] as const) test(`${type} rejects flags/fields ${offset}`, async () => {
  const payload = validLeaves[type].slice(); payload[offset] = value
  const leaves = type === 'avcC' || type === 'esds' ? box(type, payload) : cat(box('avcC', validAvc), box(type, payload))
  await assert.rejects(scanVideo(fixture({ audio: type === 'esds', sampleLeaves: leaves }), 'MP4'), new RegExp(type))
})

test('real ffmpeg H264/AAC MP4 and MJPEG/PCM MOV decode identically after cleaning', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'video-engine-'))
  try {
    for (const format of ['MP4', 'MOV'] as const) for (const front of [false, true]) {
      const path = join(directory, `input-${format}-${front}.${format.toLowerCase()}`)
      const args = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=5:duration=0.6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6', '-c:v', format === 'MP4' ? 'libx264' : 'mjpeg', '-c:a', format === 'MP4' ? 'aac' : 'pcm_s16le', '-metadata', 'title=Fixture title', '-metadata', 'copyright=Fixture rights', ...(front ? ['-movflags', '+faststart'] : []), '-y', path]
      const generated = spawnSync('ffmpeg', args, { encoding: 'utf8' })
      assert.equal(generated.status, 0, generated.stderr)
      const input = new Blob([await readFile(path)]), scan = await scanVideo(input, format)
      assert.equal(scan.cleaningBlocked, false, JSON.stringify(scan))
      const { output } = await clean(input, format)
      const outputPath = join(directory, `output-${format}-${front}.${format.toLowerCase()}`)
      await writeFile(outputPath, new Uint8Array(await output.arrayBuffer()))
      const decode = (p: string) => {
        const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', p, '-map', '0:v', '-map', '0:a', '-f', 'framemd5', '-'], { encoding: 'utf8' })
        assert.equal(result.status, 0, result.stderr)
        return result.stdout
      }
      assert.equal(decode(outputPath), decode(path))
      assert.ok(input.size < 100000)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
