import { validateC2paStore, resolveLocalC2paReference } from './c2pa-structure.ts'
import { analyzeXmp, removeXmpReference } from './xmp.ts'
import { buildFootprints, classifyFootprintText, consentFootprintPlan, type FootprintRecordAnalysis, type FootprintReport, type FootprintPlan, type FootprintResult } from './footprints.ts'
import { readC2pa } from './c2pa.ts'
import type { C2paReport } from './c2pa-types.ts'

export type C2paDecisionCode = 'SUPPORTED_EMBEDDED' | 'SUPPORTED_WITH_LOCAL_XMP_REFERENCE' | 'BLOCKED_EXTERNAL_REFERENCE' | 'BLOCKED_AMBIGUOUS_PROVENANCE' | 'BLOCKED_UNSUPPORTED_STRUCTURE' | 'BLOCKED_MALFORMED_METADATA' | 'NO_EMBEDDED_MANIFEST'
export type C2paDecision = { code: C2paDecisionCode; reason: string }
export type ChangedField = { field: string; previousValue: string }
type XmpPacket = { part: Part; prefix: number; analysis: ReturnType<typeof analyzeXmp> }
type XmpPatch = { part: Part; payload: Uint8Array; previousValue: string }

export type CleaningMode = 'safe' | 'comprehensive'
export type MetadataRecord = { id: string; kind: string; bytes: number; preview: string; status: 'cleanable' | 'protected' | 'unsupported'; reason: string; requiresRightsConsent: boolean; comprehensiveOnly?: boolean; footprintAnalysis?: FootprintRecordAnalysis }
export type Scan = { format: 'JPEG' | 'PNG' | 'WebP'; width: number; height: number; alpha: boolean; orientation: number | null; records: MetadataRecord[]; c2pa: string; cleaningBlocked: boolean; c2paRemovable?: boolean; c2paDecision?: C2paDecision; notes: string[]; footprints?: FootprintReport; footprintPlan?: FootprintPlan; provenance?: C2paReport }
type Part = { start: number; end: number; payload: Uint8Array; kind: string; record?: MetadataRecord; image: boolean }
type Parsed = { scan: Scan; parts: Part[]; header: number; storeParts: Part[]; otherBlocked: boolean; xmpPatch?: XmpPatch }
const MAX = 128 * 1024 * 1024
const MAX_PARTS = 4096
const MAX_METADATA = 16 * 1024 * 1024
const MAX_TEXT = 1024 * 1024
const PREVIEW = 512
const decoder = new TextDecoder('utf-8', { fatal: false })
const fail = (message: string): never => { throw new Error(message) }
const ascii = (data: Uint8Array, start = 0, end = data.length): string => {
  let text = ''
  for (let i = start; i < end; i++) text += String.fromCharCode(data[i]!)
  return text
}
const text = (data: Uint8Array): string => decoder.decode(data.subarray(0, MAX_TEXT))
const preview = (value: string): string => value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, PREVIEW)
const equal = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])
const u16 = (a: Uint8Array, p: number, little = false): number => little ? a[p]! + a[p + 1]! * 256 : a[p]! * 256 + a[p + 1]!
const u32 = (a: Uint8Array, p: number, little = false): number => little ? (a[p]! + a[p + 1]! * 256 + a[p + 2]! * 65536 + a[p + 3]! * 16777216) : (a[p]! * 16777216 + a[p + 1]! * 65536 + a[p + 2]! * 256 + a[p + 3]!)
const u24 = (a: Uint8Array, p: number): number => a[p]! + a[p + 1]! * 256 + a[p + 2]! * 65536
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc(data: Uint8Array): number {
  let c = 0xffffffff
  for (const value of data) c = crcTable[(c ^ value) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function exif(data: Uint8Array): { orientation: number | null; value: string; footprintAnalysis?: FootprintRecordAnalysis } {
  if (ascii(data, 0, Math.min(6, data.length)) === 'Exif\0\0') data = data.subarray(6)
  try {
    const bounds = (p: number, n: number) => { if (!Number.isSafeInteger(p) || p < 0 || n < 0 || p + n > data.length) fail('EXIF bounds') }
    bounds(0, 8)
    const order = ascii(data, 0, 2)
    if (order !== 'II' && order !== 'MM') fail('EXIF byte order')
    const le = order === 'II'
    const r16 = (p: number) => { bounds(p, 2); return u16(data, p, le) }
    const r32 = (p: number) => { bounds(p, 4); return u32(data, p, le) }
    if (r16(2) !== 42) fail('EXIF magic')
    const queue = [r32(4)]
    if (!queue[0]) fail('EXIF IFD missing')
    const visited = new Set<number>()
    let tags = 0
    let orientation = 1
    let seenOrientation = false
    const values: string[] = []
    const hints = new Set<string>()
    const sizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 }
    while (queue.length) {
      const offset = queue.shift()!
      if (!offset) continue
      if (visited.has(offset) || visited.size >= 16) fail('EXIF IFD cycle/limit')
      visited.add(offset)
      const count = r16(offset)
      tags += count
      if (tags > 512) fail('EXIF tag limit')
      bounds(offset + 2, count * 12 + 4)
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + i * 12
        const tag = r16(entry), type = r16(entry + 2), count = r32(entry + 4)
        const size = sizes[type]
        if (!size) fail('EXIF unknown type')
        const length = count * size!
        const p = length <= 4 ? entry + 8 : r32(entry + 8)
        bounds(p, length)
        if (tag === 274) {
          if (seenOrientation || type !== 3 || count !== 1) fail('EXIF orientation')
          seenOrientation = true
          orientation = r16(p)
          if (orientation < 1 || orientation > 8) fail('EXIF orientation value')
        }
        if ([34665, 34853, 40965, 330].includes(tag)) {
          if (![4, 13].includes(type) || count > 16) fail('EXIF pointer')
          for (let j = 0; j < count; j++) queue.push(r32(p + j * 4))
        }
        if ([270, 271, 272, 305, 315, 33432, 37510, 40091, 40092, 40093, 40094, 40095].includes(tag)) for (const hint of classifyFootprintText(text(data.subarray(p, p + Math.min(length, MAX_TEXT))), length <= MAX_TEXT).hints) hints.add(hint)
        if ([270, 271, 272, 305, 315, 33432, 37510, 40091, 40092, 40093, 40094, 40095].includes(tag)) values.push(`${({ 270: 'ImageDescription', 271: 'Make', 272: 'Model', 305: 'Software', 315: 'Artist/Creator', 33432: 'Copyright', 37510: 'UserComment' } as Record<number, string>)[tag] ?? tag}: ${preview(text(data.subarray(p, p + Math.min(length, PREVIEW * 2))))}`)
      }
      queue.push(r32(offset + 2 + count * 12))
    }
    return { orientation, value: values.join('; ').slice(0, PREVIEW), footprintAnalysis: { complete: false, explicit: [], hints: [...hints], dedicated: false } }
  } catch { return { orientation: null, value: 'EXIF TIFF ayrıştırılamadı veya güvenli sınırı aştı' } }
}
function validICC(data: Uint8Array): boolean {
  if (data.length < 132 || !['mntr', 'scnr'].includes(ascii(data, 12, 16)) || u32(data, 0) !== data.length || ascii(data, 36, 40) !== 'acsp' || ![2, 4].includes(data[8]!) || !['RGB ', 'GRAY'].includes(ascii(data, 16, 20)) || !['XYZ ', 'Lab '].includes(ascii(data, 20, 24))) return false
  const count = u32(data, 128)
  if (count > 512 || 132 + count * 12 > data.length) return false
  for (let i = 0; i < count; i++) {
    const offset = u32(data, 136 + i * 12), length = u32(data, 140 + i * 12)
    if (!['desc', 'cprt', 'wtpt', 'bkpt', 'chad', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC', 'kTRC', 'chrm', 'dmnd', 'dmdd', 'lumi', 'meas', 'tech', 'view', 'vued'].includes(ascii(data, 132 + i * 12, 136 + i * 12))) return false
    if (offset % 4 || offset < 132 + count * 12 || length < 8 || offset + length > data.length) return false
  }
  return true
}
export function isRemovable(record: MetadataRecord, mode: CleaningMode = 'safe'): boolean {
  return record.comprehensiveOnly ? mode === 'comprehensive' : record.status === 'cleanable' || record.status === 'protected' && record.requiresRightsConsent
}
function validateMode(mode: CleaningMode): void { if (mode !== 'safe' && mode !== 'comprehensive') fail('Geçersiz temizleme modu') }
function parse(data: Uint8Array): Parsed {
  if (!(data instanceof Uint8Array) || data.length < 12 || data.length > MAX || (typeof SharedArrayBuffer !== 'undefined' && data.buffer instanceof SharedArrayBuffer)) fail('Geçersiz veri veya 128 MiB sınırı')
  const scan: Scan = { format: 'PNG', width: 0, height: 0, alpha: false, orientation: 1, records: [], c2pa: 'not-detected-not-guaranteed', cleaningBlocked: false, notes: ['Yalnız kapsayıcı doğrulanır; kodlanmış pikseller çözülmez.', 'C2PA imzası doğrulanmaz; algılanmaması yokluk garantisi değildir.'] }
  const parts: Part[] = []
  let metadataBytes = 0
  let otherBlocked = false
  const storeParts: Part[] = []
  const xmpPackets: XmpPacket[] = []
  let xmpFailure: C2paDecision | undefined
  const add = (start: number, end: number, p: number, length: number, kind: string, image = false): Part => {
    if (parts.length >= MAX_PARTS) fail('Chunk/segment sayısı sınırı')
    if (length > 64 * 1024 * 1024) fail('Tek chunk 64 MiB sınırı')
    const part = { start, end, payload: data.subarray(p, p + length), kind, image }
    parts.push(part)
    return part
  }
  const record = (part: Part, kind: string, status: MetadataRecord['status'], reason: string, value = '', rights = false) => {
    metadataBytes += part.payload.length
    if (metadataBytes > MAX_METADATA) fail('Metadata 16 MiB sınırı')
    part.record = { id: `${kind}:${parts.length - 1}`, kind, bytes: part.payload.length, preview: preview(value), status: status === 'cleanable' && rights ? 'protected' : status, reason, requiresRightsConsent: rights }
    if (['PNG text', 'Comment'].includes(kind)) {
      let complete = part.payload.length <= MAX_TEXT
      try { new TextDecoder('utf-8', { fatal: true }).decode(part.payload.subarray(0, MAX_TEXT)) } catch { complete = false }
      if (kind === 'Comment') part.record.footprintAnalysis = classifyFootprintText(value, complete, { kind: 'jpeg' })
      else {
        const keyEnd = part.payload.indexOf(0)
        let bodyStart = keyEnd + 1, language = '', translated = ''
        if (part.kind === 'iTXt') {
          const langEnd = part.payload.indexOf(0, keyEnd + 3), translatedEnd = part.payload.indexOf(0, langEnd + 1)
          language = text(part.payload.subarray(keyEnd + 3, langEnd))
          translated = text(part.payload.subarray(langEnd + 1, translatedEnd))
          bodyStart = translatedEnd + 1
          complete &&= langEnd >= keyEnd + 3 && translatedEnd >= langEnd + 1 && part.payload[keyEnd + 1] === 0 && part.payload[keyEnd + 2] === 0
        }
        const keyword = text(part.payload.subarray(0, keyEnd))
        complete &&= keyEnd > 0 && !/^raw profile type/i.test(keyword)
        part.record.footprintAnalysis = classifyFootprintText(text(part.payload.subarray(bodyStart)), complete, { kind: 'png', keyword, language, translated })
      }
    }
    else if (['EXIF', 'Compressed PNG text'].includes(kind)) part.record.footprintAnalysis = { complete: false, explicit: [], hints: [], dedicated: false }
    scan.records.push(part.record)
  }
  const provenance = (part: Part, store = false) => {
    if (store) storeParts.push(part)
    else otherBlocked = true
    scan.cleaningBlocked = true
    scan.c2pa = 'detected-not-verified'
    record(part, 'C2PA / opaque provenance', 'protected', 'Provenans algılandı; imza doğrulayıcı yok, tüm temizlik engellendi')
  }
  const metadata = (part: Part, kind: string) => {
    if (kind === 'C2PA' || kind === 'APP11') { provenance(part, true); return }
    if (kind === 'ICC') { record(part, kind, 'protected', 'Renk profili her zaman korunur'); part.record!.footprintAnalysis = { complete: false, explicit: [], hints: [], dedicated: false }; return }
    if (kind === 'EXIF') {
      const parsed = exif(part.payload)
      if (scan.orientation !== 1 && scan.orientation !== parsed.orientation) scan.orientation = null
      else scan.orientation = parsed.orientation
      record(part, kind, parsed.orientation === 1 ? 'cleanable' : 'protected', parsed.orientation === 1 ? 'TIFF doğrulandı; yön 1' : 'Yön dönüşümü veya bilinmeyen TIFF korunur', parsed.value, parsed.orientation === 1)
      if (parsed.footprintAnalysis) part.record!.footprintAnalysis = parsed.footprintAnalysis
      return
    }
    if (kind === 'PNG text' && ascii(part.payload, 0, part.payload.indexOf(0)) === 'XML:com.adobe.xmp') { metadata(part, 'XMP'); return }
    if (kind === 'XMP') {
      let prefix = 0
      if (part.kind === 'JPEG-e1' || part.kind === 'tEXt') prefix = part.payload.indexOf(0) + 1
      else if (part.kind === 'iTXt') {
        const key = part.payload.indexOf(0), lang = part.payload.indexOf(0, key + 3)
        prefix = part.payload.indexOf(0, lang + 1) + 1
      }
      const analysis = analyzeXmp(part.payload.subarray(prefix))
      xmpPackets.push({ part, prefix, analysis })
      let validUtf8 = true
      try { new TextDecoder('utf-8', { fatal: true }).decode(part.payload.subarray(prefix)) } catch { validUtf8 = false }
      const legacyBlockOnly = validUtf8 && part.payload.length <= MAX_TEXT && analysis.status !== 'valid' && !/[&\0]|<\s*!|<\?xml|orientation|c2pa|jumbf|provenance|contentcredentials|manifest.store/i.test(text(part.payload.subarray(prefix))) && !part.payload.includes(255) && !part.payload.includes(254)
      if (analysis.status !== 'valid') {
        // Legacy whole-block removal remains separate from strict field editing.
        otherBlocked = true; if (!legacyBlockOnly) scan.cleaningBlocked = true
        xmpFailure = { code: analysis.status === 'malformed' ? 'BLOCKED_MALFORMED_METADATA' : 'BLOCKED_UNSUPPORTED_STRUCTURE', reason: analysis.reason ?? 'XMP güvenle çözümlenemedi' }
      }
      if (analysis.references.length) { scan.cleaningBlocked = true; scan.c2pa = 'detected-not-verified' }
      if (part.payload.length > MAX_TEXT) { otherBlocked = true; scan.cleaningBlocked = true }
      const value = text(part.payload)
      // Unrelated provenance hints remain blockers even when a local field is recognized.
      let remaining = part.payload.subarray(prefix)
      if (analysis.status === 'valid' && analysis.references.length === 1) remaining = removeXmpReference(remaining, analysis.references[0]!)
      const remainingAnalysis = analyzeXmp(remaining)
      const provenancePattern = /c2pa|jumbf|contentcredentials|content.credentials|manifest.store|dcterms\s*:\s*provenance/i
      const hasHint = (bytes: Uint8Array) => {
        let tail = ''
        for (let pos = 0; pos < bytes.length; pos += 65536) {
          const window = tail + decoder.decode(bytes.subarray(pos, pos + 65536)).replace(/\0/g, '')
          if (provenancePattern.test(window)) return true
          tail = window.slice(-128)
        }
        return false
      }
      const decodedHints = remainingAnalysis.status === 'valid' ? text(remaining).replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_match, digits: string) => String.fromCodePoint(digits[0]!.toLowerCase() === 'x' ? Number.parseInt(digits.slice(1), 16) : Number(digits))) : ''
      const hints = hasHint(part.payload.subarray(0, prefix)) || hasHint(remaining) || provenancePattern.test(remainingAnalysis.projection) || provenancePattern.test(decodedHints)
      const orientationHint = /orientation/i.test(value) || /orientation/i.test(remainingAnalysis.projection) || /orientation/i.test(decodedHints)
      if (hints) { otherBlocked = true; scan.cleaningBlocked = true; scan.c2pa = 'detected-not-verified' }
      if (orientationHint) otherBlocked = true
      const protectedXmp = analysis.status !== 'valid' && !legacyBlockOnly || analysis.references.length > 0 || hints || orientationHint
      record(part, kind, protectedXmp ? 'protected' : 'cleanable', protectedXmp ? 'XMP kaynak/yön bilgisi veya desteklenmeyen yapı korunur' : 'XMP blok düzeyinde kaldırılabilir', value, !protectedXmp)
      part.record!.footprintAnalysis = { complete: analysis.status === 'valid' && !orientationHint, explicit: analysis.aiSources ?? [], hints: [...new Set([...(analysis.hints ?? []), ...classifyFootprintText(text(part.payload.subarray(prefix, prefix + MAX_TEXT)), false).hints])], dedicated: false }
      return
    }
    let tail = ''
    for (let pos = 0; pos < part.payload.length; pos += 65536) {
      const window = tail + decoder.decode(part.payload.subarray(pos, pos + 65536)).replace(/\0/g, '')
      if (/c2pa|jumbf|contentcredentials|content.credentials|manifest.store|dcterms\s*:\s*provenance/i.test(window)) { provenance(part); return }
      tail = window.slice(-64)
    }
    if (kind === 'Compressed PNG text') { otherBlocked = true; scan.cleaningBlocked = true; record(part, kind, 'unsupported', 'Sıkıştırılmış metin/provenans yorumlanamaz; tüm temizlik engellendi'); return }
    const value = text(part.payload)
    if (part.payload.length > MAX_TEXT || (kind === 'PNG text' && /raw profile type/i.test(value.slice(0, 80)))) { otherBlocked = true; scan.cleaningBlocked = true; record(part, kind, 'protected', 'Metin sınırı veya gömülü profil/provenans; tüm temizlik engellendi', value); return }
    record(part, kind, 'cleanable', 'Blok düzeyinde kaldırılabilir; hak bilgileri içerebilir', value, true)
    if (kind === 'IPTC') part.record!.footprintAnalysis = { ...classifyFootprintText(text(part.payload.subarray(0, MAX_TEXT)), false), dedicated: false }
  }
  let header: number
  if (equal(data.subarray(0, 8), new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))) {
    scan.format = 'PNG'; header = 8
    let pos = 8, image = false, ended = false, end = false, palette = false, color = -1, depth = 0
    const unique = new Set<string>()
    while (pos < data.length) {
      if (pos + 12 > data.length) fail('Eksik PNG chunk')
      const n = u32(data, pos), finish = pos + n + 12
      if (finish > data.length) fail('PNG uzunluğu')
      const kind = ascii(data, pos + 4, pos + 8)
      if (!/^[A-Za-z]{4}$/.test(kind) || (data[pos + 6]! & 32)) fail('PNG chunk türü')
      if (crc(data.subarray(pos + 4, finish - 4)) !== u32(data, finish - 4)) fail('PNG CRC')
      if (!parts.length && kind !== 'IHDR') fail('PNG IHDR sırası')
      if (['acTL', 'fcTL', 'fdAT'].includes(kind)) fail('Animasyon desteklenmiyor')
      if (['IHDR', 'IEND', 'PLTE', 'tRNS', 'iCCP', 'eXIf', 'cHRM', 'gAMA', 'sRGB', 'sBIT', 'bKGD', 'hIST', 'pHYs', 'tIME'].includes(kind)) {
        if (unique.has(kind)) fail('Yinelenen PNG chunk')
        unique.add(kind)
      }
      if (['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB'].includes(kind) && (image || palette)) fail('PNG renk chunk sırası')
      if (['bKGD', 'hIST', 'pHYs'].includes(kind) && image) fail('PNG yardımcı chunk sırası')
      if ((kind === 'sRGB' && unique.has('iCCP')) || (kind === 'iCCP' && unique.has('sRGB'))) fail('PNG çakışan renk profilleri')
      const lengths: Record<string, number> = { cHRM: 32, gAMA: 4, sRGB: 1, pHYs: 9, tIME: 7 }
      if (kind in lengths && n !== lengths[kind]) fail('PNG yardımcı chunk uzunluğu')
      if (kind === 'hIST' && (!palette || n !== parts.find(v => v.kind === 'PLTE')!.payload.length / 3 * 2)) fail('PNG hIST')
      const part = add(pos, finish, pos + 8, n, kind, kind === 'IDAT')
      const p = part.payload
      if (kind === 'IHDR') {
        if (parts.length !== 1 || n !== 13) fail('PNG IHDR')
        scan.width = u32(p, 0); scan.height = u32(p, 4); depth = p[8]!; color = p[9]!
        const allowed: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }
        if (!allowed[color]?.includes(depth) || p[10] || p[11] || p[12]! > 1) fail('PNG IHDR kodlama')
        scan.alpha = color === 4 || color === 6
      } else if (kind === 'PLTE') {
        if (image || !n || n % 3 || n > 768 || [0, 4].includes(color) || (color === 3 && n / 3 > 2 ** depth)) fail('PNG PLTE')
        palette = true
      } else if (kind === 'tRNS') {
        if (image || ([4, 6].includes(color)) || (color === 0 && n !== 2) || (color === 2 && n !== 6) || (color === 3 && (!palette || !n || n > parts.find(v => v.kind === 'PLTE')!.payload.length / 3))) fail('PNG tRNS')
        scan.alpha = true
      } else if (kind === 'IDAT') {
        if (ended || (color === 3 && !palette)) fail('PNG IDAT sırası')
        image = true
      } else {
        if (image) ended = true
        if (kind === 'IEND') {
          if (n || !image || finish !== data.length) fail('PNG IEND/ek veri')
          end = true
        } else if (kind === 'iCCP') {
          if (image || palette) fail('PNG ICC sırası')
          const separator = p.indexOf(0)
          if (separator < 1 || separator > 79 || separator + 2 >= n || p[separator + 1] !== 0) fail('PNG ICC başlığı')
          metadata(part, 'ICC')
        } else if (kind === 'eXIf') metadata(part, 'EXIF')
        else if (kind === 'caBX') metadata(part, 'C2PA')
        else if (['tEXt', 'zTXt', 'iTXt'].includes(kind)) {
          const zero = p.indexOf(0)
          if (zero < 1 || zero > 79) fail('PNG metin anahtarı')
          if (kind === 'zTXt') {
            if (zero + 2 >= n || p[zero + 1] !== 0) fail('PNG zTXt')
            metadata(part, 'Compressed PNG text')
          } else if (kind === 'iTXt') {
            if (zero + 5 > n || p[zero + 1]! > 1 || p[zero + 2] !== 0) fail('PNG iTXt')
            const lang = p.indexOf(0, zero + 3), translated = p.indexOf(0, lang + 1)
            if (lang < 0 || translated < 0) fail('PNG iTXt alanları')
            metadata(part, p[zero + 1] === 1 ? 'Compressed PNG text' : 'PNG text')
          } else metadata(part, 'PNG text')
        } else if (!['IHDR', 'PLTE', 'tRNS'].includes(kind)) {
          if (!(data[pos + 4]! & 32)) fail('Desteklenmeyen kritik PNG chunk')
          record(part, kind, 'protected', 'Bilinmeyen/işlevsel chunk korunur')
        }
      }
      pos = finish
    }
    if (!end || !parts.some(p => p.image && p.payload.length)) fail('PNG görüntü verisi yok')
  } else if (data[0] === 255 && data[1] === 216) {
    scan.format = 'JPEG'; header = 2
    let pos = 2, frame = false, scanned = false, ended = false
    let components: number[] = []
    while (pos < data.length) {
      const start = pos
      if (data[pos] !== 255) fail('JPEG marker')
      while (data[pos] === 255 && pos < data.length) pos++
      if (pos >= data.length) fail('Eksik JPEG marker')
      const marker = data[pos++]!
      if (marker === 217) {
        if (!frame || !scanned || pos !== data.length) fail('JPEG EOI/ek veri')
        add(start, pos, start, pos - start, 'EOI', true); ended = true; break
      }
      if (marker === 0 || marker === 216 || marker === 1 || (marker >= 208 && marker <= 215)) fail('JPEG marker sırası')
      if (pos + 2 > data.length) fail('JPEG segment uzunluğu')
      const n = u16(data, pos), finish = pos + n
      if (n < 2 || finish > data.length) fail('JPEG segment sınırı')
      const part = add(start, finish, pos + 2, n - 2, `JPEG-${marker.toString(16)}`, true)
      const p = part.payload
      if ([192, 193, 194].includes(marker)) {
        if (frame || p.length < 9 || p[0] !== 8 || p.length !== 6 + 3 * p[5]! || ![1, 3, 4].includes(p[5]!)) fail('JPEG SOF')
        frame = true; scan.height = u16(p, 1); scan.width = u16(p, 3)
        components = Array.from({ length: p[5]! }, (_, i) => p[6 + i * 3]!)
        if (new Set(components).size !== components.length) fail('JPEG bileşenleri')
      } else if (marker >= 192 && marker <= 207 && ![196, 204].includes(marker)) fail('JPEG kodlama desteklenmiyor')
      if (marker === 218) {
        if (!frame || p.length < 6 || p.length !== 4 + 2 * p[0]! || !p[0] || p[0]! > components.length) fail('JPEG SOS')
        const selected = Array.from({ length: p[0]! }, (_, i) => p[1 + i * 2]!)
        if (new Set(selected).size !== selected.length || selected.some(v => !components.includes(v))) fail('JPEG SOS bileşenleri')
        scanned = true
        let cursor = finish
        while (cursor < data.length) {
          if (data[cursor++] !== 255) continue
          const mark = cursor - 1
          while (cursor < data.length && data[cursor] === 255) cursor++
          if (cursor >= data.length) fail('JPEG tarama sonu')
          const m = data[cursor]!
          if (m === 0 || (m >= 208 && m <= 215)) { cursor++; continue }
          add(finish, mark, finish, mark - finish, 'entropy', true)
          pos = mark; break
        }
        if (cursor >= data.length) fail('JPEG EOI yok')
        continue
      }
      if (marker === 225) {
        part.image = false
        if (ascii(p, 0, Math.min(6, p.length)) === 'Exif\0\0') metadata(part, 'EXIF')
        else if (text(p.subarray(0, 64)).startsWith('http://ns.adobe.com/xap/1.0/\0')) metadata(part, 'XMP')
        else { otherBlocked = true; scan.cleaningBlocked = true; record(part, 'APP1', 'protected', 'Bilinmeyen veya genişletilmiş APP1/provenans; tüm temizlik engellendi') }
      } else if (marker === 226) { part.image = false; if (ascii(p, 0, Math.min(11, p.length)) === 'ICC_PROFILE') metadata(part, 'ICC'); else record(part, 'APP2', 'protected', 'Bilinmeyen APP2 korunur') }
      else if (marker === 235) { part.image = false; metadata(part, 'APP11') }
      else if (marker === 237 || marker === 254) { part.image = false; metadata(part, marker === 237 ? 'IPTC' : 'Comment') }
      else if (marker === 224 && ascii(p, 0, 5) === 'JFIF\0') {
        const safe = !scanned && components.length === 0 && p.length === 14 && p[5] === 1 && p[6]! <= 2 && p[7]! <= 2 && u16(p, 8) > 0 && u16(p, 10) > 0 && p[12] === 0 && p[13] === 0
        part.image = false; record(part, 'JFIF', 'protected', safe ? 'Küçük resimsiz JFIF; kapsamlı modda yoğunluk bilgisi kaldırılabilir' : 'Desteklenmeyen JFIF korunur')
        if (safe) part.record!.comprehensiveOnly = true
        part.record!.footprintAnalysis = { complete: safe, explicit: [], hints: [], dedicated: false }
      }
      else if (marker === 224) { part.image = false; record(part, ascii(p, 0, 5) === 'JFXX\0' ? 'JFXX' : 'APP0', 'protected', 'Bilinmeyen APP0 veya küçük resim korunur') }
      else if (marker >= 224 && marker <= 239 && ![224, 238].includes(marker)) record(part, `APP${marker - 224}`, 'protected', 'Bilinmeyen APP korunur')
      pos = finish
    }
    if (!ended) fail('JPEG EOI yok')
  } else if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') {
    scan.format = 'WebP'; header = 12
    if (u32(data, 4, true) + 8 !== data.length) fail('WebP RIFF boyutu')
    let pos = 12, flags: number | null = null, image: Part | undefined, alpha: Part | undefined
    const seen = new Set<string>()
    while (pos < data.length) {
      if (pos + 8 > data.length) fail('WebP chunk başlığı')
      const kind = ascii(data, pos, pos + 4), n = u32(data, pos + 4, true), finish = pos + 8 + n + n % 2
      if (!/^[\x20-\x7e]{4}$/.test(kind) || finish > data.length || (n % 2 && data[finish - 1] !== 0)) fail('WebP uzunluk/padding')
      if (['VP8X', 'VP8 ', 'VP8L', 'EXIF', 'XMP ', 'ICCP', 'ALPH'].includes(kind) && seen.has(kind)) fail('Yinelenen WebP chunk')
      seen.add(kind)
      const part = add(pos, finish, pos + 8, n, kind, ['VP8 ', 'VP8L', 'ALPH'].includes(kind)), p = part.payload
      if (kind === 'ANIM' || kind === 'ANMF') fail('Animasyon desteklenmiyor')
      if (kind === 'VP8X') {
        if (parts.length !== 1 || n !== 10 || (p[0]! & 0xc1) || p[1] || p[2] || p[3]) fail('WebP VP8X')
        flags = p[0]!
        if (flags & 2) fail('Animasyon desteklenmiyor')
        scan.width = u24(p, 4) + 1; scan.height = u24(p, 7) + 1
      } else if (kind === 'VP8 ' || kind === 'VP8L') {
        if (image) fail('WebP görüntü sayısı')
        image = part
        let w: number, h: number
        if (kind === 'VP8 ') {
          if (n < 10 || (p[0]! & 1) || (p[0]! >> 1 & 7) > 3 || !(p[0]! & 16) || ascii(p, 3, 6) !== '\x9d\x01\x2a' || (u16(p, 6, true) & 0xc000) || (u16(p, 8, true) & 0xc000)) fail('WebP VP8 başlığı')
          const partition = (p[0]! + p[1]! * 256 + p[2]! * 65536) >>> 5
          if (partition > n - 10) fail('WebP VP8 partition')
          w = u16(p, 6, true); h = u16(p, 8, true); scan.alpha = !!alpha
        } else {
          if (n < 5 || p[0] !== 47 || (p[4]! & 0xe0) || alpha) fail('WebP VP8L başlığı')
          const bits = u32(p, 1, true)
          w = (bits & 0x3fff) + 1; h = ((bits >>> 14) & 0x3fff) + 1; scan.alpha = !!(bits & 0x10000000)
        }
        if (flags !== null && (w !== scan.width || h !== scan.height)) fail('WebP tuval uyuşmazlığı')
        scan.width = w; scan.height = h
      } else if (kind === 'ALPH') {
        if (image || flags === null || n < 2 || (p[0]! & 0xc0) || (p[0]! & 3) > 1 || ((p[0]! >> 4) & 3) > 1) fail('WebP ALPH')
        alpha = part
      } else if (kind === 'ICCP') { if (image || alpha) fail('WebP ICC sırası'); metadata(part, 'ICC') }
      else if (kind === 'EXIF' || kind === 'XMP ') { if (!image) fail('WebP metadata sırası'); metadata(part, kind === 'EXIF' ? 'EXIF' : 'XMP') }
      else if (kind === 'C2PA') metadata(part, 'C2PA')
      else record(part, kind, 'protected', 'Bilinmeyen chunk korunur')
      pos = finish
    }
    if (!image) fail('WebP görüntüsü yok')
    if (alpha && image!.kind !== 'VP8 ') fail('WebP ALPH kodlaması')
    if (flags === null) { if (['ICCP', 'EXIF', 'XMP ', 'ALPH'].some(k => seen.has(k))) fail('WebP VP8X gerekli') }
    else {
      for (const [bit, kind] of [[32, 'ICCP'], [8, 'EXIF'], [4, 'XMP ']] as const) if (!!(flags & bit) !== seen.has(kind)) fail('WebP metadata bayrak uyuşmazlığı')
      if (!!(flags & 16) !== scan.alpha) fail('WebP alpha bayrak uyuşmazlığı')
    }
  } else fail('Desteklenmeyen görüntü biçimi')
  if (!scan.width || !scan.height || scan.width * scan.height > 40_000_000) fail('Görüntü boyutu/40 megapiksel sınırı')
  const exifs = scan.records.filter(r => r.kind === 'EXIF')
  if (exifs.length > 1) { scan.orientation = null; for (const r of exifs) { r.status = 'protected'; r.requiresRightsConsent = false; r.reason = 'Birden çok EXIF bloğu; yön belirsiz' } }
  const profiles = parts.filter(p => p.record?.kind === 'ICC')
  if (scan.format === 'JPEG' && profiles.length) {
    const first = profiles[0]!.payload, total = first[13]
    const valid = total === profiles.length && profiles.every((p, i) => p.payload.length > 14 && ascii(p.payload, 0, 12) === 'ICC_PROFILE\0' && p.payload[12] === i + 1 && p.payload[13] === total)
    if (valid) {
      const joined = new Uint8Array(profiles.reduce((n, p) => n + Math.max(0, p.payload.length - 14), 0))
      let offset = 0
      for (const p of profiles) { joined.set(p.payload.subarray(14), offset); offset += Math.max(0, p.payload.length - 14) }
      if (validICC(joined)) for (const p of profiles) { p.record!.comprehensiveOnly = true; p.record!.reason = 'Doğrulanmış ICC; yalnız kapsamlı modda kaldırılabilir, renk yönetimi değişebilir' }
    }
  } else if (scan.format === 'WebP') {
    for (const p of profiles) if (validICC(p.payload)) { p.record!.comprehensiveOnly = true; p.record!.reason = 'Doğrulanmış ICC; yalnız kapsamlı modda kaldırılabilir, renk yönetimi değişebilir' }
  }
  // Only top-level stores are in scope; nested EXIF/thumbnail metadata is retained.
  scan.c2paRemovable = false
  let xmpPatch: XmpPatch | undefined
  const references = xmpPackets.flatMap(packet => packet.analysis.references.map(reference => ({ packet, reference })))
  scan.c2paDecision = xmpFailure ?? { code: storeParts.length ? 'BLOCKED_UNSUPPORTED_STRUCTURE' : 'NO_EMBEDDED_MANIFEST', reason: storeParts.length ? 'Gömülü manifest yapısı desteklenmiyor' : 'Gömülü manifest bulunamadı' }
  if (references.length > 1 || references.length && xmpPackets.length !== 1) {
    otherBlocked = true
    scan.c2paDecision = { code: 'BLOCKED_AMBIGUOUS_PROVENANCE', reason: 'Birden fazla XMP paketi veya kaynak işaretçisi var' }
  } else if (references.some(item => !item.reference.value.startsWith('self#jumbf='))) {
    otherBlocked = true
    scan.c2paDecision = { code: 'BLOCKED_EXTERNAL_REFERENCE', reason: 'Haricî kaynak işaretçisi otomatik değiştirilmez' }
  } else if (otherBlocked && !xmpFailure) scan.c2paDecision = { code: 'BLOCKED_AMBIGUOUS_PROVENANCE', reason: 'Başka belirsiz kaynak bilgisi mevcut' }
  if (!storeParts.length && !references.length && !scan.cleaningBlocked && scan.c2pa === 'not-detected-not-guaranteed') scan.c2paDecision = { code: 'NO_EMBEDDED_MANIFEST', reason: 'Gömülü manifest bulunamadı' }
  if (references.length === 1 && !storeParts.length && references[0]!.reference.value.startsWith('self#jumbf=')) {
    otherBlocked = true
    scan.c2paDecision = { code: 'BLOCKED_AMBIGUOUS_PROVENANCE', reason: 'Yerel işaretçi için gömülü manifest bulunamadı' }
  }
  if (storeParts.length && scan.orientation === null && !xmpFailure) scan.c2paDecision = { code: 'BLOCKED_MALFORMED_METADATA', reason: 'EXIF yön bilgisi bozuk veya belirsiz' }
  if (storeParts.length && !otherBlocked && scan.orientation !== null) {
    try {
      let store: Uint8Array
      if (scan.format === 'JPEG') {
        if (parts.some(p => p.kind === 'JPEG-e2' && ascii(p.payload, 0, 4) === 'MPF\0')) fail('MPF is unsupported')
        const first = parts.indexOf(storeParts[0]!), sos = parts.findIndex(p => p.kind === 'JPEG-da')
        if (storeParts.length > 128 || first < 0 || sos < 0 || storeParts.some((p, i) => parts[first + i] !== p || parts.indexOf(p) >= sos)) fail('APP11 position/group')
        let length = 8
        const initial = storeParts[0]!.payload
        if (initial.length < 17) fail('APP11 header')
        const size = u32(initial, 8)
        if (size < 8 || size > 4 * 1024 * 1024) fail('APP11 store length')
        for (const [i, part] of storeParts.entries()) {
          const p = part.payload
          if (p.length < 17 || ascii(p, 0, 2) !== 'JP' || u16(p, 2) !== u16(initial, 2) || u32(p, 4) !== i + 1 || !equal(p.subarray(8, 16), initial.subarray(8, 16))) fail('APP11 sequence/header')
          length += p.length - 16
          if (length > size) fail('APP11 store overflow')
        }
        if (length !== size) fail('APP11 store incomplete')
        store = new Uint8Array(size); store.set(initial.subarray(8, 16))
        let offset = 8
        for (const part of storeParts) { store.set(part.payload.subarray(16), offset); offset += part.payload.length - 16 }
      } else {
        if (storeParts.length !== 1) fail('Multiple C2PA stores')
        const part = storeParts[0]!, index = parts.indexOf(part)
        if (scan.format === 'PNG' && index >= parts.findIndex(p => p.kind === 'IDAT')) fail('caBX must precede IDAT')
        if (scan.format === 'WebP' && index !== parts.length - 1) fail('C2PA must be final')
        store = part.payload
      }
      const index = validateC2paStore(store)
      if (references.length) {
        const { packet, reference } = references[0]!
        if (!resolveLocalC2paReference(reference.value, index)) {
          scan.c2paDecision = { code: 'BLOCKED_AMBIGUOUS_PROVENANCE', reason: 'Yerel işaretçi doğrulanmış manifest/claim yoluyla eşleşmiyor' }
          fail('XMP target mismatch')
        }
        const xml = removeXmpReference(packet.part.payload.subarray(packet.prefix), reference)
        const payload = new Uint8Array(packet.prefix + xml.length)
        payload.set(packet.part.payload.subarray(0, packet.prefix)); payload.set(xml, packet.prefix)
        xmpPatch = { part: packet.part, payload, previousValue: reference.value }
      }
      scan.c2paRemovable = true
      scan.c2paDecision = { code: references.length ? 'SUPPORTED_WITH_LOCAL_XMP_REFERENCE' : 'SUPPORTED_EMBEDDED', reason: references.length ? 'Gömülü manifest ve tek yerel XMP işaretçisi birlikte kaldırılabilir' : 'Desteklenen gömülü manifest kaldırılabilir' }
      scan.notes.push('C2PA kaldırma kapsamı yalnız üst düzey manifest store’dur; korunan EXIF, küçük resim ve iç içe metadata kaldırılmış sayılmaz.')
    } catch { /* Unsupported or ambiguous stores remain fail-closed. */ }
  }
  return { scan, parts, header: header!, storeParts, otherBlocked, ...(xmpPatch ? { xmpPatch } : {}) }
}
export function scanImage(data: Uint8Array): Scan {
  const scan = parse(data).scan
  const provenance = readC2pa(data, scan.format, scan.c2pa !== 'not-detected-not-guaranteed')
  return Object.assign(scan, { provenance }, buildFootprints(scan, provenance))
}
async function payloadHash(parts: Part[]): Promise<string> {
  const payloads = parts.filter(p => p.image).map(p => p.payload)
  const length = payloads.reduce((n, p) => n + p.length, 0)
  if (!length || length > MAX) fail('Görüntü yükü sınırı')
  const joined = new Uint8Array(length)
  let pos = 0
  for (const p of payloads) { joined.set(p, pos); pos += p.length }
  const hash = await globalThis.crypto.subtle.digest('SHA-256', joined)
  return Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, '0')).join('')
}
type CleanResult = { mode: CleaningMode; data: Uint8Array; scan: Scan; removed: number; retained: number; payloadHash: string; checks: string[]; changedFields?: ChangedField[] }
function patchedXmpBlock(source: Uint8Array, format: Scan['format'], patch: XmpPatch): Uint8Array {
  const { part, payload } = patch
  if (format === 'JPEG') {
    const prefix = part.end - part.start - part.payload.length
    const out = new Uint8Array(prefix + payload.length)
    out.set(source.subarray(part.start, part.start + prefix)); out.set(payload, prefix)
    new DataView(out.buffer).setUint16(prefix - 2, payload.length + 2)
    return out
  }
  if (format === 'PNG') {
    const out = new Uint8Array(payload.length + 12), view = new DataView(out.buffer)
    view.setUint32(0, payload.length); out.set(source.subarray(part.start + 4, part.start + 8), 4); out.set(payload, 8)
    view.setUint32(out.length - 4, crc(out.subarray(4, out.length - 4)))
    return out
  }
  const out = new Uint8Array(8 + payload.length + (payload.length & 1))
  out.set(source.subarray(part.start, part.start + 4)); new DataView(out.buffer).setUint32(4, payload.length, true); out.set(payload, 8)
  return out
}
function selection(before: Parsed, ids: string[], rightsConsent: boolean, mode: CleaningMode): Set<string> {
  validateMode(mode)
  if (before.scan.cleaningBlocked) fail('C2PA / opaque provenance: tüm temizlik engellendi')
  if (!Array.isArray(ids) || ids.length > MAX_PARTS || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length || typeof rightsConsent !== 'boolean') fail('Geçersiz veya yinelenen seçim')
  const selected = new Set(ids)
  for (const id of selected) {
    const record = before.scan.records.find(r => r.id === id)
    if (!record || !isRemovable(record, mode)) fail('Bilinmeyen veya korunan seçim')
    if ((record!.requiresRightsConsent || record!.kind === 'ICC') && !rightsConsent) fail('Hak bilgisi kaldırma onayı gerekli')
  }
  if (before.scan.format === 'JPEG') {
    const profiles = before.scan.records.filter(r => r.kind === 'ICC')
    if (profiles.some(r => selected.has(r.id)) && profiles.some(r => !selected.has(r.id))) fail('ICC segmentleri birlikte kaldırılmalı')
    if (before.parts.some(p => p.record?.kind === 'JFIF' && selected.has(p.record.id))) {
      const frame = before.parts.find(p => ['JPEG-c0', 'JPEG-c1', 'JPEG-c2'].includes(p.kind))
      if (!frame || ![1, 3].includes(frame.payload[5]!) || (frame.payload[5] === 3 && ![1, 2, 3].every((v, i) => frame.payload[6 + i * 3] === v)) || before.parts.some(p => p.kind === 'JPEG-ee' || p.record?.kind === 'JFIF' && !selected.has(p.record.id))) fail('JFIF renk yorumlama güvenliği doğrulanamadı')
    }
  }
  return selected
}
export async function cleanImage(data: Uint8Array, ids: string[], rightsConsent: boolean, mode: CleaningMode = 'safe'): Promise<CleanResult> {
  const before = parse(data)
  const selected = selection(before, ids, rightsConsent, mode)
  const retained = before.parts.filter(p => !p.record || !selected.has(p.record.id))
  const length = before.header + retained.reduce((n, p) => n + p.end - p.start, 0)
  if (length > MAX) fail('Çıktı sınırı')
  const output = new Uint8Array(length)
  output.set(data.subarray(0, before.header))
  let pos = before.header
  const removedKinds = new Set(before.parts.filter(p => p.record && selected.has(p.record.id)).map(p => p.kind))
  for (const part of retained) {
    output.set(data.subarray(part.start, part.end), pos)
    if (before.scan.format === 'WebP' && part.kind === 'VP8X') {
      if (removedKinds.has('ICCP')) output[pos + 8]! &= ~32
      if (removedKinds.has('EXIF')) output[pos + 8]! &= ~8
      if (removedKinds.has('XMP ')) output[pos + 8]! &= ~4
    }
    pos += part.end - part.start
  }
  if (before.scan.format === 'WebP') new DataView(output.buffer).setUint32(4, output.length - 8, true)
  return verifyOutput(data, output, ids, rightsConsent, mode)
}
export async function cleanC2pa(data: Uint8Array, consent: boolean): Promise<CleanResult & { operation: 'c2pa-store-removal' }> {
  if (consent !== true) fail('C2PA store kaldırma için açık onay gerekli')
  // Snapshot before any await: caller mutation cannot change verification inputs.
  parse(data)
  const source = data.slice(), before = parse(source)
  if (!before.scan.c2paRemovable || before.otherBlocked) fail('C2PA store yapısı veya diğer provenance engelleri kaldırmaya uygun değil')
  const retained = before.parts.filter(p => !before.storeParts.includes(p))
  const patched = before.xmpPatch ? patchedXmpBlock(source, before.scan.format, before.xmpPatch) : undefined
  const expectedBlocks = retained.map(part => part === before.xmpPatch?.part ? patched! : source.subarray(part.start, part.end))
  const output = new Uint8Array(before.header + expectedBlocks.reduce((n, block) => n + block.length, 0))
  output.set(source.subarray(0, before.header))
  let pos = before.header
  for (const block of expectedBlocks) { output.set(block, pos); pos += block.length }
  if (before.scan.format === 'WebP') new DataView(output.buffer).setUint32(4, output.length - 8, true)
  const after = parse(output)
  if (after.scan.cleaningBlocked || after.scan.c2pa !== 'not-detected-not-guaranteed' || after.storeParts.length || after.scan.records.some(r => r.kind === 'C2PA / opaque provenance')) fail('Çıktıda provenance kaldı')
  if (before.header !== after.header || retained.length !== after.parts.length) fail('C2PA kaldırma sayısı doğrulanamadı')
  for (let i = 0; i < before.header; i++) if (!(before.scan.format === 'WebP' && i >= 4 && i < 8) && source[i] !== output[i]) fail('Başlık değişti')
  retained.forEach((part, i) => {
    const actual = after.parts[i]!
    if (part.kind !== actual.kind || !equal(expectedBlocks[i]!, output.subarray(actual.start, actual.end))) fail('Tutulan blok baytları değişti')
  })
  for (const key of ['format', 'width', 'height', 'alpha', 'orientation'] as const) if (before.scan[key] !== after.scan[key]) fail(`Görüntü ${key} değişti`)
  if (after.scan.records.length !== before.scan.records.length - before.storeParts.length) fail('Metadata sayısı değişti')
  const originalHash = await payloadHash(before.parts), hash = await payloadHash(after.parts)
  if (originalHash !== hash) fail('Görüntü yükü hash değişti')
  return { operation: 'c2pa-store-removal', changedFields: before.xmpPatch ? [{ field: '{http://purl.org/dc/terms/}provenance', previousValue: preview(before.xmpPatch.previousValue) }] : [], mode: 'safe', data: output, scan: after.scan, removed: before.storeParts.length, retained: after.scan.records.length, payloadHash: hash, checks: ['Single structurally supported top-level C2PA store removed atomically; signatures not verified', before.xmpPatch ? 'Only validated local XMP provenance field removed; unrelated XML semantics and source bytes preserved; container lengths/CRC adjusted' : 'All retained raw blocks identical; only WebP RIFF size changed', 'Encoded payload SHA-256 and format/dimensions/alpha/orientation identical', 'Output reparsed without detected provenance or cleaning blockers', 'Top-level scope only: retained EXIF, thumbnails and nested metadata are not claimed removed'] }
}
export async function cleanFootprints(data: Uint8Array, consent: { c2paConsent: boolean; rightsConsent: boolean }): Promise<{ footprintResult: FootprintResult; output?: CleanResult }> {
  // No await before snapshot; all subsequent stages use privately owned bytes.
  parse(data)
  const source = data.slice()
  const initial = scanImage(source), before = initial.footprints!
  const plan = consentFootprintPlan(initial, consent?.rightsConsent === true)
  const result = (status: FootprintResult['status'], reason: string, after?: FootprintReport): FootprintResult => ({ status, before, plan, reason, ...(after ? { after } : {}) })
  if (typeof consent?.c2paConsent !== 'boolean' || typeof consent?.rightsConsent !== 'boolean') return { footprintResult: result('BLOCKED', 'Invalid consent') }
  if (plan.blocked || plan.requiresC2paConsent && !consent.c2paConsent) return { footprintResult: result('BLOCKED', 'Safety blocker or required separate consent missing') }
  if (!plan.removeC2pa && !plan.metadataIds.length) return { footprintResult: result(before.evidence.length || before.incomplete ? 'BLOCKED' : 'NOTHING_TO_REMOVE', 'No safely removable footprint blocks') }
  try {
    let working: Uint8Array = source
    let removed = 0
    const checks: string[] = [], changedFields: ChangedField[] = []
    if (plan.removeC2pa) {
      const stage = await cleanC2pa(working, consent.c2paConsent)
      working = stage.data; removed += stage.removed; checks.push(...stage.checks); changedFields.push(...stage.changedFields ?? [])
    }
    // Reparse after C2PA edits: IDs and XMP bytes from the original scan are stale.
    const original = parse(source), target = parse(working)
    const expected = original.parts.filter(p => p.record && plan.metadataIds.includes(p.record.id))
    const fresh = scanImage(working), freshPlan = consentFootprintPlan(fresh, consent.rightsConsent)
    const actual = target.parts.filter(p => p.record && freshPlan.metadataIds.includes(p.record.id))
    if (expected.length !== actual.length || expected.some((p, i) => p.kind !== actual[i]!.kind || !equal(source.subarray(p.start, p.end), working.subarray(actual[i]!.start, actual[i]!.end)))) throw new Error('Planned footprint targets changed')
    if (freshPlan.blocked || freshPlan.removeC2pa) throw new Error('Post-C2PA safety blocker')
    const stage = await cleanImage(working, freshPlan.metadataIds, consent.rightsConsent, 'safe')
    removed += stage.removed; checks.push(...stage.checks)
    const finalScan = scanImage(stage.data), after = finalScan.footprints!
    const finalPlan = consentFootprintPlan(finalScan, consent.rightsConsent)
    if (finalPlan.metadataIds.length || finalPlan.removeC2pa) throw new Error('Removable footprints remain')
    const final = parse(stage.data)
    for (const key of ['format', 'width', 'height', 'alpha', 'orientation'] as const) if (initial[key] !== finalScan[key]) throw new Error('Original/final image properties changed')
    if (await payloadHash(original.parts) !== stage.payloadHash || await payloadHash(final.parts) !== stage.payloadHash) throw new Error('Original/final payload changed')
    plan.preserved = finalScan.records.map(r => r.id)
    const status = after.evidence.length || after.incomplete ? 'PARTIALLY_REMOVED' : 'REMOVED_VERIFIED'
    return { footprintResult: result(status, 'All performed stages verified; retained limitations remain explicit', after), output: { ...stage, scan: finalScan, retained: finalScan.records.length, removed, changedFields, checks } }
  } catch {
    // Never expose any intermediate or unverified output, even after stage one succeeds.
    return { footprintResult: result('VERIFICATION_FAILED', 'Atomic operation failed; no output released') }
  }
}
export async function verifyOutput(data: Uint8Array, output: Uint8Array, ids: string[], rightsConsent: boolean, mode: CleaningMode = 'safe'): Promise<CleanResult> {
  const before = parse(data)
  const selected = selection(before, ids, rightsConsent, mode)
  const retained = before.parts.filter(p => !p.record || !selected.has(p.record.id))
  const removedKinds = new Set(before.parts.filter(p => p.record && selected.has(p.record.id)).map(p => p.kind))
  const after = parse(output)
  if (before.header !== after.header) fail('Görüntü başlığı değişti')
  for (let i = 0; i < before.header; i++) if (!(before.scan.format === 'WebP' && i >= 4 && i < 8) && data[i] !== output[i]) fail('Görüntü başlık baytları değişti')
  if (retained.length !== after.parts.length) fail('Kaldırma sayısı doğrulanamadı')
  retained.forEach((part, i) => {
    const actual = after.parts[i]!
    const expected = data.subarray(part.start, part.end), raw = output.subarray(actual.start, actual.end)
    if (expected.length !== raw.length || part.kind !== actual.kind) fail('Tutulan blok sırası değişti')
    for (let j = 0; j < raw.length; j++) {
      let value = expected[j]!
      if (part.kind === 'VP8X' && j === 8) { if (removedKinds.has('ICCP')) value &= ~32; if (removedKinds.has('EXIF')) value &= ~8; if (removedKinds.has('XMP ')) value &= ~4 }
      if (raw[j] !== value) fail('Tutulan blok baytları değişti')
    }
  })
  for (const key of ['format', 'width', 'height', 'alpha', 'orientation'] as const) if (before.scan[key] !== after.scan[key]) fail(`Görüntü ${key} değişti`)
  if (after.scan.records.length !== before.scan.records.length - selected.size) fail('Seçilen metadata kaldırma doğrulaması')
  const oldImages = before.parts.filter(p => p.image), newImages = after.parts.filter(p => p.image)
  if (oldImages.length !== newImages.length || oldImages.some((p, i) => !equal(p.payload, newImages[i]!.payload))) fail('Kodlanmış görüntü yükü değişti')
  const hash = await payloadHash(after.parts)
  return { mode, data: output, scan: after.scan, removed: selected.size, retained: after.scan.records.length, payloadHash: hash, checks: ['Exact selected blocks removed', 'All retained block bytes verified (WebP selected metadata flags adjusted only)', 'Encoded payload bytes identical; SHA-256 recorded', 'Format/dimensions/alpha/orientation preserved', `Cleaning mode verified: ${mode}; ICC removed only by explicit comprehensive selection`, 'Peak owned byte allocations: output <=128 MiB plus SHA-256 scratch <=128 MiB; caller input <=128 MiB'] }
}
