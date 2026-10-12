import type { MetadataRecord } from './engine.ts'

export type VideoScan = {
  format: 'MP4' | 'MOV'
  width: number
  height: number
  alpha: boolean
  orientation: number | null
  records: MetadataRecord[]
  c2pa: string
  cleaningBlocked: boolean
  notes: string[]
}
type Box = { type: string; start: number; payload: number; end: number; children: Box[] }
type Patch = { start: number; end: number; value?: Uint8Array }
type Parsed = { scan: VideoScan; patches: Map<string, Patch[]> }
const CHUNK = 1024 * 1024
const MAX_FILE = 1_000_000_000
const MAX_BOXES = 16384
const MAX_ENTRIES = 200000
const MAX_METADATA = 16 * CHUNK
const textDecoder = new TextDecoder('utf-8', { fatal: true })
const fail = (message: string): never => { throw new Error(`Video: ${message}`) }
const u32 = (a: Uint8Array, p = 0): number => new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(p)
const i32 = (a: Uint8Array, p = 0): number => new DataView(a.buffer, a.byteOffset, a.byteLength).getInt32(p)
const fourcc = (a: Uint8Array, p = 0): string => String.fromCharCode(...a.subarray(p, p + 4))
const integer64 = (a: Uint8Array, p = 0): number => {
  const value = u32(a, p) * 4294967296 + u32(a, p + 4)
  if (!Number.isSafeInteger(value)) fail('unsafe 64-bit integer')
  return value
}
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i])
const typeBytes = (value: string): Uint8Array => Uint8Array.from(value, c => c.charCodeAt(0))

