// Run with Playwright browser_run_code after production build + npm start.
// Generate the small real fixture first (ffmpeg installed locally):
// ffmpeg -f lavfi -i testsrc2=size=96x64:rate=10 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 1 -c:v libx264 -c:a aac -metadata title=Phase3 -movflags +faststart phase3-browser.mp4
// Adjust fixture path below. Native OS picker is replaced by a REAL OPFS handle;
// this exercises structured cloning + actual Worker/disk operations, NOT native permission UI.
async page => {
  const fixture = 'C:/Users/Mert/AppData/Local/Temp/kilo/phase3-browser.mp4';
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.goto('http://localhost:3000');
  const requests = [];
  const listener = req => requests.push({ url: req.url(), method: req.method(), body: req.postData() });
  page.on('request', listener);
  await page.locator('#media').setInputFiles(fixture);
  await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    window.showSaveFilePicker = async () => root.getFileHandle('afc-acceptance-output.mp4', { create: true });
  });
  await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).click();
  await page.getByRole('button', { name: 'Yetkim var, temizle', exact: true }).click();
  await page.getByText('Doğrulandı · Diske kaydedildi', { exact: true }).waitFor();
  const disk = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle('afc-acceptance-output.mp4')).getFile();
    const names = []; for await (const name of root.keys()) names.push(name);
    await root.removeEntry('afc-acceptance-output.mp4');
    return { size: file.size, stagingLeft: names.filter(n => n.startsWith('afc-video-')) };
  });
  assert(disk.size > 0 && !disk.stagingLeft.length, 'Output missing or staging leaked');
  assert(await page.getByRole('button', { name: 'Temizlenmiş Dosyayı İndir', exact: true }).count() === 0, 'Video offered Blob download');
  page.off('request', listener);
  assert(requests.every(r => r.method === 'GET' && r.body === null && /\/assets\/video.worker-[\w-]+\.js$/.test(r.url)), 'Unexpected network request');
  // A nonresponding Worker must be bounded by the cancellation watchdog.
  await page.reload();
  await page.evaluate(() => {
    window.Worker = class { postMessage() {} terminate() { window.testVideoTerminated = true; } };
    const real = setTimeout;
    window.setTimeout = (fn, ms, ...args) => real(fn, ms === 120000 || ms === 10000 ? 30 : ms, ...args);
  });
  await page.locator('#media').setInputFiles(fixture);
  await page.getByText('Disk sonucu belirsiz; hedefi ve geçici site dosyalarını kontrol edin.', { exact: true }).waitFor();
  assert(await page.evaluate(() => window.testVideoTerminated), 'Stalled worker was not terminated');
  assert(await page.locator('#media').isEnabled(), 'Source remained locked after watchdog');
  await page.reload();
  // Never-terminal commit: explicit uncertain-result recovery ignores late responses.
  await page.evaluate(() => {
    window.testVideoWorkers = [];
    window.Worker = class {
      constructor() { window.testVideoWorkers.push(this); }
      postMessage(message) {
        if (message.type === 'scan') this.onmessage({ data: { type: 'scan', scan: {
          format: 'MP4', width: 96, height: 64, alpha: false, orientation: 1,
          records: [{ id: 'time', kind: 'time', bytes: 8, status: 'cleanable', reason: 'test' }], notes: [], cleaningBlocked: false,
        } } });
        if (message.type === 'clean') this.onmessage({ data: { type: 'committing' } });
      }
      terminate() { this.terminated = true; }
    };
    window.showSaveFilePicker = async () => ({});
    const real = setTimeout;
    window.setTimeout = (fn, ms, ...args) => real(fn, ms === 120000 ? 40 : ms, ...args);
  });
  await page.locator('#media').setInputFiles(fixture);
  await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).click();
  await page.getByRole('button', { name: 'Belirsiz sonucu kabul et ve seçimi sıfırla' }).click();
  await page.evaluate(() => window.testVideoWorkers[0].onmessage({ data: { type: 'video-done', scan: {}, removed: 1 } }));
  assert(await page.locator('#media').isEnabled(), 'Recovery did not unlock source');
  assert(await page.getByText('Doğrulandı · Diske kaydedildi', { exact: true }).count() === 0, 'Late old success changed recovered UI');
  assert(await page.evaluate(() => window.testVideoWorkers[0].terminated), 'Recovery did not retire old Worker');
  await page.reload();
  return { disk, requests, watchdog: 'passed', commitRecovery: 'passed', nativePickerTested: false, real1GBTested: false };
}
