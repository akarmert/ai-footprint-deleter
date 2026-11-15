import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeXmp, removeXmpReference } from './xmp.ts'

const encoder = new TextEncoder()
const bytes = (s: string) => encoder.encode(s)
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const dc = 'http://purl.org/dc/terms/'
const packet = (body: string, attrs = '') => `<r:RDF xmlns:r="${rdf}" xmlns:d="${dc}" xmlns:t="urn:test"><r:Description ${attrs}>${body}</r:Description></r:RDF>`
const pointer = 'self#jumbf=/c2pa/urn:c2pa:claim'
function clean(source: string) {
  const input = bytes(source)
  const result = analyzeXmp(input)
  assert.equal(result.status, 'valid', result.reason)
  assert.equal(result.references.length, 1)
  const ref = result.references[0]!
  const output = removeXmpReference(input, ref)
  assert.deepEqual(output, new Uint8Array(Buffer.concat([input.subarray(0, ref.start), input.subarray(ref.end)])))
  const after = analyzeXmp(output)
  assert.equal(after.status, 'valid', after.reason)
  assert.equal(after.references.length, 0)
  assert.equal(after.projection, result.projection)
  return { result, output, ref }
}

test('Adobe xpacket BOM, xmpmeta xmptk and literal attribute pointer retain all other bytes', () => {
  const source = `\ufeff<?xml version="1.0" encoding="UTF-8"?>\n<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 9.1">${packet('<t:title>Türkçe 😀</t:title>', `r:about=""\n d:provenance="${pointer}"`)}</x:xmpmeta>\n<?xpacket end="w"?>`
  const { output, ref } = clean(source)
  assert.equal(ref.value, pointer)
  assert.equal(new TextDecoder().decode(bytes(source).subarray(ref.start, ref.end)), `\n d:provenance="${pointer}"`)
  assert.match(new TextDecoder().decode(output), /Türkçe 😀/)
  assert.match(new TextDecoder().decode(output), /x:xmptk="Adobe XMP Core 9.1"/)
})

test('simple text, CDATA and resource forms splice entire property including local namespace', () => {
  for (const property of [
    `<d:provenance>${pointer}</d:provenance>`,
    `<d:provenance><![CDATA[${pointer}]]></d:provenance>`,
    `<p:provenance xmlns:p="${dc}" r:resource="${pointer}"/>`,
  ]) {
    const { ref } = clean(packet(`\n${property}\n<t:title>é漢😀</t:title>\n`))
    assert.equal(ref.value, pointer)
    assert.equal(new TextDecoder().decode(bytes(packet(`\n${property}\n<t:title>é漢😀</t:title>\n`)).subarray(ref.start, ref.end)), property)
  }
  clean(packet('\n<d:provenance>value</d:provenance>\n'))
})

test('decoded references and attribute normalization follow XML rules', () => {
  const { ref } = clean(packet('', 'd:provenance="a&amp;&lt;&gt;&apos;&quot;&#65;&#x1F600;&#10;\r\n\tZ"'))
  assert.equal(ref.value, 'a&<>\'"A😀\n  Z')
  const a = analyzeXmp(bytes(packet('<t:title>A&amp;B&#x1f600;</t:title>')))
  const b = analyzeXmp(bytes(packet('<t:title><![CDATA[A&B😀]]></t:title>')))
  assert.equal(a.projection, b.projection)
})

test('namespace spoofing and rebinding never remove unrelated provenance names', () => {
  const source = packet('<t:provenance>keep</t:provenance><t:box xmlns:d="urn:spoof" d:provenance="keep"/>', `t:provenance="keep" d:provenance="${pointer}"`)
  const { output } = clean(source)
  assert.match(new TextDecoder().decode(output), /t:provenance="keep"/)
  assert.match(new TextDecoder().decode(output), /d:provenance="keep"/)
  assert.match(new TextDecoder().decode(output), /<t:provenance>keep/)
  const spoof = analyzeXmp(bytes(packet('<d:provenance xmlns:d="urn:spoof">keep</d:provenance>')))
  assert.equal(spoof.status, 'valid')
  assert.equal(spoof.references.length, 0)
})

test('unrelated nested arrays, structures and xml:lang survive semantic projection', () => {
  const body = '<t:keywords><r:Bag><r:li xml:lang="tr">a</r:li><r:li>b</r:li></r:Bag></t:keywords><t:struct r:parseType="Resource"><t:field>value</t:field></t:struct>'
  const { result } = clean(packet(body, `d:provenance="${pointer}"`))
  assert.match(result.projection, /value/)
  const changed = analyzeXmp(bytes(packet(body.replace('value', 'changed'))))
  assert.notEqual(result.projection, changed.projection)
  assert.notEqual(analyzeXmp(bytes(packet('<t:field/>'))).projection, analyzeXmp(bytes(packet('<field/>'))).projection)
})

