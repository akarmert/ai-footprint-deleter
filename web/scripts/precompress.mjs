// Writes .br and .gz next to each text asset in dist once at build time, so the server never
// compresses at request time.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = path.resolve(process.argv[2] ?? 'dist');
const compressible = /\.(?:html|js|mjs|css|svg|json|txt|webmanifest)$/;

for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !compressible.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const data = await readFile(file);
  if (data.length < 1024) continue;
  const br = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  });
  const gz = gzipSync(data, { level: 9 });
  if (br.length < data.length) await writeFile(`${file}.br`, br);
  if (gz.length < data.length) await writeFile(`${file}.gz`, gz);
}
