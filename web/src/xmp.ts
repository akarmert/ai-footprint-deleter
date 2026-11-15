// Deliberately bounded XML/XMP subset, not a general XML or RDF parser.
export interface XmpReference { value: string; start: number; end: number }
export interface XmpAnalysis {
  status: 'valid' | 'malformed' | 'unsupported'
  references: XmpReference[]
  projection: string
  reason?: string
}
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const DC = 'http://purl.org/dc/terms/'
const XML = 'http://www.w3.org/XML/1998/namespace'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const META = 'adobe:ns:meta/'
const expanded = (uri: string, local: string) => JSON.stringify([uri, local])
const provenance = expanded(DC, 'provenance')
const ws = /^[\x20\t\r\n]*$/
interface Attribute { name: string; value: string; start: number; end: number }
interface Element { name: string; attrs: Attribute[]; children: (Element | string)[]; start: number; end: number }
class Rejection extends Error {
  status: 'malformed' | 'unsupported'
  constructor(status: 'malformed' | 'unsupported', message: string) { super(message); this.status = status }
}
const fail = (message: string): never => { throw new Rejection('malformed', message) }
const unsupported = (message: string): never => { throw new Rejection('unsupported', message) }
function xmlChar(cp: number): boolean {
  return cp === 9 || cp === 10 || cp === 13 || (cp >= 32 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)
}