test('multiple references are exposed but removal refuses ambiguity', () => {
  const input = bytes(packet('<d:provenance>two</d:provenance>', 'd:provenance="one"'))
  const result = analyzeXmp(input)
  assert.equal(result.status, 'valid')
  assert.equal(result.references.length, 2)
  assert.throws(() => removeXmpReference(input, result.references[0]!))
  const descriptions = `<r:RDF xmlns:r="${rdf}" xmlns:d="${dc}"><r:Description d:provenance="one"/><r:Description d:provenance="two"/></r:RDF>`
  assert.equal(analyzeXmp(bytes(descriptions)).references.length, 2)
})

test('nested, qualified, array and mixed resource provenance fail closed', () => {
  for (const body of [
    '<t:box><d:provenance>hidden</d:provenance></t:box>',
    '<t:box d:provenance="hidden"/>',
    '<d:provenance><r:Bag><r:li>a</r:li></r:Bag></d:provenance>',
    '<d:provenance xml:lang="en">x</d:provenance>',
    '<d:provenance r:resource="x">y</d:provenance>',
  ]) assert.equal(analyzeXmp(bytes(packet(body))).status, 'unsupported', body)
  for (const attr of ['r:about="other"', 'xml:base="https://example.test"', 'xml:space="preserve"']) {
    assert.equal(analyzeXmp(bytes(packet('', attr))).status, 'unsupported', attr)
  }
})

test('malformed XML syntax and reserved namespaces are rejected without throwing', () => {
  const invalid = [
    '<t:a/>', '<r:RDF/>', packet('<t:a></t:b>'), packet('<t:a a="1"b="2"/>'),
    packet('<t:a a="1" a="2"/>'), packet('<t:a xmlns:q="urn:test" t:a="1" q:a="2"/>'),
    packet('<t:a xmlns:xml="urn:bad"/>'), packet('<t:a xmlns:p="http://www.w3.org/XML/1998/namespace"/>'),
    packet('<t:a xmlns:xmlns="urn:bad"/>'), packet('<t:a xmlns="http://www.w3.org/2000/xmlns/"/>'),
    packet('<t:a xmlns:p=""/>'), packet('<xmlns:a/>'), packet('<t:a:b/>'), packet('<1a/>'),
    packet('<t:a a=x/>'), packet('<t:a a="<"/>'), packet('<t:a>&unknown;</t:a>'),
    packet('<t:a>&#0;</t:a>'), packet('<t:a>&#xD800;</t:a>'), packet('<t:a>&#x110000;</t:a>'),
    packet('<t:a>&#x;</t:a>'), packet('<t:a>&#-1;</t:a>'), packet('<t:a>&amp</t:a>'),
    packet('<t:a>]]></t:a>'), packet('<!-- a--b -->'), packet('<!-- a--->'),
    packet('<t:a><![CDATA[x</t:a>'), packet('<t:a>\u0001</t:a>'), packet('<t:a>\ufffe</t:a>'),
    packet('') + packet(''), packet('') + 'text', '<!--unclosed',
  ]
  for (const source of invalid) assert.equal(analyzeXmp(bytes(source)).status, 'malformed', source)
  assert.equal(analyzeXmp(new Uint8Array([0xc0, 0xaf])).status, 'malformed')
})

test('DTD, entities, unsupported processing instructions and encodings never pass', () => {
  const cases = [
    '<!DOCTYPE r:RDF [<!ENTITY x SYSTEM "file:///secret">]>' + packet(''),
    '<!ENTITY x "attack">' + packet(''), packet('<!DOCTYPE x>'),
    '<?unknown test?>' + packet(''), packet('<?xpacket end="w"?>'),
    '<?xpacket bytes="100" begin=""?>' + packet(''),
    '<?xml version="1.1"?>' + packet(''), '<?xml version="1.0" encoding="UTF-16"?>' + packet(''),
    '<?xpacket begin="bad"?>' + packet(''), packet('') + '<?xpacket end="bad"?>',
  ]
  for (const source of cases) assert.equal(analyzeXmp(bytes(source)).status, 'unsupported', source)
})

test('semantic projection normalizes interelement whitespace and attribute order only', () => {
  const a = packet('<t:box a="1" b="2"><t:a/>\n<t:b/></t:box>')
  const b = packet('\n<t:box b="2" a="1"><t:a/><t:b/></t:box>\n')
  assert.equal(analyzeXmp(bytes(a)).projection, analyzeXmp(bytes(b)).projection)
  assert.notEqual(analyzeXmp(bytes(packet('<t:a> text </t:a>'))).projection, analyzeXmp(bytes(packet('<t:a>text</t:a>'))).projection)
})