async function parseVideo(file: Blob, format: 'MP4' | 'MOV', check?: () => void): Promise<Parsed> {
  if (format !== 'MP4' && format !== 'MOV') fail('format')
  if (!Number.isSafeInteger(file.size) || file.size < 24 || file.size > MAX_FILE) fail('file size limit (1,000,000,000 bytes)')
  const read = async (start: number, length: number): Promise<Uint8Array> => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || length > CHUNK || start + length > file.size) fail('read bounds')
    check?.()
    const bytes = new Uint8Array(await file.slice(start, start + length).arrayBuffer())
    check?.()
    if (bytes.length !== length) fail('short read')
    return bytes
  }
  const scan: VideoScan = {
    format, width: 0, height: 0, alpha: false, orientation: null, records: [],
    c2pa: 'not-detected-not-guaranteed', cleaningBlocked: false,
    notes: ['Yalnız dar, bağımsız ve parçalanmamış ISO BMFF/QuickTime alt kümesi desteklenir; codec çözülmez.', 'C2PA imzası doğrulanmaz; algılanmaması yokluk garantisi değildir.', 'Temizleme kutu boyutunu ve tüm medya/ofset/tablo baytlarını korur; tüm kişisel verilerin kaldırılması garanti edilmez.'],
  }
  const patches = new Map<string, Patch[]>()
  let boxCount = 0, entryCount = 0, metadataBytes = 0
  const block = (reason: string, provenance = false) => {
    scan.cleaningBlocked = true
    if (provenance) scan.c2pa = 'detected-or-uncertain-not-verified'
    if (!scan.notes.includes(reason)) scan.notes.push(reason)
  }
  const budget = (count: number) => {
    entryCount += count
    if (entryCount > MAX_ENTRIES) fail('table entry budget')
  }
  const record = (box: Box, kind: string, replacements: Patch[], rights: boolean, preview = '') => {
    const id = `${kind}:${box.start}`
    scan.records.push({ id, kind, bytes: replacements.reduce((n, p) => n + p.end - p.start, 0), preview: preview.slice(0, 512), status: rights ? 'protected' : 'cleanable', reason: rights ? 'Telif/yetki onayı gerektirir; bilinen metadata kutusu' : 'Yalnız oluşturma/değiştirme zamanları sıfırlanır', requiresRightsConsent: rights })
    patches.set(id, replacements)
  }
  const unsupported = (box: Box, reason: string, provenance = false) => {
    block(reason, provenance)
    scan.records.push({ id: `unsupported:${box.start}`, kind: box.type, bytes: box.end - box.start, preview: '', status: 'unsupported', reason, requiresRightsConsent: false })
  }
  const metadata = async (box: Box) => {
    const length = box.end - box.payload
    metadataBytes += length
    if (metadataBytes > MAX_METADATA || length > CHUNK) fail('metadata budget')
    const bytes = await read(box.payload, length)
    let text = ''
    let content = bytes
    if (box.children.length) {
      if (box.children.length !== 1 || box.children[0]!.type !== 'data') { unsupported(box, 'Metadata data child layout', true); return }
      const data = box.children[0]!, offset = data.payload - box.payload
      if (data.end - data.payload < 8 || u32(bytes, offset) !== 1 || u32(bytes, offset + 4) !== 0) { unsupported(box, 'Metadata encoding/locale unsupported', true); return }
      content = bytes.subarray(offset + 8)
    } else if (format === 'MOV' && box.type.startsWith('©')) {
      if (bytes.length < 4 || bytes[0]! * 256 + bytes[1]! !== bytes.length - 4) { unsupported(box, 'QuickTime metadata layout', true); return }
      content = bytes.subarray(4)
    }
    try { text = textDecoder.decode(content) } catch { unsupported(box, 'Metadata UTF-8 dışı/belirsiz provenance', true); return }
    if (/c2pa|jumbf|content.?credentials|manifest.?store|provenance/i.test(text.replace(/\0/g, ''))) {
      unsupported(box, 'Provenance metadata; tüm temizlik engellendi', true)
      return
    }
    record(box, box.type, [{ start: box.start + 4, end: box.start + 8, value: typeBytes('free') }, { start: box.payload, end: box.end }], true, text.replace(/[\u0000-\u001f\u007f]/g, ' '))
  }
  const lists: Record<string, string[]> = {
    root: ['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'],
    moov: ['mvhd', 'trak', 'udta', 'meta', 'free'],
    trak: ['tkhd', 'mdia', 'edts', 'udta', 'meta', 'free'],
    mdia: ['mdhd', 'hdlr', 'minf'],
    minf: ['vmhd', 'smhd', 'dinf', 'stbl', 'hdlr'],
    dinf: ['dref'], stbl: ['stsd', 'stts', 'ctts', 'stsc', 'stsz', 'stco', 'co64', 'stss', 'sdtp', 'sgpd', 'sbgp'], edts: ['elst'],
    udta: ['meta', '©nam', '©ART', '©wrt', '©too', '©cmt', '©cpy', 'cprt', '©day', '©xyz', '©swr', 'loci', 'free'],
    meta: ['hdlr', 'ilst', 'free'],
    ilst: ['©nam', '©ART', 'aART', '©wrt', '©too', '©cmt', '©cpy', 'cprt', '©day', '©xyz', 'desc', 'ldes', 'cove', 'covr', 'free'],
    item: ['data'], reference: ['url '], sample: ['avc1', 'jpeg', 'mp4a', 'sowt'],
    video: ['avcC', 'pasp', 'colr', 'btrt', 'fiel'], audio: ['esds', 'btrt', 'chan'],
  }
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'dinf', 'stbl', 'edts', 'udta', 'meta', 'ilst'])
  const tags = new Set([...lists.udta, ...lists.ilst].filter(t => !['meta', 'free'].includes(t)))
  const walk = async (start: number, end: number, context: string, depth: number): Promise<Box[]> => {
    if (depth > 12) fail('box depth limit')
    const result: Box[] = []
    while (start < end) {
      if (++boxCount > MAX_BOXES) fail('box count limit')
      if (end - start < 8) fail('truncated box header')
      const header = await read(start, Math.min(16, end - start))
      const shortSize = u32(header), type = fourcc(header, 4)
      let size = shortSize, headerSize = 8
      if (shortSize === 1) {
        if (header.length < 16) fail('truncated extended header')
        size = integer64(header, 8); headerSize = 16
      } else if (shortSize === 0) {
        if (context !== 'root' || type !== 'mdat') fail('zero-size nonterminal media box')
        size = end - start
      }
      if (size < headerSize || size > end - start) fail('box size bounds')
      const box: Box = { type, start, payload: start + headerSize, end: start + size, children: [] }
      result.push(box)
      if (type === 'uuid' || ['jumb', 'c2pa', 'C2PA'].includes(type)) unsupported(box, 'UUID/C2PA/opaque provenance; tüm temizlik engellendi', true)
      else if (!lists[context]?.includes(type)) unsupported(box, `Desteklenmeyen ${context}/${type}; tüm temizlik engellendi`, true)
      else if (type === 'free' || type === 'skip' || type === 'wide') {
        for (let p = box.payload; p < box.end; p += CHUNK) {
          if ((await read(p, Math.min(CHUNK, box.end - p))).some(v => v !== 0)) { unsupported(box, 'Opak padding/provenance', true); break }
        }
      } else if (containers.has(type)) {
        let childStart = box.payload
        if (type === 'meta') {
          if (box.end - childStart < 4 || u32(await read(childStart, 4)) !== 0) { unsupported(box, 'QuickTime meta varyantı desteklenmiyor', true); start = box.end; continue }
          childStart += 4
        }
        box.children = await walk(childStart, box.end, type, depth + 1)
        if (type === 'meta') {
          const handlers = box.children.filter(b => b.type === 'hdlr')
          if (handlers.length !== 1 || box.children.filter(b => b.type === 'ilst').length !== 1) unsupported(box, 'Metadata handler/list layout', true)
          else {
            const handler = handlers[0]!, length = handler.end - handler.payload
            if (length < 24 || length > 256) unsupported(box, 'Metadata handler bounds', true)
            else {
              const data = await read(handler.payload, length)
              if (u32(data) !== 0 || u32(data, 4) !== 0 || fourcc(data, 8) !== 'mdir' || !['appl', '\0\0\0\0'].includes(fourcc(data, 12)) || data.subarray(16).some(v => v !== 0)) unsupported(box, 'Opaque metadata handler/provenance', true)
            }
          }
        }
      } else if (tags.has(type) && (context === 'udta' || context === 'ilst')) {
        if (context === 'ilst') box.children = await walk(box.payload, box.end, 'item', depth + 1)
        await metadata(box)
      }
      start = box.end
    }
    return result
  }
  const top = await walk(0, file.size, 'root', 0)
  const all = (boxes: Box[], type: string) => boxes.filter(b => b.type === type)
  const one = (boxes: Box[], type: string): Box => {
    const matches = all(boxes, type)
    if (matches.length !== 1) fail(`required unique ${type}`)
    return matches[0]!
  }
  const full = async (box: Box, min: number, versions = [0]): Promise<Uint8Array> => {
    if (box.end - box.payload < min) fail(`${box.type} truncated`)
    const data = await read(box.payload, min)
    if (!versions.includes(data[0]!) || data[1] || data[2] || data[3]) fail(`${box.type} version/flags`)
    return data
  }
  const ftyp = one(top, 'ftyp')
  if (ftyp.start !== 0 || (ftyp.end - ftyp.payload) < 8 || (ftyp.end - ftyp.payload) % 4 || ftyp.end - ftyp.payload > 1024) fail('ftyp layout')
  const brands = await read(ftyp.payload, ftyp.end - ftyp.payload)
  const allowedBrands = format === 'MOV' ? ['qt  '] : ['isom', 'iso2', 'mp41', 'mp42', 'avc1']
  if (!allowedBrands.includes(fourcc(brands))) block('Desteklenmeyen major brand')
  for (let p = 8; p < brands.length; p += 4) if (!allowedBrands.includes(fourcc(brands, p))) block('Desteklenmeyen compatible brand')
  const moov = one(top, 'moov'), media = all(top, 'mdat')
  if (!media.length || media.some(b => b.end === b.payload)) fail('missing/empty mdat')
  const timestamps = async (box: Box) => {
    const v = (await read(box.payload, 1))[0]!
    const expected = box.type === 'mvhd' ? (v === 1 ? 112 : 100) : box.type === 'tkhd' ? (v === 1 ? 96 : 84) : (v === 1 ? 36 : 24)
    if (box.end - box.payload !== expected || ![0, 1].includes(v)) fail(`${box.type} layout`)
    const bytes = await read(box.payload, expected)
    if (box.type !== 'tkhd' && (bytes[1] || bytes[2] || bytes[3])) fail(`${box.type} flags`)
    if (box.type === 'tkhd' && (u32(bytes) & 0xffffff) > 7) fail('tkhd flags')
    const length = v === 1 ? 16 : 8
    if (bytes.subarray(4, 4 + length).some(value => value !== 0)) record(box, `${box.type} timestamps`, [{ start: box.payload + 4, end: box.payload + 4 + length }], false)
    if (box.type !== 'tkhd' && u32(bytes, v === 1 ? 20 : 12) === 0) fail('zero timescale')
    return bytes
  }
  await timestamps(one(moov.children, 'mvhd'))
  const tracks = all(moov.children, 'trak')
  if (!tracks.length || tracks.length > 16) fail('track count')
  const trackIds = new Set<number>()
  let videoTracks = 0
  for (const track of tracks) {
    const tkhd = one(track.children, 'tkhd'), tk = await timestamps(tkhd), version = tk[0]!
    const id = u32(tk, version === 1 ? 20 : 12)
    if (!id || trackIds.has(id)) fail('duplicate/zero track ID')
    trackIds.add(id)
    const mdia = one(track.children, 'mdia')
    await timestamps(one(mdia.children, 'mdhd'))
    const handler = one(mdia.children, 'hdlr')
    const hd = await full(handler, 24)
    const handlerType = fourcc(hd, 8)
    if (handlerType !== 'vide' && handlerType !== 'soun') block('Yalnız video/audio track desteklenir')
    if (handler.end - handler.payload > 1024) fail('handler name budget')
    const name = await read(handler.payload + 24, handler.end - handler.payload - 24)
    const handlerName = format === 'MOV' && name.length && name[0] === name.length - 1 ? name.subarray(1) : name
    if (handlerName.some(v => v !== 0) && !/^(VideoHandler|SoundHandler|Core Media Video|Core Media Audio)\0*$/.test(new TextDecoder().decode(handlerName))) block('Özel handler adı korunur; belirsiz metadata')
    if (handlerType === 'vide') {
      videoTracks++
      scan.width = u32(tk, tk.length - 8) / 65536
      scan.height = u32(tk, tk.length - 4) / 65536
      if (!Number.isInteger(scan.width) || !Number.isInteger(scan.height) || scan.width < 1 || scan.height < 1 || scan.width * scan.height > 100000000) fail('video dimensions')
      const matrix = version === 1 ? 52 : 40
      const values = Array.from({ length: 9 }, (_, i) => i32(tk, matrix + i * 4))
      const rotations = [[65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824], [0, 65536, 0, -65536, 0, 0, 0, 0, 1073741824], [-65536, 0, 0, 0, -65536, 0, 0, 0, 1073741824], [0, -65536, 0, 65536, 0, 0, 0, 0, 1073741824]]
      const rotation = rotations.findIndex(r => r.every((value, i) => i === 6 || i === 7 || value === values[i]))
      scan.orientation = rotation < 0 ? null : [1, 6, 3, 8][rotation]!
      if (rotation < 0) block('Özel track dönüşüm matrisi desteklenmiyor')
    }
    const minf = one(mdia.children, 'minf')
    const mediaHeader = one(minf.children, handlerType === 'vide' ? 'vmhd' : 'smhd')
    if (all(minf.children, handlerType === 'vide' ? 'smhd' : 'vmhd').length) fail('conflicting media header')
    const mediaHeaderSize = handlerType === 'vide' ? 12 : 8
    if (mediaHeader.end - mediaHeader.payload !== mediaHeaderSize) fail(`${mediaHeader.type} length`)
    const mh = await read(mediaHeader.payload, mediaHeaderSize)
    if (u32(mh) !== (handlerType === 'vide' ? 1 : 0)) fail(`${mediaHeader.type} version/flags`)
    if (handlerType === 'vide' ? mh.subarray(4).some(v => v !== 0) : mh[6] !== 0 || mh[7] !== 0) fail(`${mediaHeader.type} unsupported fields`)
    for (const dataHandler of all(minf.children, 'hdlr')) {
      const data = await full(dataHandler, 24)
      const tail = await read(dataHandler.payload + 24, dataHandler.end - dataHandler.payload - 24)
      const name = tail[0] === tail.length - 1 ? tail.subarray(1) : tail
      if (format !== 'MOV' || fourcc(data, 4) !== 'dhlr' || fourcc(data, 8) !== 'url ' || !/^(DataHandler)?\0*$/.test(new TextDecoder().decode(name))) block('Unknown data handler')
    }
    const dinf = one(minf.children, 'dinf'), dref = one(dinf.children, 'dref')
    const dr = await full(dref, 8)
    if (u32(dr, 4) !== 1) fail('dref entry count')
    const refs = await walk(dref.payload + 8, dref.end, 'reference', 5)
    if (refs.length !== 1 || refs[0]!.type !== 'url ' || refs[0]!.end - refs[0]!.payload !== 4 || u32(await read(refs[0]!.payload, 4)) !== 1) block('External/encrypted data reference unsupported')
    const stbl = one(minf.children, 'stbl')
    for (const type of ['stsd', 'stts', 'stsc', 'stsz']) one(stbl.children, type)
    for (const type of lists.stbl) if (all(stbl.children, type).length > 1) fail(`duplicate ${type}`)
    const stsd = one(stbl.children, 'stsd'), sd = await full(stsd, 8)
    if (u32(sd, 4) !== 1) { block('Multiple sample descriptions unsupported'); continue }
    const samples = await walk(stsd.payload + 8, stsd.end, 'sample', 6)
    if (samples.length !== 1) fail('sample description count')
    const sample = samples[0]!
    const sampleKind = handlerType === 'vide' ? 'video' : 'audio'
    const allowed = handlerType === 'vide' ? ['avc1', 'jpeg'] : ['mp4a', 'sowt']
    if (!allowed.includes(sample.type)) { block('Encrypted/unknown codec sample entry'); continue }
    const sampleHeader = handlerType === 'vide' ? 78 : 28
    if (sample.end - sample.payload < sampleHeader) fail('sample entry bounds')
    const sh = await read(sample.payload, sampleHeader)
    if (sh.subarray(0, 6).some(v => v !== 0) || (sh[6]! * 256 + sh[7]!) !== 1) fail('sample data reference')
    if (handlerType === 'soun' && (sh[8] || sh[9])) { block('QuickTime audio sample entry variant'); continue }
    if (handlerType === 'vide' && (sh[74]! * 256 + sh[75]!) !== 24) block('Alpha/unknown sample depth unsupported')
    sample.children = await walk(sample.payload + sampleHeader, sample.end, sampleKind, 7)
    for (const type of lists[sampleKind]!) if (all(sample.children, type).length > 1) fail(`duplicate ${type}`)
    for (const leaf of sample.children) {
      const length = leaf.end - leaf.payload
      if (['pasp', 'btrt', 'fiel', 'colr', 'avcC', 'esds'].includes(leaf.type)) {
        if (length > 65536) fail(`${leaf.type} size limit`)
        const data = await read(leaf.payload, length)
        if (leaf.type === 'pasp' && (length !== 8 || !u32(data) || !u32(data, 4))) fail('pasp layout')
        if (leaf.type === 'btrt' && length !== 12) fail('btrt length')
        if (leaf.type === 'fiel' && (length !== 2 || !((data[0] === 1 && data[1] === 0) || (data[0] === 2 && [1, 6, 9, 14].includes(data[1]!))))) fail('fiel variant')
        if (leaf.type === 'colr') {
          const kind = fourcc(data)
          if (!['nclc', 'nclx'].includes(kind)) block('Unknown colr variant unsupported')
          else {
            if (length !== (kind === 'nclc' ? 10 : 11)) fail('colr length')
            if (kind === 'nclx' && (data[10]! & 127)) fail('colr reserved flags')
            const codes = [data[4]! * 256 + data[5]!, data[6]! * 256 + data[7]!, data[8]! * 256 + data[9]!]
            if (![1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 22].includes(codes[0]!) || ![1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(codes[1]!) || ![0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(codes[2]!)) block('Unknown colr code unsupported')
          }
        }
        if (leaf.type === 'avcC') {
          if (sample.type !== 'avc1' || length < 7 || data[0] !== 1 || (data[4]! & 252) !== 252 || (data[4]! & 3) === 2 || (data[5]! & 224) !== 224) fail('avcC header')
          if (![66, 77, 88, 100, 110, 122, 144].includes(data[1]!)) block('Unknown avcC profile unsupported')
          let p = 6
          const units = (count: number, kind: number) => {
            if (!count) fail('avcC missing parameter sets')
            for (let i = 0; i < count; i++) {
              if (p + 2 > length) fail('avcC parameter length')
              const size = data[p]! * 256 + data[p + 1]!; p += 2
              if (!size || p + size > length || (data[p]! & 128) || (data[p]! & 31) !== kind) fail('avcC parameter bounds/type')
              p += size
            }
          }
          units(data[5]! & 31, 7)
          if (p >= length) fail('avcC missing PPS count')
          units(data[p++]!, 8)
          if (p < length && [100, 110, 122, 144].includes(data[1]!)) {
            if (p + 4 > length || (data[p]! & 252) !== 252 || (data[p + 1]! & 248) !== 248 || (data[p + 2]! & 248) !== 248) fail('avcC extension header')
            p += 3
            const count = data[p++]!
            if (count) units(count, 13)
          }
          if (p !== length) fail('avcC trailing bytes')
        }
        if (leaf.type === 'esds') {
          if (sample.type !== 'mp4a' || length < 4 || u32(data) !== 0) fail('esds version/flags')
          type Descriptor = { tag: number; start: number; end: number }
          const descriptor = (start: number, end: number): Descriptor => {
            if (start >= end) fail('esds descriptor missing')
            const tag = data[start++]!
            let size = 0, complete = false
            for (let i = 0; i < 4; i++) {
              if (start >= end) fail('esds descriptor length')
              const byte = data[start++]!; size = size * 128 + (byte & 127)
              if (!(byte & 128)) { complete = true; break }
            }
            if (!complete || size > end - start) fail('esds descriptor bounds')
            return { tag, start, end: start + size }
          }
          const es = descriptor(4, length)
          if (es.tag !== 3 || es.end !== length || es.end - es.start < 3 || data[es.start + 2] !== 0) fail('esds ES descriptor flags/layout')
          const config = descriptor(es.start + 3, es.end)
          if (config.tag !== 4 || config.end - config.start < 13 || data[config.start] !== 64 || data[config.start + 1] !== 21) fail('esds decoder configuration')
          const specific = descriptor(config.start + 13, config.end)
          if (specific.tag !== 5 || specific.end !== config.end || specific.end - specific.start < 2 || specific.end - specific.start > 64) fail('esds audio config bounds')
          const sl = descriptor(config.end, es.end)
          if (sl.tag !== 6 || sl.end !== es.end || sl.end - sl.start !== 1 || data[sl.start] !== 2) fail('esds SL configuration')
        }
      }
    }
    for (const chan of all(sample.children, 'chan')) {
      const data = await full(chan, 16)
      if (chan.end - chan.payload !== 16 || u32(data, 12) !== 0) block('QuickTime channel descriptions unsupported')
    }
    if (sample.type === 'avc1' && all(sample.children, 'avcC').length !== 1) fail('missing avcC')
    if (sample.type === 'mp4a' && all(sample.children, 'esds').length !== 1) fail('missing esds')
    const table = async (type: string, width: number, versions = [0]): Promise<{ box: Box; count: number }> => {
      const box = one(stbl.children, type), data = await full(box, 8, versions), count = u32(data, 4)
      budget(count)
      if (box.end - box.payload !== 8 + count * width) fail(`${type} table bounds`)
      return { box, count }
    }
    const sz = one(stbl.children, 'stsz'), sizes = await full(sz, 12), constantSize = u32(sizes, 4), sampleCount = u32(sizes, 8)
    budget(sampleCount)
    if (!sampleCount || sz.end - sz.payload !== 12 + (constantSize ? 0 : sampleCount * 4)) fail('stsz bounds/count')
    const sizeAt = async (index: number): Promise<number> => constantSize || u32(await read(sz.payload + 12 + index * 4, 4))
    const times = await table('stts', 8)
    let timedSamples = 0
    for (let i = 0; i < times.count; i++) {
      const row = await read(times.box.payload + 8 + i * 8, 8), count = u32(row)
      if (!count || !u32(row, 4)) fail('stts empty run')
      timedSamples += count
    }
    if (timedSamples !== sampleCount) fail('stts sample count')
    for (const type of ['ctts', 'stss', 'sdtp']) if (all(stbl.children, type).length) {
      if (type === 'sdtp') {
        const box = one(stbl.children, type)
        await full(box, 4)
        if (box.end - box.payload !== 4 + sampleCount) fail('sdtp count')
      } else {
        const t = await table(type, type === 'ctts' ? 8 : 4, type === 'ctts' ? [0, 1] : [0])
        let total = 0, previous = 0
        for (let i = 0; i < t.count; i++) {
          const row = await read(t.box.payload + 8 + i * (type === 'ctts' ? 8 : 4), type === 'ctts' ? 8 : 4), n = u32(row)
          if (!n) fail(`${type} zero entry`)
          if (type === 'ctts') total += n
          else { if (n <= previous || n > sampleCount) fail('stss sample index'); previous = n }
        }
        if (type === 'ctts' && total !== sampleCount) fail('ctts count')
      }
    }
    const groups = all(stbl.children, 'sgpd'), mappings = all(stbl.children, 'sbgp')
    if (groups.length !== mappings.length) fail('sample group pairing')
    if (groups.length) {
      const group = groups[0]!, gd = await full(group, 16, [1])
      if (fourcc(gd, 4) !== 'roll' || u32(gd, 8) !== 2 || u32(gd, 12) !== 1 || group.end - group.payload !== 18) { block('Unknown sample group description'); continue }
      const mapping = mappings[0]!, mp = await full(mapping, 12)
      if (fourcc(mp, 4) !== 'roll') { block('Unknown sample group mapping'); continue }
      const count = u32(mp, 8)
      budget(count)
      if (mapping.end - mapping.payload !== 12 + count * 8) fail('sample group bounds')
      let total = 0
      for (let i = 0; i < count; i++) {
        const row = await read(mapping.payload + 12 + i * 8, 8)
        if (!u32(row) || u32(row, 4) > 1) fail('sample group index')
        total += u32(row)
      }
      if (total !== sampleCount) fail('sample group sample count')
    }
    const chunkTypes = ['stco', 'co64'].filter(t => all(stbl.children, t).length)
    if (chunkTypes.length !== 1) fail('required unique chunk offsets')
    const offsetType = chunkTypes[0]!, offsets = await table(offsetType, offsetType === 'stco' ? 4 : 8), sc = await table('stsc', 12)
    if (!offsets.count || !sc.count || sc.count > offsets.count) fail('chunk mapping count')
    const runs: { first: number; count: number }[] = []
    for (let i = 0; i < sc.count; i++) {
      const row = await read(sc.box.payload + 8 + i * 12, 12), first = u32(row), count = u32(row, 4)
      if ((i === 0 && first !== 1) || (i > 0 && first <= runs[i - 1]!.first) || first > offsets.count || !count || u32(row, 8) !== 1) fail('stsc mapping')
      runs.push({ first, count })
    }
    let index = 0, run = 0
    for (let i = 0; i < offsets.count; i++) {
      if (run + 1 < runs.length && i + 1 >= runs[run + 1]!.first) run++
      const offsetBytes = await read(offsets.box.payload + 8 + i * (offsetType === 'stco' ? 4 : 8), offsetType === 'stco' ? 4 : 8)
      const offset = offsetType === 'stco' ? u32(offsetBytes) : integer64(offsetBytes)
      let length = 0
      if (runs[run]!.count > sampleCount - index) fail('chunk sample overrun')
      for (let j = 0; j < runs[run]!.count; j++) { const size = await sizeAt(index++); if (!size) fail('zero sample size'); length += size }
      if (!media.some(b => offset >= b.payload && offset < b.end && length <= b.end - offset)) fail('chunk offsets/sample bytes outside mdat')
    }
    if (index !== sampleCount) fail('unmapped samples')
    for (const edts of all(track.children, 'edts')) {
      const elst = one(edts.children, 'elst'), data = await full(elst, 8, [0, 1]), count = u32(data, 4), width = data[0] === 1 ? 20 : 12
      budget(count)
      if (count > 16 || elst.end - elst.payload !== 8 + count * width) fail('edit list bounds')
    }
  }
  if (videoTracks !== 1) block('Tam bir video track gereklidir')
  return { scan, patches }
}

export async function scanVideo(file: Blob, format: 'MP4' | 'MOV', check?: () => void): Promise<VideoScan> {
  return (await parseVideo(file, format, check)).scan
}

async function selectedPatches(file: Blob, scan: VideoScan, ids: string[], rightsConsent: boolean, check?: () => void): Promise<Patch[]> {
  const parsed = await parseVideo(file, scan.format, check)
  if (JSON.stringify(parsed.scan) !== JSON.stringify(scan)) fail('stale or modified scan')
  if (parsed.scan.cleaningBlocked) fail('cleaning blocked')
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) fail('duplicate/invalid selection')
  const result: Patch[] = []
  for (const id of ids) {
    const record = parsed.scan.records.find(r => r.id === id), replacements = parsed.patches.get(id)
    if (!record || !replacements || record.status === 'unsupported' || (record.requiresRightsConsent && rightsConsent !== true) || (!record.requiresRightsConsent && record.status !== 'cleanable')) fail('selection/rights consent')
    result.push(...replacements!)
  }
  result.sort((a, b) => a.start - b.start)
  for (let i = 1; i < result.length; i++) if (result[i]!.start < result[i - 1]!.end) fail('overlapping replacements')
  return result
}

