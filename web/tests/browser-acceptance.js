// Run via Playwright browser_run_code with this file after npm run build && npm start.
// This script uses the supplied local page; it installs no browser/runtime dependencies.
async (page) => {
  // Adjust this local fixture path when running in a different checkout.
  const root = 'C:/_projectsmert/ai-footprint-deleter/web/tests/fixtures';
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('http://localhost:3000');
  const requests = [];
  const listener = request => requests.push({ url: request.url(), method: request.method(), body: request.postData() });
  page.on('request', listener);
  const results = [];
  for (const ext of ['jpg', 'png', 'webp']) {
    await page.locator('input[type=file]').setInputFiles(`${root}/image-1.${ext}`);
    await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
    await page.locator('.consent input').check();
    const records = page.locator('.record input:not(:disabled)');
    for (let i = 0; i < await records.count(); i++) await records.nth(i).check();
    await page.getByRole('button', { name: /Seçilenleri temizle/ }).click();
    await page.getByText('Temizlendi · Çıktı doğrulandı', { exact: true }).waitFor();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'İndir', exact: true }).click();
    results.push({ ext, name: (await waiting).suggestedFilename(), checks: await page.locator('.verification').innerText() });
    await page.locator('.consent input').uncheck();
    assert(await page.getByRole('button', { name: 'İndir', exact: true }).isDisabled(), 'Consent change retained output');
  }
  page.off('request', listener);
  assert(requests.every(r => r.method === 'GET' && r.body === null && /\/assets\/inspect.worker-[\w-]+\.js$/.test(r.url)), 'Unexpected media/network request');
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }));
  assert(Object.values(storage).every(count => count === 0), 'Unexpected persistent storage');

  // Real worker with delayed delivery exposes source-change/cancel races deterministically.
  await page.reload();
  await page.evaluate(() => {
    const Actual = Worker;
    window.testWorkers = [];
    window.Worker = class {
      constructor(url, options) {
        this.real = new Actual(url, options); window.testWorkers.push(this);
        this.real.onmessage = event => setTimeout(() => this.onmessage?.(event), 250);
      }
      postMessage(message) { this.real.postMessage(message); }
      terminate() { this.real.terminate(); this.terminated = true; }
    };
  });
  await page.locator('input[type=file]').setInputFiles(`${root}/image-1.png`);
  await page.getByRole('button', { name: 'İptal et', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.locator('input[type=file]').setInputFiles(`${root}/image-1.png`);
  await page.locator('input[type=file]').setInputFiles(`${root}/image-1.webp`);
  await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
  assert(await page.locator('.filename').innerText() === 'image-1.webp', 'Stale scan replaced current file');
  await page.locator('.consent input').check();
  await page.locator('.record input:not(:disabled)').check();
  await page.getByRole('button', { name: /Seçilenleri temizle/ }).click();
  await page.getByRole('button', { name: 'İptal et', exact: true }).click();
  assert(await page.getByRole('button', { name: 'İndir', exact: true }).isDisabled(), 'Canceled output downloadable');
  assert(await page.evaluate(() => window.testWorkers.every(worker => worker.terminated)), 'Worker not terminated');
  for (const mode of ['timeout', 'onerror', 'onmessageerror']) {
    await page.reload();
    await page.evaluate(mode => {
      window.testWorkers = [];
      window.Worker = class { constructor() { window.testWorkers.push(this); } postMessage() {} terminate() { this.terminated = true; } };
      if (mode === 'timeout') {
        const original = setTimeout;
        window.setTimeout = (callback, ms, ...args) => original(callback, ms === 120000 ? 20 : ms, ...args);
      }
    }, mode);
    await page.locator('input[type=file]').setInputFiles(`${root}/image-1.png`);
    if (mode !== 'timeout') await page.evaluate(mode => window.testWorkers[0][mode](), mode);
    await page.getByRole('alert').waitFor();
    assert(await page.getByRole('button', { name: 'İndir', exact: true }).isDisabled(), `${mode}: download enabled`);
    assert(await page.evaluate(() => window.testWorkers[0].terminated), `${mode}: worker active`);
  }
  // Inject a hashing failure inside the ACTUAL emitted worker. No output must escape.
  await page.reload();
  await page.route('**/assets/inspect.worker-*.js', async route => {
    const response = await route.fetch();
    const script = await response.text();
    await route.fulfill({ response, body: "Object.defineProperty(crypto.subtle,'digest',{value:async()=>{throw new Error('Kontrollü hash hatası')}});\n" + script });
  });
  await page.locator('input[type=file]').setInputFiles(`${root}/image-1.png`);
  await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
  await page.locator('.consent input').check();
  await page.locator('.record input:not(:disabled)').first().check();
  await page.getByRole('button', { name: /Seçilenleri temizle/ }).click();
  await page.getByText('Kontrollü hash hatası', { exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'İndir', exact: true }).isDisabled(), 'Hash failure exposed download');
  assert(await page.locator('.verification').count() === 0, 'Hash failure exposed verified result');
  await page.unroute('**/assets/inspect.worker-*.js');
  await page.reload();
  return { results, requests, storage, lifecycle: 'cancel/replace/consent/timeout/error/messageerror and actual worker hash-failure passed' };
}