export function analyzeXmp(bytes: Uint8Array): XmpAnalysis {
  try {
    if (bytes.length > 1024 * 1024) unsupported('XMP byte limit exceeded')
    let source: string
    try { source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
    catch { return { status: 'malformed', references: [], projection: '', reason: 'Invalid UTF-8' } }
    // The map records UTF-8 byte positions, including an optional BOM. No
    // token boundary can occur between a surrogate pair.
    const offsets = new Uint32Array(source.length + 1)
    let byte = 0
    for (let c = 0; c < source.length;) {
      const cp = source.codePointAt(c)!
      if (!xmlChar(cp)) fail('Invalid XML character')
      offsets[c] = byte
      const width = cp > 0xffff ? 2 : 1
      if (width === 2) offsets[c + 1] = byte
      byte += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4
      c += width
    }
    offsets[source.length] = byte
    let i = source.startsWith('\ufeff') ? 1 : 0
    let count = 0
    const tick = () => { if (++count > 8192) unsupported('XML node limit exceeded') }
    const space = () => { while (i < source.length && /[\x20\t\r\n]/.test(source[i]!)) i++ }
    let namespaceCopies = 0
    let expandedNameUnits = 0
    const qnamePattern = /[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y
    const name = () => {
      qnamePattern.lastIndex = i
      const match = qnamePattern.exec(source)
      if (!match) fail('Invalid ASCII QName')
      if (match![0].length > 512) unsupported('QName length limit exceeded')
      i = qnamePattern.lastIndex
      return match![0]
    }
    const decode = (raw: string): string => {
      const normalized = raw.replace(/\r\n?/g, '\n')
      return normalized.replace(/&([^&;]*);|&/g, (whole: string, entity: string | undefined) => {
        if (entity === undefined) return fail('Unterminated entity')
        const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', apos: "'", quot: '"' }
        if (Object.hasOwn(predefined, entity)) return predefined[entity]!
        if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) return fail('Unknown or malformed entity')
        const cp = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1))
        if (!xmlChar(cp) || !Number.isSafeInteger(cp)) return fail('Invalid character reference')
        return String.fromCodePoint(cp)
      })
    }
    // Literal attribute whitespace is normalized before entity replacement:
    // character references to whitespace must retain their original value.
    const attributeValue = (raw: string) => decode(raw.replace(/\r\n?|\n|\t/g, ' '))
    const rawAttrs = () => {
      const attrs: { qname: string; value: string; start: number; end: number }[] = []
      while (true) {
        const start = i
        space()
        if (source[i] === '>' || source.startsWith('/>', i) || source.startsWith('?>', i)) return attrs
        if (i === start) fail('Missing attribute whitespace')
        if (attrs.length >= 128) unsupported('Attribute limit exceeded')
        const qname = name()
        space()
        if (source[i++] !== '=') fail('Missing attribute equals')
        space()
        const quote = source[i++]
        if (quote !== '"' && quote !== "'") fail('Unquoted attribute')
        const end = source.indexOf(quote!, i)
        if (end < 0) fail('Unclosed attribute')
        if (end - i > 4096) unsupported('Attribute value length limit exceeded')
        const raw = source.slice(i, end)
        if (raw.includes('<')) fail('Less-than in attribute')
        const value = attributeValue(raw)
        i = end + 1
        if (attrs.some(a => a.qname === qname)) fail('Duplicate attribute')
        attrs.push({ qname, value, start, end: i })
      }
    }
    if (source.startsWith('<?xml', i) && /[\x20\t\r\n]/.test(source[i + 5] ?? '')) {
      i += 5
      const declarationEnd = source.indexOf('?>', i)
      if (declarationEnd < 0 || source.slice(i, declarationEnd).includes('&')) fail('Invalid XML declaration')
      const attrs = rawAttrs()
      if (!source.startsWith('?>', i)) fail('Unclosed XML declaration')
      i += 2
      const keys = attrs.map(a => a.qname).join(',')
      if (!/^(version|version,encoding|version,standalone|version,encoding,standalone)$/.test(keys) || attrs[0]?.value !== '1.0') unsupported('Only XML 1.0 supported')
      for (const a of attrs) {
        if (a.qname === 'encoding' && a.value.toLowerCase() !== 'utf-8') unsupported('Only UTF-8 supported')
        if (a.qname === 'standalone' && !['yes', 'no'].includes(a.value)) fail('Invalid standalone declaration')
      }
    }
    let packetBegin = false
    let packetEnd = false
    const comment = () => {
      tick()
      const end = source.indexOf('-->', i + 4)
      const body = source.slice(i + 4, end)
      if (end < 0 || body.includes('--') || body.endsWith('-')) fail('Invalid XML comment')
      i = end + 3
    }
    const pi = (afterRoot: boolean) => {
      tick()
      i += 2
      const target = name()
      if (target !== 'xpacket') unsupported('Unsupported processing instruction')
      const attrs = rawAttrs()
      if (!source.startsWith('?>', i)) fail('Unclosed processing instruction')
      i += 2
      if (afterRoot) {
        if (packetEnd || attrs.length !== 1 || attrs[0]?.qname !== 'end' || !['w', 'r'].includes(attrs[0].value)) unsupported('Unsupported xpacket end')
        packetEnd = true
      } else {
        const begin = attrs.find(a => a.qname === 'begin')
        if (packetBegin || !begin || !['', '\ufeff'].includes(begin.value) || attrs.some(a => !['begin', 'id'].includes(a.qname))) unsupported('Unsupported xpacket begin')
        packetBegin = true
      }
    }
    const parseElement = (inherited: Map<string, string>, depth: number): Element => {
      if (depth > 32) unsupported('XML depth limit exceeded')
      tick()
      const start = i++
      const qname = name()
      const raw = rawAttrs()
      // Bound total copied map entries, including scopes without declarations.
      namespaceCopies += inherited.size
      if (namespaceCopies > 65536) unsupported('Namespace scope budget exceeded')
      const ns = new Map(inherited)
      for (const a of raw) {
        if (a.qname === 'xmlns' || a.qname.startsWith('xmlns:')) {
          const prefix = a.qname === 'xmlns' ? '' : a.qname.slice(6)
          if (prefix === 'xmlns' || a.value === XMLNS || (prefix === 'xml') !== (a.value === XML) || (prefix !== '' && a.value === '')) fail('Reserved namespace binding')
          ns.set(prefix, a.value)
        }
      }
      const resolve = (q: string, attribute = false) => {
        const parts = q.split(':')
        if (parts.length > 1 && (parts[0] === 'xmlns' || !ns.has(parts[0]!))) fail('Undeclared or reserved namespace prefix')
        const uri = parts.length === 1 ? (attribute ? '' : (ns.get('') ?? '')) : ns.get(parts[0]!)!
        const local = parts.length === 1 ? q : parts[1]!
        // Expanded names repeat inherited URIs in the tree and projection.
        expandedNameUnits += uri.length + local.length
        if (expandedNameUnits > 2 * 1024 * 1024) unsupported('Expanded name budget exceeded')
        return expanded(uri, local)
      }
      const node: Element = { name: resolve(qname), attrs: [], children: [], start, end: 0 }
      for (const a of raw) {
        if (a.qname === 'xmlns' || a.qname.startsWith('xmlns:')) continue
        const key = resolve(a.qname, true)
        if (node.attrs.some(existing => existing.name === key)) fail('Duplicate expanded attribute')
        if (key === expanded(XML, 'base') || key === expanded(XML, 'space')) unsupported('xml:base and xml:space are unsupported')
        node.attrs.push({ name: key, value: a.value, start: a.start, end: a.end })
      }
      if (source.startsWith('/>', i)) { i += 2; node.end = i; return node }
      if (source[i++] !== '>') fail('Invalid opening tag')
      while (i < source.length) {
        if (source.startsWith('</', i)) {
          i += 2
          if (name() !== qname) fail('Mismatched closing tag')
          space()
          if (source[i++] !== '>') fail('Invalid closing tag')
          node.end = i
          return node
        }
        if (source.startsWith('<!--', i)) { comment(); continue }
        if (source.startsWith('<![CDATA[', i)) {
          tick()
          const end = source.indexOf(']]>', i + 9)
          if (end < 0) fail('Unclosed CDATA')
          node.children.push(source.slice(i + 9, end).replace(/\r\n?/g, '\n'))
          i = end + 3
          continue
        }
        if (source.startsWith('<?', i)) unsupported('Processing instruction inside root')
        if (source.startsWith('<!', i)) unsupported('XML declarations are forbidden')
        if (source[i] === '<') { node.children.push(parseElement(ns, depth + 1)); continue }
        tick()
        const end = source.indexOf('<', i)
        if (end < 0) fail('Unclosed element')
        const text = source.slice(i, end)
        if (text.includes(']]>')) fail('CDATA terminator in text')
        node.children.push(decode(text))
        i = end
      }
      return fail('Unclosed element')
    }
    const outside = (afterRoot: boolean) => {
      while (i < source.length) {
        space()
        if (source.startsWith('<!--', i)) comment()
        else if (source.startsWith('<?', i)) pi(afterRoot)
        else break
      }
    }
    outside(false)
    if (source.startsWith('<!', i)) unsupported('XML declarations are forbidden')
    if (source[i] !== '<' || source.startsWith('</', i)) fail('Missing root element')
    const root = parseElement(new Map([['xml', XML]]), 1)
    outside(true)
    if (i !== source.length) fail('Content after root element')
    if (packetBegin !== packetEnd) unsupported('Unpaired xpacket processing instructions')
    const elements = (node: Element) => node.children.filter((c): c is Element => typeof c !== 'string')
    const onlyWhitespace = (node: Element) => node.children.every(c => typeof c !== 'string' || ws.test(c))
    let rdf = root
    if (root.name === expanded(META, 'xmpmeta')) {
      const children = elements(root)
      if (children.length !== 1 || !onlyWhitespace(root)) unsupported('Unsupported XMP wrapper')
      rdf = children[0]!
    }
    if (rdf.name !== expanded(RDF, 'RDF') || !onlyWhitespace(rdf)) unsupported('Expected rdf:RDF')
    // rdf:RDF does not carry node identity or property attributes in this subset.
    if (rdf.attrs.some(a => JSON.parse(a.name)[0] === RDF)) unsupported('RDF root attributes are unsupported')
    const descriptions = elements(rdf)
    if (!descriptions.length || descriptions.some(d => d.name !== expanded(RDF, 'Description'))) unsupported('Expected top-level rdf:Description')
    const references: XmpReference[] = []
    const omittedAttrs = new Set<Attribute>()
    const omittedElements = new Set<Element>()
    const add = (value: string, start: number, end: number) => references.push({ value, start: offsets[start]!, end: offsets[end]! })
    for (const d of descriptions) {
      if (!onlyWhitespace(d)) unsupported('Description mixed content')
      if (d.attrs.some(a => a.name === expanded(RDF, 'about') && a.value !== '')) unsupported('Nonempty rdf:about')
      if (d.attrs.some(a => JSON.parse(a.name)[0] === RDF && a.name !== expanded(RDF, 'about'))) unsupported('Description RDF identity or syntax attributes are unsupported')
      for (const a of d.attrs) if (a.name === provenance) { add(a.value, a.start, a.end); omittedAttrs.add(a) }
      for (const p of elements(d)) {
        if (p.name !== provenance) continue
        if (elements(p).length) unsupported('Complex provenance property')
        const resource = p.attrs.find(a => a.name === expanded(RDF, 'resource'))
        if (p.attrs.some(a => a !== resource)) unsupported('Qualified provenance property')
        const text = p.children.join('')
        if (resource && !ws.test(text)) unsupported('Mixed provenance resource and text')
        add(resource ? resource.value : text, p.start, p.end)
        omittedElements.add(p)
      }
    }
    const inspect = (node: Element) => {
      if (node.name === provenance && !omittedElements.has(node)) unsupported('Nested provenance property')
      if (node.attrs.some(a => a.name === provenance && !omittedAttrs.has(a))) unsupported('Nested provenance attribute')
      for (const child of elements(node)) inspect(child)
    }
    inspect(root)
    const project = (node: Element): unknown => {
      const children: unknown[] = []
      const hasElements = onlyWhitespace(node) && (elements(node).some(child => !omittedElements.has(child)) || node === rdf || descriptions.includes(node) || node === root && node.name === expanded(META, 'xmpmeta'))
      for (const child of node.children) {
        if (typeof child === 'string') {
          if (hasElements && ws.test(child)) continue
          if (typeof children[children.length - 1] === 'string') children[children.length - 1] = String(children[children.length - 1]) + child
          else if (child) children.push(child)
        } else if (!omittedElements.has(child)) children.push(project(child))
      }
      return [node.name, node.attrs.filter(a => !omittedAttrs.has(a)).map(a => [a.name, a.value]).sort((a, b) => a[0]! < b[0]! ? -1 : a[0]! > b[0]! ? 1 : 0), children]
    }
    return { status: 'valid', references, projection: JSON.stringify(project(root)) }
  } catch (error) {
    if (error instanceof Rejection) return { status: error.status, references: [], projection: '', reason: error.message }
    return { status: 'malformed', references: [], projection: '', reason: 'Invalid XMP' }
  }
}

export function removeXmpReference(bytes: Uint8Array, reference: XmpReference): Uint8Array {
  const before = analyzeXmp(bytes)
  if (before.status !== 'valid' || before.references.length !== 1 || !before.references.some(r => r.value === reference.value && r.start === reference.start && r.end === reference.end)) throw new Error('XMP reference is not uniquely removable')
  const output = new Uint8Array(bytes.length - (reference.end - reference.start))
  output.set(bytes.subarray(0, reference.start))
  output.set(bytes.subarray(reference.end), reference.start)
  const after = analyzeXmp(output)
  if (after.status !== 'valid' || after.references.length !== 0 || after.projection !== before.projection) throw new Error('XMP removal verification failed')
  return output
}
