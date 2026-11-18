import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { aiJpeg, fixture } from './files.ts';
import { scanImage, cleanImage } from '../../src/engine.ts';

// Current-UI browser tests: real production build, real Workers, files given as buffers.

async function choose(page: Page, name: string, bytes: Uint8Array, mimeType = 'image/jpeg') {
  await page.locator('#media').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
  await expect(page.locator('#footprint-title')).not.toHaveText('Metadata analiz ediliyor…');
}
async function openAdvanced(page: Page) {
  const tools = page.locator('#advanced-tools');
  if (!(await tools.evaluate(el => (el as HTMLDetailsElement).open))) await tools.locator(':scope > summary').click();
}

test.beforeEach(async ({ page }) => {
  // Privacy boundary: the page may only talk to its own origin.
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    expect(url.origin, `unexpected network request to ${url.href}`).toBe('http://localhost:3000');
  });
  await page.goto('/');
});

test('AI image: tool card, heading, one-click removal and a verified download', async ({ page }) => {
  const input = aiJpeg();
  await choose(page, 'chatgpt.jpg', input);
  await expect(page.locator('.file-details .ai-tool')).toContainText('AI aracı: OpenAI ChatGPT');
  await expect(page.locator('#footprint-title')).toHaveText('AI METADATA BULUNDU');
  await expect(page.locator('#footprint-result .actions').first().getByRole('button')).toHaveText([
    "Tüm Metadata'yı Kaldır",
  ]);
  await page.locator('#remove-all-metadata').click();
  await expect(page.locator('section.verification h3')).toHaveText('Bütün kaldırılabilir metadata kaldırıldı');
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('chatgpt-removed.jpg');
  const output = new Uint8Array(await readFile((await download.path())!));
  const scan = scanImage(output);
  expect(scan.c2pa).toBe('not-detected-not-guaranteed');
  expect(scan.records.map(r => r.kind)).not.toContain('EXIF');
  expect((await cleanImage(output, [], false)).payloadHash).toBe(
    (await cleanImage(fixture('image-1.jpg'), [], false)).payloadHash,
  );
});

test('ordinary photo with EXIF: "METADATA BULUNDU" and EXIF removed in one click', async ({ page }) => {
  await choose(page, 'telefon.jpg', fixture('image-1.jpg'));
  await expect(page.locator('#footprint-title')).toHaveText('METADATA BULUNDU');
  await expect(page.locator('.file-details .ai-tool')).toContainText('Dosyada belirtilmemiş');
  await page.locator('#remove-all-metadata').click();
  await expect(page.locator('section.verification h3')).toHaveText('Bütün kaldırılabilir metadata kaldırıldı');
  await expect(page.locator('section.verification')).toContainText('Bilerek korunanlar:');
});

test('advanced: C2PA-only removal opens no dialog', async ({ page }) => {
  await choose(page, 'gemini.jpg', aiJpeg('Gemini', 'Google C2PA Core Generator Library'));
  await expect(page.locator('.file-details .ai-tool')).toContainText('Google Gemini');
  await openAdvanced(page);
  await expect(page.locator('#c2pa-scope-note')).toBeVisible();
  await page.getByRole('button', { name: 'Yalnız C2PA’yı Kaldır' }).click();
  await expect(page.locator('section.verification h3')).toHaveText('Yalnız gömülü C2PA deposu kaldırıldı');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});

test('advanced: rights-consent cleaning uses the dialog; cancel restores focus', async ({ page }) => {
  await choose(page, 'exif.jpg', fixture('image-1.jpg'));
  await openAdvanced(page);
  const clean = page.getByRole('button', { name: "Metadata'yı Temizle" });
  await clean.click();
  const dialog = page.getByRole('dialog', { name: 'Hak ve telif bilgileri için onay' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(dialog).toBeHidden();
  await expect(clean).toBeFocused();
  await clean.click();
  await dialog.getByRole('button', { name: 'Yetkim var, temizle' }).click();
  await expect(page.locator('section.verification h3')).toHaveText('Temizlik tamamlandı');
});

test('unreadable file and clearing the selection', async ({ page }) => {
  await choose(page, 'bozuk.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0, 0, 0, 0]));
  await expect(page.locator('#footprint-title')).toHaveText('METADATA ANALİZİ TAMAMLANAMADI');
  await page.getByRole('button', { name: 'Seçimi kaldır' }).click();
  await expect(page.locator('.file-details')).toHaveCount(0);
});

test('narrow screen: no horizontal overflow with results open', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await choose(page, 'chatgpt.jpg', aiJpeg());
  await openAdvanced(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