export async function* videoChunks(file: Blob, scan: VideoScan, ids: string[], rightsConsent: boolean, check?: () => void): AsyncGenerator<Uint8Array> {
  const patches = await selectedPatches(file, scan, ids, rightsConsent, check)
  let next = 0
  for (let start = 0; start < file.size; start += CHUNK) {
    check?.()
    const end = Math.min(start + CHUNK, file.size), data = new Uint8Array(await file.slice(start, end).arrayBuffer())
    check?.()
    if (data.length !== end - start) fail('short streaming read')
    while (next < patches.length && patches[next]!.end <= start) next++
    for (let i = next; i < patches.length && patches[i]!.start < end; i++) {
      const patch = patches[i]!, from = Math.max(start, patch.start), to = Math.min(end, patch.end)
      if (patch.value) data.set(patch.value.subarray(from - patch.start, to - patch.start), from - start)
      else data.fill(0, from - start, to - start)
    }
    yield data
  }
}

export async function verifyVideo(original: Blob, output: Blob, scan: VideoScan, ids: string[], rightsConsent: boolean, check?: () => void): Promise<VideoScan> {
  if (original.size !== output.size) fail('output size changed')
  let position = 0
  for await (const expected of videoChunks(original, scan, ids, rightsConsent, check)) {
    const actual = new Uint8Array(await output.slice(position, position + expected.length).arrayBuffer())
    check?.()
    if (!same(expected, actual)) fail(`output byte mismatch at chunk ${position}`)
    position += expected.length
  }
  const result = await scanVideo(output, scan.format, check)
  if (result.cleaningBlocked || result.width !== scan.width || result.height !== scan.height || result.alpha !== scan.alpha || result.orientation !== scan.orientation || ids.some(id => result.records.some(r => r.id === id))) fail('output rescan/preservation')
  const retained = scan.records.filter(r => !ids.includes(r.id))
  if (JSON.stringify(retained) !== JSON.stringify(result.records)) fail('unselected metadata changed')
  return result
}
