// Run with Playwright browser_run_code against npm run build + npm start.
async page => {
  const context = await page.context().browser().newContext();
  page = await context.newPage();
  try {
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
    };
    // Optional AFC_SCREENSHOT_DIR: where to save the after-audit screenshots (skipped when unset).
    const screenshotDir = globalThis.process?.env?.AFC_SCREENSHOT_DIR?.replace(/[\\/]+$/, '');
    // The browser tool provides Playwright Library, not Playwright Test's expect.
    const toBeVisible = async locator => {
      await locator.waitFor({ state: 'visible' });
      assert(await locator.isVisible(), `Not visible: ${locator}`);
    };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('http://localhost:3000');
    const viewports = [];
    for (const width of [320, 360, 390, 700, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await toBeVisible(page.getByRole('heading', { level: 1 }));
      await toBeVisible(page.getByRole('button', { name: 'Dosya Seç', exact: true }));
      await toBeVisible(page.getByRole('contentinfo'));
      assert(
        (await page.getByRole('contentinfo').locator('xpath=ancestor::main').count()) === 0,
        'Footer is nested in main',
      );
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width}`);
      if (width < 700) {
        const menu = page.getByRole('button', { name: 'Menü', exact: true });
        await menu.click();
        await toBeVisible(page.getByRole('navigation'));
        await page.getByRole('navigation').getByRole('link').first().focus();
        await page.keyboard.press('Escape');
        assert(!(await page.getByRole('navigation').isVisible()), 'Escape left menu open');
        assert(await menu.evaluate(element => element === document.activeElement), 'Escape lost focus');
      }
      const before = await page.screenshot({ animations: 'disabled' });
      const after = await page.screenshot({ animations: 'disabled' });
      assert(before.equals(after), `Visual stability regression ${width}`);
      viewports.push({ width, visible: true, overflow: false, repeatedScreenshotEqual: true });
    }
    await page.setViewportSize({ width: 700, height: 900 });
    const atBreakpoint = await page
      .locator('#hero-title')
      .evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.setViewportSize({ width: 701, height: 900 });
    const afterBreakpoint = await page
      .locator('#hero-title')
      .evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert(Math.abs(atBreakpoint - afterBreakpoint) < 1, 'Hero type jumps at mobile breakpoint');
    await page.goto('http://localhost:3000');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Dosya analizine geç' });
    await toBeVisible(skip);
    assert(
      await skip.evaluate(element => element.getBoundingClientRect().top >= 0 && element === document.activeElement),
      'Skip link is offscreen or not first',
    );
    await page.keyboard.press('Enter');
    assert(
      await page.locator('#workspace').evaluate(element => element === document.activeElement),
      'Skip link did not focus workspace',
    );
    await page.getByRole('link', { name: 'Teknik sınırlamalar', exact: true }).click();
    await toBeVisible(page.locator('#technical-limits'));
    await page.getByText('Metadata nedir?', { exact: true }).click();
    await toBeVisible(
      page.getByText(
        'Bir dosyaya eklenmiş cihaz, tarih, konum, üretim aracı veya renk profili gibi bilgilerdir. Her dosya aynı bilgileri içermez.',
        { exact: true },
      ),
    );
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const text = new TextEncoder().encode('https://example.test/' + 'a'.repeat(400));
      const size = text.length + 2;
      const data = new DataTransfer();
      data.items.add(
        new File(
          [bytes.slice(0, 2), new Uint8Array([255, 254, size >> 8, size & 255]), text, bytes.slice(2)],
          'audit.jpg',
          { type: 'image/jpeg' },
        ),
      );
      const input = document.querySelector('#media');
      input.files = data.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await toBeVisible(page.getByText('Metadata taraması tamamlandı', { exact: true }));
    await page.locator('#advanced-tools > summary').click();
    assert((await page.locator('.category-filters button:disabled').count()) === 0, 'Empty category controls remain');
    assert(
      (await page.locator('.category-filters button').count()) === 3,
      'Expected only all, file and metadata filters',
    );
    assert(
      await page
        .locator('#advanced-tools .actions')
        .evaluate(element =>
          Boolean(
            element.compareDocumentPosition(document.querySelector('.metadata-results')) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        ),
      'Primary action follows the long results list',
    );
    await page.getByRole('button', { name: 'Tümünü Aç', exact: true }).click();
    const preview = page.locator('.result-fields pre').filter({ hasText: 'https://example.test/' });
    assert(
      (await preview.innerText()) === 'https://example.test/' + 'a'.repeat(400),
      'Long metadata value was truncated',
    );
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Result overflow ${width}`);
      assert(
        await preview.evaluate(
          element =>
            element.scrollWidth <= element.clientWidth + 1 && getComputedStyle(element).whiteSpace === 'pre-wrap',
        ),
        `Metadata cannot wrap ${width}`,
      );
    }
    await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Hak ve telif bilgileri için onay', exact: true });
    await toBeVisible(dialog);
    assert(
      await dialog.evaluate(element => element.contains(document.activeElement)),
      'Consent focus is outside dialog',
    );
    await page.keyboard.press('Escape');
    assert(
      await page
        .getByRole('button', { name: "Metadata'yı Temizle", exact: true })
        .evaluate(element => element === document.activeElement),
      'Consent did not restore focus',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://localhost:3000');
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/ui-audit-after-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/ui-audit-after-mobile.png`, fullPage: true });
    return {
      viewports,
      menuEscape: 'passed',
      skipFocus: 'passed',
      footerLandmark: 'passed',
      technicalLimits: 'passed',
      faq: 'passed',
      visibility: 'Playwright waitFor visible + isVisible; expect package not installed',
      screenshots: 'before/after captured; repeated unmasked frames equal',
    };
  } finally {
    await context.close();
  }
}
