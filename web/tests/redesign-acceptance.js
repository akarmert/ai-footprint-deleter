// Run with Playwright browser_run_code after npm run build and npm start.
async page => {
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  try {
    const assert = (value, message) => {
      if (!value) throw new Error(message);
    };
    await page.goto('http://localhost:3000');
    const violations = [],
      requests = [];
    page.on('request', request =>
      requests.push({ url: request.url(), method: request.method(), body: request.postData() }),
    );
    await page.evaluate(() => {
      window.cspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
    });
    assert((await page.locator('.inspection-panel').count()) === 0, 'Empty page exposes analysis');
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Empty overflow ${width}`);
      if (width < 700) {
        const menu = page.getByRole('button', { name: 'Menü', exact: true });
        await menu.click();
        assert((await menu.getAttribute('aria-expanded')) === 'true', 'Mobile menu did not expand');
        await page.locator('#site-nav').getByRole('link', { name: 'Dosya Analiz Et' }).click();
        assert((await menu.getAttribute('aria-expanded')) === 'false', 'Mobile menu did not close');
      }
    }
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const data = new DataTransfer();
      data.items.add(
        new File(
          [bytes.slice(0, 2), new Uint8Array([255, 254, 0, 7, 104, 101, 108, 108, 111]), bytes.slice(2)],
          'long-'.repeat(40) + '.jpg',
          { type: 'image/jpeg' },
        ),
      );
      window.dropData = data;
    });
    await page
      .locator('.dropzone')
      .dispatchEvent('dragover', { dataTransfer: await page.evaluateHandle(() => window.dropData) });
    assert(
      await page.locator('.dropzone').evaluate(element => element.classList.contains('dragging')),
      'Drag highlight missing',
    );
    await page
      .locator('.dropzone')
      .dispatchEvent('drop', { dataTransfer: await page.evaluateHandle(() => window.dropData) });
    await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
    assert(
      !(await page.locator('#advanced-tools').evaluate(element => element.open)),
      'Image advanced tools open by default',
    );
    await page.locator('#advanced-tools > summary').click();
    assert(
      await page
        .locator('.summary-counts')
        .first()
        .innerText()
        .then(text => text.includes('Temizlenebilir')),
      'Real summary missing',
    );
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Long file overflow ${width}`,
      );
    }
    await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).click();
    await page.getByRole('button', { name: 'Vazgeç', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert((await page.locator('dialog[open]').count()) === 0, 'Escape did not dismiss consent');
    assert((await page.locator('.verification').count()) === 0, 'Escape created output');
    await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).click();
    await page.getByRole('button', { name: 'Yetkim var, temizle', exact: true }).click();
    await page.getByText('Temizlendi · Çıktı doğrulandı', { exact: true }).waitFor();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(['not a png'], 'invalid.png', { type: 'image/png' }));
      const input = document.querySelector('#media');
      input.files = data.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.getByRole('alert').waitFor();
    assert((await page.locator('.verification').count()) === 0, 'Invalid replacement retained old success');
    assert(
      (await page.getByRole('button', { name: 'Temizlenmiş Dosyayı İndir' }).count()) === 0,
      'Invalid source exposed download',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'auto'),
      'Reduced motion ignored',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    violations.push(...(await page.evaluate(() => window.cspViolations)));
    assert(violations.length === 0, `CSP violations: ${violations}`);
    assert(
      requests.every(
        request =>
          request.method === 'GET' && request.body === null && /\/assets\/inspect.worker-[\w-]+\.js$/.test(request.url),
      ),
      'Unexpected request during file workflow',
    );
    return {
      dragDrop: 'passed',
      longName: 'passed',
      menu: 'passed',
      consentEscape: 'passed',
      invalidReplacement: 'passed',
      reducedMotion: 'passed',
      viewports: [360, 390, 768, 1280],
      violations,
      requests,
    };
  } finally {
    await context.close();
  }
}
