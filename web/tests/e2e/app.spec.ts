import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { aiJpeg, fixture } from './files.ts';
import { scanImage, cleanImage } from '../../src/engine.ts';

// Current-UI browser tests: real production build, real Workers, files given as buffers.

async function choose(page: Page, name: string, bytes: Uint8Array, mimeType = 'image/jpeg') {
  await page.locator('#media').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
  await expect(page.locator('#footprint-title')).not.toHaveText('Taranıyor…');
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
  await expect(page.locator('section.verification h3')).toHaveText('Metadata kaldırıldı');
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
  await expect(page.locator('section.verification h3')).toHaveText('Metadata kaldırıldı');
  await expect(page.locator('section.verification')).toContainText('Korunanlar:');
});

test('details: records are listed and no other cleaning control or dialog exists', async ({ page }) => {
  await choose(page, 'gemini.jpg', aiJpeg('Gemini', 'Google C2PA Core Generator Library'));
  await expect(page.locator('.file-details .ai-tool')).toContainText('Google Gemini');
  await openAdvanced(page);
  await expect(page.locator('#advanced-tools .metadata-results')).toBeVisible();
  await expect(page.locator('#advanced-tools')).toContainText('Kayıtlar ve uygulanan kural');
  await expect(page.getByRole('button', { name: 'Yalnız C2PA’yı Kaldır' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Metadata'yı Temizle" })).toHaveCount(0);
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.locator('#footprint-result').getByRole('button', { name: "Tüm Metadata'yı Kaldır" })).toHaveCount(
    1,
  );
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

test('video: MP4 is scanned by the video Worker, offers the same one-click removal and can be cleared', async ({
  page,
}, testInfo) => {
  const path = testInfo.outputPath('clip.mp4');
  const made = spawnSync(
    'ffmpeg',
    [
      ...['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=10'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac'],
      ...['-metadata', 'title=E2E', '-metadata', 'copyright=Test', '-movflags', '+faststart', '-y', path],
    ],
    { encoding: 'utf8' },
  );
  test.skip(made.error !== undefined || made.status !== 0, 'ffmpeg (libx264) is not available');
  await page.locator('#media').setInputFiles(path);
  await expect(page.locator('#inspection-title')).toHaveText('Analiz sonucu');
  await expect(page.locator('#footprint-result [role=status] strong').first()).toHaveText('Tarama tamamlandı');
  await expect(page.locator('#remove-all-metadata')).toBeEnabled();
  await expect(page.locator('#all-metadata-scope-note')).toContainText('görüntü ve ses verisine dokunulmaz');
  await page.getByRole('button', { name: 'Seçimi kaldır' }).click();
  await expect(page.locator('.file-details')).toHaveCount(0);
});
