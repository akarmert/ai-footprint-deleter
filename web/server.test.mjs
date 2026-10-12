import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { createStaticServer } from './server.mjs';

let directory;
let server;
let port;

function send(url, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: url, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'static-server-'));
  const dist = path.join(directory, 'dist');
  await mkdir(path.join(dist, 'assets'), { recursive: true });
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Test</title>');
  await writeFile(path.join(dist, 'assets', 'worker.js'), 'self.onmessage = () => {};');
  await writeFile(path.join(dist, 'assets', 'style.css'), 'body {}');
  await writeFile(path.join(dist, 'assets', 'image.webp'), 'webp');
  await writeFile(path.join(dist, 'assets', 'module.wasm'), 'wasm');
  await writeFile(path.join(dist, 'assets', 'unknown.bin'), 'binary');
  await writeFile(path.join(directory, 'secret.txt'), 'private');
  await writeFile(path.join(dist, '.env'), 'private');
  server = createStaticServer({ distDir: dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test('health is independent of build files', async () => {
  const result = await send('/healthz');
  assert.equal(result.status, 200);
  assert.equal(result.body, 'ok\n');
  const isolated = createStaticServer({ distDir: path.join(directory, 'absent') });
  await new Promise(resolve => isolated.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${isolated.address().port}/healthz`);
    assert.equal(result.status, 200);
  } finally {
    isolated.closeAllConnections();
    await new Promise(resolve => isolated.close(resolve));
  }
});

test('root and extensionless SPA navigation serve the entry point', async () => {
  for (const route of ['/', '/review', '/review/local?tab=metadata']) {
    const result = await send(route);
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'], /text\/html/);
    assert.match(result.body, /<title>Test/);
  }
});

test('assets have actual MIME types and HEAD preserves metadata without body', async () => {
  for (const [file, mime] of [['worker.js', 'text/javascript'], ['style.css', 'text/css'], ['image.webp', 'image/webp'], ['module.wasm', 'application/wasm'], ['unknown.bin', 'application/octet-stream']]) {
    const get = await send(`/assets/${file}`);
    const head = await send(`/assets/${file}`, 'HEAD');
    assert.equal(get.status, 200);
    assert.ok(get.headers['content-type'].startsWith(mime));
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], get.headers['content-length']);
  }
  assert.equal((await send('/healthz', 'HEAD')).body, '');
});

test('security headers prohibit network connections and permit same-origin workers', async () => {
  for (const route of ['/', '/healthz', '/missing.js']) {
    const { headers } = await send(route);
    assert.match(headers['content-security-policy'], /connect-src 'none'/);
    assert.match(headers['content-security-policy'], /worker-src 'self'/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.equal(headers['cache-control'], 'no-store');
    assert.equal(headers['access-control-allow-origin'], undefined);
  }
});

test('missing assets, upload routes and private paths never return the SPA', async () => {
  for (const route of ['/missing.js', '/assets/missing', '/api/process', '/upload', '/uploads/file', '/.env', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/assets/%2e%2e/%2e%2e/secret.txt']) {
    const result = await send(route);
    assert.equal(result.status, 404, route);
    assert.equal(result.body, 'Not found\n');
    assert.ok(!result.body.includes(directory));
  }
});

test('malformed and platform-specific paths are rejected', async () => {
  for (const route of ['/%', '/%00', '/assets%5c..%5csecret.txt', '//host/path', '/C:%5csecret.txt']) {
    assert.equal((await send(route)).status, 400, route);
  }
});

test('all unsupported methods are rejected', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    const result = await send('/upload', method);
    assert.equal(result.status, 405, method);
    assert.equal(result.headers.allow, 'GET, HEAD');
    assert.equal(result.headers.connection, 'close');
  }
});

test('rejects uploads before their declared body arrives', async () => {
  await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/upload', method: 'POST', headers: { 'Content-Length': '1000000000' } }, res => {
      assert.equal(res.statusCode, 405);
      res.resume();
      res.on('end', () => { req.destroy(); resolve(); });
    });
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('Server waited for upload body')); });
    req.on('error', reject);
    req.flushHeaders();
  });
});

test('symlink files and directories cannot expose outside files', async t => {
  try {
    await symlink(path.join(directory, 'secret.txt'), path.join(directory, 'dist', 'link.txt'), 'file');
    await symlink(directory, path.join(directory, 'dist', 'linked'), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
      t.skip('OS does not grant symlink creation; run this check on Linux before release');
      return;
    }
    throw error;
  }
  for (const route of ['/link.txt', '/linked/secret.txt', '/linked/missing']) {
    const result = await send(route);
    assert.equal(result.status, 404);
    assert.equal(result.body, 'Not found\n');
  }
});
