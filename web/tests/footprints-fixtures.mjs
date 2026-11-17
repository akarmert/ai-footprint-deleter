// Development-only pinned public fixture measurement. No uploads or SDK network access.
// node tests/footprints-fixtures.mjs --download
// node tests/footprints-fixtures.mjs --cache <previously reported cache directory>
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir, mkdtemp } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict' // Self-test only; no engine or fixture access.

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Cache parent: AFC_FIXTURE_CACHE_PARENT or <os temp>/ai-footprint-deleter-fixtures. Python: AFC_PYTHON or the repo .venv.
const parent = resolve(process.env.AFC_FIXTURE_CACHE_PARENT || join(tmpdir(), 'ai-footprint-deleter-fixtures'))
const python = process.env.AFC_PYTHON || resolve(web, '..', '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']))
const publicCommit = '22beccc075707475b038d8789d0136c009e43143'
const sdkCommit = '0e92435c6d621c02c9bde2a8d82346295ed1f509'
const names = ['adobe-20220124-A.jpg', 'adobe-20220124-C.jpg', 'adobe-20220124-CA.jpg', 'adobe-20220124-E-dat-CA.jpg', 'adobe-20220124-E-sig-CA.jpg', 'adobe-20220124-E-uri-CA.jpg', 'adobe-20220124-E-clm-CAICAI.jpg', 'truepic-20230212-camera.jpg', 'exp-test1.png', 'sample1.png', 'sample1.webp']
const sizes = [61720, 140297, 178709, 178709, 178709, 178709, 656258, 2261231, 5884439, 299257, 50408]
// Pinned from the independently recorded 2026-11-15T11:16:32.904Z report.
const hashes = [
  'f999fd78bfe8a83c96e468a078830ba94485bc1bc6fd086fb94a43bd29dd0f23',
  '75a8da33f6eaf1e16bf3b42cd78913b22b2e6a671fda217a508b1ba4230ce864',
  'cafc48c53e651f7ba4622d1f72783827074211e42b9634cc863ec3be3c7651b3',
  'dae9d121060cec4b6f27ee8acda85ad461cf75f2261d90b463319b787342d7f9',
  '0d4c2774f1b7e94b9613bb952b0a76b6a178d22ac6d206d257d2af1376cbbff2',
  '56014faf6b97532252c9bb90dcf484923a8aa7bba197e84a8555044a35e4f3a6',
  'b3ff3f00c66602280977d3e4d962a836d33ab83953d0009f7c1e6490d0065feb',
  '379aabc7d04ee8c8fb04e18925428463353ab6fb6696ee3d7aa11710c6b2e147',
  '8794b09652ab0585b9337f9c85981407ee297eda20f5885964057fca59648bd3',
  '0bd72c972c14e5fd27d8473c5599e801031576e1398f384c40c3394696a2619a',
  '006ee0871284b06a311286b9b72b3d083951ea6e9c78aa14d7894742daebfad3',
]
// The PNG retains opaque ICC metadata, so verified removal must remain partial.
const statuses = ['BLOCKED', ...Array(6).fill('PARTIALLY_REMOVED'), 'BLOCKED', 'PARTIALLY_REMOVED', 'BLOCKED', 'NOTHING_TO_REMOVE']
const fixtures = names.map((name, i) => ({ name, expectedSize: sizes[i], expectedSha256: hashes[i], expectedStatus: statuses[i], origin: i < 7 ? 'Adobe generated conformance' : i === 7 ? 'Truepic SDK camera sample; not end-user original; Truepic_Lens_SDK_libc2pa/2.5.1' : 'C2PA SDK fixture', license: i < 8 ? 'CC BY-SA 4.0 (public-testfiles list)' : 'media license unresolved; do not redistribute', url: i < 8 ? `https://raw.githubusercontent.com/c2pa-org/public-testfiles/${publicCommit}/legacy/1.4/image/jpeg/${name}` : `https://raw.githubusercontent.com/contentauth/c2pa-rs/${sdkCommit}/sdk/tests/fixtures/${name}` }))
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex')
const inventory = bytes => ({ size: bytes.length, sha256: sha(bytes), gitBlobSha1: sha(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1') })
// Independent container walk, only used after the product parser accepts the file.
function payload(data, format) {
  const chunks = []
  if (format === 'PNG') {
    for (let p = 8; p < data.length;) { const n = data.readUInt32BE(p), type = data.toString('ascii', p + 4, p + 8); if (type === 'IDAT') chunks.push(data.subarray(p + 8, p + 8 + n)); p += n + 12 }
  } else if (format === 'WebP') {
    for (let p = 12; p < data.length;) { const n = data.readUInt32LE(p + 4), type = data.toString('ascii', p, p + 4); if (['VP8 ', 'VP8L', 'ALPH'].includes(type)) chunks.push(data.subarray(p + 8, p + 8 + n)); p += 8 + n + (n & 1) }
  } else {
    for (let p = 2; p < data.length;) {
      const start = p; while (data[p] === 255) p++; const marker = data[p++]
      if (marker === 217) { chunks.push(data.subarray(start, p)); break }
      const n = data.readUInt16BE(p), end = p + n, block = data.subarray(p + 2, end)
      if (![225, 226, 235, 237, 254].includes(marker) && !(marker === 224 && block.subarray(0, 5).equals(Buffer.from('JFIF\0')))) chunks.push(block)
      p = end
      if (marker === 218) {
        let q = end
        while (q < data.length) { if (data[q++] !== 255) continue; const boundary = q - 1; while (data[q] === 255) q++; if (data[q] === 0 || data[q] >= 208 && data[q] <= 215) { q++; continue } chunks.push(data.subarray(end, boundary)); p = boundary; break }
      }
    }
  }
  return sha(Buffer.concat(chunks))
}
async function sources() { const result = {}; for (const name of (await readdir(join(web, 'src'))).filter(n => n.endsWith('.ts')).sort()) result[name] = sha(await readFile(join(web, 'src', name))); return result }
function failures(report) {
  const errors = []
  if (report.sourceUnchanged !== true) errors.push('Engine sources changed')
  if (report.results.length !== fixtures.length) errors.push('Missing fixture rows')
  for (const fixture of fixtures) {
    const row = report.results.find(r => r.name === fixture.name)
    if (!row || row.error || !row.scan || !row.result) { errors.push(`${fixture.name}: error or missing scan/result`); continue }
    if (row.input?.sha256 !== fixture.expectedSha256 || row.input?.size !== fixture.expectedSize) errors.push(`${fixture.name}: input mismatch`)
    if (row.sourceUnchanged !== true) errors.push(`${fixture.name}: source mismatch`)
    if (row.result.status !== fixture.expectedStatus) errors.push(`${fixture.name}: unexpected status ${row.result.status}`)
    const needsOutput = ['PARTIALLY_REMOVED', 'REMOVED_VERIFIED'].includes(fixture.expectedStatus)
    if (needsOutput && !row.output) errors.push(`${fixture.name}: missing output`)
    if (!needsOutput && row.output) errors.push(`${fixture.name}: unexpected output`)
    if (row.output && (row.payloadUnchanged !== true || !row.sourcePayloadSha256 || row.sourcePayloadSha256 !== row.output.independentPayloadSha256 || row.output.payloadSha256 !== row.output.independentPayloadSha256)) errors.push(`${fixture.name}: payload mismatch`)
  }
  const sdk = report.sdk
  if (sdk.exitCode !== 0 || sdk.error) errors.push('SDK process failed')
  const sdkRows = sdk.report?.results
  if (!Array.isArray(sdkRows) || sdkRows.length !== sdk.paths.length || sdk.paths.length < fixtures.length) errors.push('SDK results missing')
  for (const [index, path] of sdk.paths.entries()) {
    const matches = Array.isArray(sdkRows) ? sdkRows.filter(r => r.inputIndex === index) : []
    const row = matches[0]
    if (matches.length !== 1 || row.error || row.readability !== 'readable') errors.push(`SDK unreadable or missing: ${path}`)
    if (dirname(path).endsWith('outputs') && row?.presence !== 'absent') errors.push(`SDK output manifest not absent: ${path}`)
  }
  return errors
}
function selfTest() {
  const valid = () => ({ sourceUnchanged: true, results: fixtures.map(f => ({ name: f.name, input: { sha256: f.expectedSha256, size: f.expectedSize }, scan: {}, result: { status: f.expectedStatus }, sourceUnchanged: true, ...(['PARTIALLY_REMOVED', 'REMOVED_VERIFIED'].includes(f.expectedStatus) ? { sourcePayloadSha256: 'payload', payloadUnchanged: true, output: { independentPayloadSha256: 'payload', payloadSha256: 'payload' } } : {}) })), sdk: { exitCode: 0, paths: fixtures.map(f => join(parent, f.name)), report: { results: fixtures.map((_, inputIndex) => ({ inputIndex, readability: 'readable', presence: 'present' })) } } })
  assert.deepEqual(failures(valid()), []) // Blocked/nothing controls need no output.
  const cases = [
    r => { r.results[0].error = 'scan threw' },
    r => { delete r.results[0].scan },
    r => { delete r.results[0].result },
    r => { r.results[0].input.sha256 = 'same-size-corruption' },
    r => { r.results[0].sourceUnchanged = false },
    r => { r.sourceUnchanged = false },
    r => { r.results[1].output.payloadSha256 = 'changed' },
    r => { delete r.results[1].output },
    r => { r.results[0].result.status = 'REMOVED_VERIFIED' },
    r => { r.results[0].sourcePayloadSha256 = 'payload'; r.results[0].payloadUnchanged = true; r.results[0].output = { independentPayloadSha256: 'payload', payloadSha256: 'payload' } },
    r => { r.results.at(-1).sourcePayloadSha256 = 'payload'; r.results.at(-1).payloadUnchanged = true; r.results.at(-1).output = { independentPayloadSha256: 'payload', payloadSha256: 'payload' } },
    r => { r.results.pop() },
    r => { r.sdk.exitCode = 1 },
    r => { r.sdk.error = 'spawn failed' },
    r => { delete r.sdk.report },
    r => { r.sdk.report.results.pop() },
    r => { r.sdk.report.results[0].error = 'SDK failed' },
    r => { r.sdk.paths[1] = join(parent, 'outputs', fixtures[1].name) },
  ]
  for (const mutate of cases) { const report = valid(); mutate(report); assert.equal(failures(report).length > 0, true) }
  const absent = valid(); absent.sdk.paths[1] = join(parent, 'outputs', fixtures[1].name); absent.sdk.report.results[1].presence = 'absent'
  assert.deepEqual(failures(absent), [])
  console.log(`Self-test passed: ${cases.length} failure cases and 2 success controls`)
}
async function main(args) {
const { scanImage, cleanFootprints } = await import('../src/engine.ts')
if (!(args.length === 1 && args[0] === '--download') && !(args.length === 2 && args[0] === '--cache')) throw new Error('Use --download or --cache <directory>')
if (args[0] === '--download') await mkdir(parent, { recursive: true })
const cache = args[0] === '--download' ? await mkdtemp(join(parent, `ai-footprint-deleter-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}-`)) : resolve(args[1])
if (dirname(cache) !== parent || !cache.split(/[\\/]/).at(-1).startsWith('ai-footprint-deleter-')) throw new Error('Cache must be a task directory directly under approved temp parent')
await mkdir(join(cache, 'outputs'), { recursive: true })
const beforeSources = await sources(), results = []
for (const fixture of fixtures) {
  const row = { ...fixture }
  try {
    const path = join(cache, fixture.name)
    if (args[0] === '--download') {
      const response = await fetch(fixture.url, { redirect: 'error', signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      // Stop streaming as soon as the pinned limit is exceeded, before concatenation.
      const chunks = []; let length = 0
      for await (const chunk of response.body) {
        length += chunk.length
        if (length > fixture.expectedSize) throw new Error(`Download exceeds pinned size: ${length}`)
        chunks.push(chunk)
      }
      const bytes = Buffer.concat(chunks, length)
      if (bytes.length !== fixture.expectedSize || sha(bytes) !== fixture.expectedSha256) throw new Error('Downloaded size or SHA-256 mismatch')
      await writeFile(path, bytes, { flag: 'wx' })
    }
    const data = await readFile(path); row.input = inventory(data)
    if (data.length !== fixture.expectedSize || row.input.sha256 !== fixture.expectedSha256) throw new Error('Cached size or SHA-256 mismatch')
    const scan = scanImage(data)
    row.scan = { format: scan.format, width: scan.width, height: scan.height, alpha: scan.alpha, orientation: scan.orientation, c2paDecision: scan.c2paDecision, cleaningBlocked: scan.cleaningBlocked, footprints: scan.footprints, plan: scan.footprintPlan }
    row.sourcePayloadSha256 = payload(data, scan.format)
    const result = await cleanFootprints(data, { c2paConsent: true, rightsConsent: true })
    row.result = result.footprintResult
    if (result.output) {
      const output = Buffer.from(result.output.data), outputPath = join(cache, 'outputs', fixture.name)
      await writeFile(outputPath, output)
      row.output = { ...inventory(output), payloadSha256: result.output.payloadHash, independentPayloadSha256: payload(output, scan.format), checks: result.output.checks, removed: result.output.removed, changedFields: result.output.changedFields, rescanned: scanImage(output).footprints }
      row.payloadUnchanged = row.sourcePayloadSha256 === row.output.independentPayloadSha256 && row.output.payloadSha256 === row.output.independentPayloadSha256
      if (!row.payloadUnchanged) throw new Error('Independent payload mismatch')
    }
    row.sourceUnchanged = row.input.sha256 === sha(await readFile(path)) && row.input.sha256 === sha(data)
  } catch (error) { row.error = String(error.message) }
  results.push(row)
}
const sdkPaths = results.filter(r => r.input).flatMap(r => [join(cache, r.name), ...(r.output ? [join(cache, 'outputs', r.name)] : [])])
const sdk = spawnSync(python, [join(web, 'tests', 'c2pa-sdk-check.py'), ...sdkPaths], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
const afterSources = await sources()
let sdkReport, sdkError = sdk.error?.message
try { sdkReport = JSON.parse(sdk.stdout) } catch { sdkError ??= 'Missing or invalid SDK JSON output' }
const report = { date: new Date().toISOString(), node: process.version, cache, sourceHashes: beforeSources, sourceUnchanged: JSON.stringify(beforeSources) === JSON.stringify(afterSources), results, sdk: { paths: sdkPaths, exitCode: sdk.status, error: sdkError, stderr: sdk.stderr, report: sdkReport } }
report.failures = failures(report)
await writeFile(join(cache, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (report.failures.length) process.exitCode = 1
}
const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--self-test') selfTest()
else await main(args)
