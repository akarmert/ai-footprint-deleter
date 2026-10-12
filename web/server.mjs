import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const types = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.avif': 'image/avif',
}));
const headers = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self'; connect-src 'none'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cache-Control': 'no-store',
};

async function openAsset(root, segments) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || await realpath(root) !== root) return null;
  let candidate = root;
  for (const [index, segment] of segments.entries()) {
    candidate = path.join(candidate, segment);
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || (index === segments.length - 1 ? !info.isFile() : !info.isDirectory())) return null;
  }
  if (await realpath(candidate) !== candidate) return null;
  const handle = await open(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const info = await handle.stat();
  if (!info.isFile()) {
    await handle.close();
    return null;
  }
  return { handle, size: info.size, candidate };
}

export function createStaticServer({ distDir = defaultRoot } = {}) {
  const root = path.resolve(distDir);
  const server = createServer(async (req, res) => {
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    const reply = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Connection', 'close');
      reply(405, 'Method not allowed\n');
      return;
    }
    let pathname;
    try {
      const raw = req.url ?? '';
      if (!raw.startsWith('/') || raw.startsWith('//')) throw new Error();
      pathname = decodeURIComponent(raw.split('?')[0]);
      if (/[\\\x00-\x1f\x7f:#?]/u.test(pathname)) throw new Error();
    } catch {
      reply(400, 'Bad request\n');
      return;
    }
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(segment => segment.startsWith('.') || segment.endsWith('.') || segment.endsWith(' ') || segment.includes(':'))) {
      reply(404, 'Not found\n');
      return;
    }
    if (pathname === '/healthz') {
      reply(200, 'ok\n');
      return;
    }
    let asset;
    try {
      asset = await openAsset(root, segments.length ? segments : ['index.html']);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(error.code)) {
        reply(500, 'Internal error\n');
        return;
      }
      if (error.code === 'ENOENT' && segments.every(segment => !segment.includes('.')) && !['api', 'upload', 'uploads', 'assets'].includes(segments[0])) {
        try { asset = await openAsset(root, ['index.html']); } catch { asset = null; }
      }
    }
    if (!asset) {
      reply(404, 'Not found\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': types.get(path.extname(asset.candidate).toLowerCase()) ?? 'application/octet-stream', 'Content-Length': asset.size });
    if (req.method === 'HEAD') {
      await asset.handle.close();
      res.end();
      return;
    }
    const stream = asset.handle.createReadStream();
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const server = createStaticServer();
  server.listen(port, '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    server.close();
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