test('deterministic byte, node, depth and attribute budgets fail closed', () => {
  assert.equal(analyzeXmp(new Uint8Array(1024 * 1024 + 1)).status, 'unsupported')
  assert.equal(analyzeXmp(bytes(packet('<t:a/>'.repeat(8192)))).status, 'unsupported')
  assert.equal(analyzeXmp(bytes(packet('<t:a>'.repeat(31) + '</t:a>'.repeat(31)))).status, 'unsupported')
  assert.equal(analyzeXmp(bytes(packet(`<t:a ${Array.from({ length: 129 }, (_, i) => `a${i}=""`).join(' ')}/>`))).status, 'unsupported')
  assert.equal(analyzeXmp(bytes(packet(`<t:a ${Array.from({ length: 128 }, (_, i) => `a${i}=""`).join(' ')}/>`))).status, 'valid')
})

test('empty comments and mixed-content whitespace retain decoded semantics', () => {
  const plain = analyzeXmp(bytes(packet('<t:a>a <t:b/> b</t:a>')))
  const comment = analyzeXmp(bytes(packet('<!----><t:a>a <!----><t:b/> b</t:a>')))
  assert.equal(comment.status, 'valid')
  assert.equal(comment.projection, plain.projection)
  assert.notEqual(plain.projection, analyzeXmp(bytes(packet('<t:a>a<t:b/>b</t:a>'))).projection)
  assert.equal(analyzeXmp(bytes('<?xml version="1&#46;0"?>' + packet(''))).status, 'malformed')
})

test('RDF identity and syntax attributes cannot change the current asset subject', () => {
  for (const attr of ['r:ID="asset"', 'r:nodeID="asset"', 'r:resource="other"', 'r:parseType="Resource"']) {
    assert.equal(analyzeXmp(bytes(packet('', `${attr} d:provenance="value"`))).status, 'unsupported', attr)
    assert.equal(analyzeXmp(bytes(packet('').replace('<r:RDF ', `<r:RDF ${attr} `))).status, 'unsupported', attr)
  }
  clean(packet('', 'r:about="" d:provenance="value"'))
  clean(packet('', 'd:provenance="value"'))
})

test('xpacket begin and end must be paired, while absent packets remain valid', () => {
  for (const source of ['<?xpacket begin=""?>' + packet(''), packet('') + '<?xpacket end="w"?>']) {
    assert.equal(analyzeXmp(bytes(source)).status, 'unsupported')
  }
  for (const end of ['r', 'w']) {
    clean('<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' + packet('', 'd:provenance="value"') + `<?xpacket end="${end}"?>`)
  }
})

test('QName and attribute value limits bound token allocations at their boundary', () => {
  for (const length of [512, 513]) {
    const tag = 'a'.repeat(length)
    assert.equal(analyzeXmp(bytes(packet(`<${tag}/>`))).status, length === 512 ? 'valid' : 'unsupported')
  }
  for (const length of [4096, 4097]) {
    assert.equal(analyzeXmp(bytes(packet('', `t:value="${'a'.repeat(length)}"`))).status, length === 4096 ? 'valid' : 'unsupported')
    assert.equal(analyzeXmp(bytes(packet(`<p:field xmlns:p="${'u'.repeat(length)}"/>`))).status, length === 4096 ? 'valid' : 'unsupported')
  }
})

test('inherited namespace maps and expanded URI repetition have cumulative budgets', () => {
  const bindings = Array.from({ length: 120 }, (_, n) => `xmlns:p${n}="urn:${n}"`).join(' ')
  const scopes = packet(`<t:scope ${bindings}>${'<t:item/>'.repeat(600)}</t:scope>`)
  const scopeResult = analyzeXmp(bytes(scopes))
  assert.equal(scopeResult.status, 'unsupported')
  assert.match(scopeResult.reason!, /Namespace scope budget/)
  const repeatedUri = packet(`<p:scope xmlns:p="${'u'.repeat(4096)}">${'<p:item/>'.repeat(520)}</p:scope>`)
  const uriResult = analyzeXmp(bytes(repeatedUri))
  assert.equal(uriResult.status, 'unsupported')
  assert.match(uriResult.reason!, /Expanded name budget/)
})

test('reserved XML namespace aliases and hostile entity prefixes are rejected', () => {
  for (const declaration of [
    'xmlns="http://www.w3.org/XML/1998/namespace"',
    'xmlns:p="http://www.w3.org/2000/xmlns/"',
    'xmlns:xml=""',
    'xmlns:xmlns="http://www.w3.org/2000/xmlns/"',
  ]) assert.equal(analyzeXmp(bytes(packet(`<t:field ${declaration}/>`))).status, 'malformed')
  assert.equal(analyzeXmp(bytes(packet('<t:field xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:lang="tr"/>'))).status, 'valid')
  assert.equal(analyzeXmp(bytes(packet(`<t:field>${'&'.repeat(100000)}</t:field>`))).status, 'malformed')
})

test('stale or forged spans are never applied', () => {
  const input = bytes(packet('', 'd:provenance="value"'))
  const ref = analyzeXmp(input).references[0]!
  assert.throws(() => removeXmpReference(input, { ...ref, start: ref.start + 1 }))
  assert.throws(() => removeXmpReference(input, { ...ref, value: 'forged' }))
  assert.throws(() => removeXmpReference(bytes(packet('')), ref))
})
