async (page) => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  // A new context prevents init-script/Worker subclasses accumulating on repeated runs.
  const context = await page.context().browser().newContext({ acceptDownloads: true });
  page = await context.newPage();
  const requests = [], downloads = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  try {
    // Synthetic fixtures test container handling, not signatures or producer compatibility.
    // Capture the real Worker boundary; only delay and failure cases replace its behavior.
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.__testWorkerMode = '';
      window.__testCleanRequests = [];
      window.__testResults = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', event => {
            if (event.data.type === 'clean-footprints') {
              window.__testResults.push({ result: event.data.footprintResult, scan: event.data.output?.scan });
            }
          });
        }
        postMessage(message, ...rest) {
          if (message.type !== 'clean-footprints') return super.postMessage(message, ...rest);
          window.__testCleanRequests.push({ type: message.type, c2paConsent: message.c2paConsent, rightsConsent: message.rightsConsent });
          if (window.__testWorkerMode === 'delay') return setTimeout(() => super.postMessage(message, ...rest), 600);
          if (window.__testWorkerMode === 'failure') {
            return setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: {
              type: 'clean-footprints', footprintResult: { status: 'VERIFICATION_FAILED', reason: 'Injected boundary failure',
                plan: { metadataIds: [], removeC2pa: false, unsupported: [] },
                before: { evidence: [], state: 'INCOMPLETE', incomplete: true } }
            } })), 0);
          }
          return super.postMessage(message, ...rest);
        }
      };
    });
    await page.goto('http://localhost:3000');
    const remove = page.locator('#remove-footprints');
    const download = page.getByRole('button', { name: 'Download', exact: true });
    const noConsentUI = async () => {
      assert(await page.locator('dialog[open]').count() === 0, 'Direct action opened a dialog');
      assert(await page.locator('input[type=checkbox]').count() === 0, 'Direct flow contains a consent checkbox');
    };
    const upload = async (kind = 'combined', format = 'jpeg') => {
      await page.evaluate(async ({ kind, format }) => {
        const e = s => new TextEncoder().encode(s);
        const join = (...parts) => { const a = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { a.set(p, o); o += p.length; } return a; };
        const box = (t, p) => { const a = new Uint8Array(p.length + 8); new DataView(a.buffer).setUint32(0, a.length); a.set(e(t), 4); a.set(p, 8); return a; };
        const sb = (t, l, p) => box('jumb', join(box('jumd', join(e(t), new Uint8Array([0, 17, 0, 16, 128, 0, 0, 170, 0, 56, 155, 113, 3]), e(l + '\0'))), p));
        const store = sb('c2pa', 'c2pa', sb('c2ma', 'manifest', sb('c2cl', 'c2pa.claim', box('cbor', new Uint8Array([0xa0])))));
        const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${format}`));
        if (!blob || blob.type !== `image/${format}`) throw new Error(`Canvas cannot encode ${format}`);
        let data = new Uint8Array(await blob.arrayBuffer());
        if (format === 'jpeg') {
          // Reuse the original JPEG APP11 synthetic JUMBF and APP1 XMP generator.
          const segment = (marker, p) => { data = join(data.subarray(0, 2), new Uint8Array([255, marker, (p.length + 2) >> 8, (p.length + 2) & 255]), p, data.subarray(2)); };
          if (['combined', 'c2pa', 'external', 'malformed'].includes(kind)) segment(235, join(new Uint8Array([74, 80, 0, 1, 0, 0, 0, 1]), kind === 'malformed' ? store.subarray(0, 13) : store));
          if (['combined', 'external'].includes(kind)) {
            const target = kind === 'external' ? 'https://example.invalid/manifest' : 'self#jumbf=/c2pa/manifest/c2pa.claim';
            segment(225, e('http://ns.adobe.com/xap/1.0/\0<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description xmlns:d="http://purl.org/dc/terms/" xmlns:t="urn:unrelated" t:rights="Copyright retained" d:provenance="' + target + '"/></r:RDF>'));
          }
          if (['combined', 'rights'].includes(kind)) segment(254, e('AI parameters: ComfyUI prompt: synthetic test only'));
          if (kind === 'hint') segment(254, e('Copyright Alice. ComfyUI mentioned in an article.'));
        } else if (format === 'png') {
          const crc32 = bytes => {
            let crc = 0xffffffff;
            for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
            return (crc ^ 0xffffffff) >>> 0;
          };
          const payload = join(e('caBX'), store), chunk = new Uint8Array(store.length + 12);
          const view = new DataView(chunk.buffer); view.setUint32(0, store.length); chunk.set(payload, 4); view.setUint32(chunk.length - 4, crc32(payload));
          let offset = 8;
          while (offset + 12 <= data.length && new TextDecoder().decode(data.subarray(offset + 4, offset + 8)) !== 'IDAT') offset += new DataView(data.buffer).getUint32(offset) + 12;
          if (offset + 12 > data.length) throw new Error('Synthetic PNG missing IDAT');
          data = join(data.subarray(0, offset), chunk, data.subarray(offset));
        } else {
          const chunk = new Uint8Array(8 + store.length + (store.length & 1));
          chunk.set(e('C2PA')); new DataView(chunk.buffer).setUint32(4, store.length, true); chunk.set(store, 8);
          // Final padded C2PA chunk and little-endian RIFF container size.
          data = join(data, chunk); new DataView(data.buffer).setUint32(4, data.length - 8, true);
        }
        const extension = format === 'jpeg' ? 'jpg' : format;
        const dt = new DataTransfer(); dt.items.add(new File([data], `synthetic-${kind}.${extension}`, { type: `image/${format}` }));
        const input = document.querySelector('#media'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      }, { kind, format });
      await page.locator('#footprint-title').waitFor();
      await page.waitForFunction(() => !document.querySelector('.status-dot.busy'));
      assert(!await page.locator('#advanced-tools').evaluate(element => element.open), 'Advanced tools initially expanded');
      assert(!await download.isVisible(), 'Previous output survived source replacement');
      await noConsentUI();
    };
    const assertConsent = async expectedCount => {
      const messages = await page.evaluate(() => window.__testCleanRequests);
      assert(messages.length === expectedCount, `Expected ${expectedCount} clean requests, received ${messages.length}`);
      assert(messages.every(message => message.c2paConsent === true && message.rightsConsent === false), 'Direct request must grant only C2PA consent');
    };
    const directClean = async ({ partial = false, filename }) => {
      const before = downloads.length;
      const count = await page.evaluate(() => window.__testCleanRequests.length);
      await remove.click();
      await noConsentUI();
      await download.waitFor();
      await assertConsent(count + 1);
      assert(downloads.length === before, 'Output downloaded autonomously before Download click');
      assert(await remove.isDisabled(), 'Second cleaning enabled for verified output');
      assert(await page.locator('#footprint-title').textContent() === (partial ? 'Bazı kayıtlar kaldırıldı, bazıları korundu' : 'Desteklenen kaynak kayıtları kaldırıldı'), 'Unexpected footprint result');
      assert(await page.locator('.status strong').textContent() === 'Desteklenen kaynak kayıtları kaldırıldı', 'Verified scan status missing');
      assert(!await page.locator('#advanced-tools').evaluate(element => element.open), 'Cleaning expanded advanced tools');
      const downloading = page.waitForEvent('download'); await download.click(); const file = await downloading;
      assert(file.suggestedFilename() === filename, `Unexpected download filename: ${file.suggestedFilename()}`);
      assert(downloads.length === before + 1, 'Download click did not produce exactly one download');
    };

    const formats = [];
    for (const format of ['jpeg', 'png', 'webp']) {
      await upload('c2pa', format);
      assert(await remove.isEnabled(), `${format} embedded C2PA removal disabled`);
      assert(await page.locator('.status strong').textContent() === 'Tarama tamamlandı · Temizlemeye hazır', `${format} removable C2PA not ready`);
      assert(!await page.locator('.status').evaluate(element => element.classList.contains('has-warning')), `${format} removable C2PA shown as blocked`);
      await directClean({ filename: `synthetic-c2pa-removed.${format === 'jpeg' ? 'jpg' : format}` });
      formats.push(format);
    }
    await upload('combined');
    assert(await remove.isEnabled(), 'Combined C2PA/local XMP/rights metadata plan disabled');
    assert(await page.locator('.status strong').textContent() === 'Tarama tamamlandı · Temizlemeye hazır', 'Combined removable C2PA shown as blocked');
    await directClean({ partial: true, filename: 'synthetic-combined-removed.jpg' });
    assert(await page.locator('.verification').getByText(/Değiştirilen alan:/).isVisible(), 'Local XMP edit missing from direct result');
    const retained = await page.evaluate(() => window.__testResults.at(-1));
    assert(retained.result.status === 'PARTIALLY_REMOVED', 'Rights-protected metadata did not yield partial result');
    assert(retained.result.after.evidence.length > 0, 'Output lost retained metadata evidence');
    assert(retained.scan.records.some(record => record.preview.includes('Copyright retained')), 'Unrelated XMP rights text removed');
    assert(retained.scan.records.some(record => record.preview.includes('AI parameters: ComfyUI prompt: synthetic test only') && record.requiresRightsConsent), 'Dedicated rights-required metadata removed');
    assert(!retained.scan.records.some(record => record.preview.includes('self#jumbf=')), 'Local XMP pointer remained after C2PA removal');
    assert(await page.locator('.footprint-summary').getByText(/metadata ipucu.*kaldı/).isVisible(), 'Remaining evidence not displayed');
    await page.locator('#advanced-tools > summary').click();
    const mode = page.getByRole('button', { name: 'Kapsamlı Temizlik', exact: true });
    assert(await mode.isDisabled(), 'Mode can discard unified output');
    await mode.evaluate(element => element.click());
    assert(await download.isVisible(), 'Disabled mode discarded unified output');
    assert(await page.getByRole('heading', { name: 'Çıktıda kalan metadata kayıtları', exact: true }).isVisible(), 'Retained records labeled as source');
    assert(!await page.locator('#advanced-tools').getByText(/All performed stages verified/).isVisible(), 'Raw technical result reason exposed');
    const viewports = [];
    for (const width of [320, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width}`);
      viewports.push({ width, overflow: false });
    }
    await upload('none'); assert(await remove.isDisabled(), 'No-record removal enabled');
    await upload('hint'); assert(await remove.isDisabled(), 'Mixed hint removal enabled');
    assert(await page.locator('#footprint-title').textContent() === 'AI ile ilişkili metadata ipuçları bulundu', 'Hint heading replaced by unsupported warning');
    await upload('rights'); assert(await remove.isDisabled(), 'Rights-only dedicated metadata enabled direct removal');
    assert(await page.getByText(/Bu kayıtlar için Teknik Ayrıntılar ve Gelişmiş Araçlar/).isVisible(), 'Rights-only preservation guidance missing');
    await page.evaluate(() => {
      const dt = new DataTransfer(); dt.items.add(new File(['not a png'], 'invalid.png', { type: 'image/png' }));
      const input = document.querySelector('#media'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('alert').waitFor();
    assert(await page.locator('.status strong').textContent() === 'İşlem tamamlanamadı', 'Selection error mislabeled as cleaning failure');
    for (const kind of ['external', 'malformed']) {
      await upload(kind);
      assert(await remove.isDisabled(), `${kind} provenance not blocked`);
      assert(await page.locator('.status strong').textContent() === 'Kaynak kaydı bulundu · Kaldırma desteklenmiyor', `${kind} unsupported status missing`);
      assert(await page.locator('.status').evaluate(element => element.classList.contains('has-warning')), `${kind} scan shown as green`);
      const count = await page.evaluate(() => window.__testCleanRequests.length);
      await remove.evaluate(element => element.click());
      await assertConsent(count);
      assert(!await download.isVisible(), `${kind} unsupported source published success`);
      assert(await page.locator('#footprint-title').textContent() !== 'Desteklenen kaynak kayıtları kaldırıldı', `${kind} source shown as success`);
    }
    // Delay the real Worker operation to test duplicate submission and stale results.
    await upload('c2pa');
    await page.evaluate(() => { window.__testWorkerMode = 'delay'; window.__testCleanRequests = []; });
    const beforeDelayed = downloads.length;
    await remove.evaluate(element => { element.click(); element.click(); });
    await assertConsent(1);
    assert(await page.locator('.status strong').textContent() === 'AI kaynak kayıtları temizleniyor...', 'Busy cleaning status missing');
    await noConsentUI();
    await upload('none');
    await page.waitForTimeout(850);
    assert(!await download.isVisible(), 'Stale delayed output survived source replacement');
    assert(downloads.length === beforeDelayed, 'Source replacement downloaded stale output');
    await upload('c2pa'); await remove.click();
    await page.getByRole('button', { name: 'İptal et', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.status-dot.busy'));
    await page.waitForTimeout(850);
    assert(!await download.isVisible(), 'Cancelled output published');
    assert(downloads.length === beforeDelayed, 'Cancellation downloaded output');
    await assertConsent(2);
    await upload('c2pa'); await page.evaluate(() => { window.__testWorkerMode = 'failure'; });
    await remove.click();
    await page.getByRole('heading', { name: 'Temizleme doğrulanamadı', exact: true }).waitFor();
    await noConsentUI();
    await assertConsent(3);
    assert(!await download.isVisible(), 'VERIFICATION_FAILED permits download');
    assert(downloads.length === beforeDelayed, 'Failed verification downloaded output');
    assert(await page.locator('.status').evaluate(element => element.classList.contains('has-warning')), 'Failed verification shown as green');
    assert(await page.locator('.status strong').textContent() === 'Temizleme tamamlanamadı', 'Failed status missing');
    await page.locator('#advanced-tools > summary').click();
    assert(!await page.locator('#advanced-tools').getByText('Injected boundary failure', { exact: false }).isVisible(), 'Raw failure reason exposed');
    assert(await page.getByRole('button', { name: 'Kapsamlı Temizlik', exact: true }).isDisabled(), 'Mode can erase failed result');
    assert(requests.every(request => request.method === 'GET' && request.url.startsWith('http://localhost:3000/')), 'Unexpected media/network request');
    return { synthetic: true, formats, directConsent: true, manualDownload: true, retainedRights: true, remainingEvidence: true, externalBlocked: true, malformedBlocked: true, rightsOnlyDisabled: true, duplicateProtected: true, sourceReplacement: true, cancellation: true, failureClosed: true, viewports, requests: requests.length, downloads: downloads.length };
  } finally {
    await context.close();
  }
}
