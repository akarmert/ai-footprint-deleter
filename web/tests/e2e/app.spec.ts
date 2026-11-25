import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { aiJpeg, fixture } from './files.ts';
import { scanImage, cleanImage, isRemovable } from '../../src/engine.ts';
import { scanVideo, verifyVideo } from '../../src/video.ts';

// Current-UI browser tests: real production build, real Workers, files given as buffers.

async function choose(page: Page, name: string, bytes: Uint8Array, mimeType = 'image/jpeg') {
  await page.locator('#media').setInputFiles({ name, mimeType, buffer: Buffer.from(bytes) });
  await expect(page.locator('#footprint-title')).not.toHaveText('Taranıyor…');
}
async function openAdvanced(page: Page) {
  const tools = page.locator('#advanced-tools');
  if (!(await tools.evaluate(el => (el as HTMLDetailsElement).open))) await tools.locator(':scope > summary').click();
}

const origin = process.env.AFC_BASE_URL ?? 'http://localhost:3000';

test.beforeEach(async ({ page }) => {
  // Privacy boundary: the page may only talk to its own origin.
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    expect(url.origin, `unexpected network request to ${url.href}`).toBe(origin);
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
  expect((await cleanImage(output, [])).payloadHash).toBe((await cleanImage(fixture('image-1.jpg'), [])).payloadHash);
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

// Video tests need ffmpeg (libx264); the video Worker and File System Access are real, only the native save
// dialog is replaced by an OPFS file handle (a native picker cannot be driven by Playwright).
function makeClip(path: string) {
  return spawnSync(
    'ffmpeg',
    [
      ...['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=96x64:rate=10'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac'],
      ...['-metadata', 'title=E2E', '-metadata', 'copyright=Test', '-movflags', '+faststart', '-y', path],
    ],
    { encoding: 'utf8' },
  );
}

test('video: MP4 is scanned by the video Worker, offers the same one-click removal and can be cleared', async ({
  page,
}, testInfo) => {
  const path = testInfo.outputPath('clip.mp4');
  const made = makeClip(path);
  test.skip(made.error !== undefined || made.status !== 0, 'ffmpeg (libx264) is not available');
  await page.locator('#media').setInputFiles(path);
  await expect(page.locator('#inspection-title')).toHaveText('Analiz sonucu');
  await expect(page.locator('#footprint-result [role=status] strong').first()).toHaveText('Tarama tamamlandı');
  await expect(page.locator('#remove-all-metadata')).toBeEnabled();
  await expect(page.locator('#all-metadata-scope-note')).toContainText('görüntü ve ses verisine dokunulmaz');
  await page.getByRole('button', { name: 'Seçimi kaldır' }).click();
  await expect(page.locator('.file-details')).toHaveCount(0);
});

test('video: end to end — save target, removal, write to disk and re-verification of the saved file', async ({
  page,
}, testInfo) => {
  const path = testInfo.outputPath('clip.mp4');
  const made = makeClip(path);
  test.skip(made.error !== undefined || made.status !== 0, 'ffmpeg (libx264) is not available');
  // Stand-in for showSaveFilePicker: the app still receives a real FileSystemFileHandle with createWritable().
  await page.evaluate(() => {
    const w = window as unknown as {
      __picked: string[];
      showSaveFilePicker: (o: { suggestedName: string }) => unknown;
    };
    w.__picked = [];
    w.showSaveFilePicker = async ({ suggestedName }) => {
      w.__picked.push(suggestedName);
      return (await navigator.storage.getDirectory()).getFileHandle('e2e-saved-' + suggestedName, { create: true });
    };
  });
  await page.locator('#media').setInputFiles(path);
  await expect(page.locator('#footprint-result [role=status] strong').first()).toHaveText('Tarama tamamlandı');
  await page.locator('#remove-all-metadata').click();
  await expect(page.locator('.verification')).toContainText('seçtiğin konuma kaydedildi', { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __picked: string[] }).__picked)).toEqual([
    'clip-removed.mp4',
  ]);

  // Read the saved file back from disk and verify it independently of the page's own check.
  const savedBase64 = await page.evaluate(async () => {
    const file = await (
      await (await navigator.storage.getDirectory()).getFileHandle('e2e-saved-clip-removed.mp4')
    ).getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  const saved = new Uint8Array(Buffer.from(savedBase64, 'base64'));
  const original = new Uint8Array(await readFile(path));
  expect(saved.length).toBe(original.length);

  const before = await scanVideo(new Blob([original]), 'MP4');
  const ids = before.records.filter(isRemovable).map(r => r.id);
  expect(ids.length).toBeGreaterThan(0);
  await verifyVideo(new Blob([original]), new Blob([saved]), before, ids);
  const after = await scanVideo(new Blob([saved]), 'MP4');
  expect(after.records.filter(isRemovable)).toHaveLength(0);

  // The saved file still decodes and no longer carries the metadata the source had.
  const savedPath = testInfo.outputPath('saved.mp4');
  await writeFile(savedPath, saved);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', savedPath, '-f', 'null', '-'], { encoding: 'utf8' });
  expect(decode.status, decode.stderr).toBe(0);
  const tags = spawnSync('ffmpeg', ['-v', 'error', '-i', savedPath, '-f', 'ffmetadata', '-'], { encoding: 'utf8' });
  expect(tags.stdout).not.toContain('title=E2E');
  expect(tags.stdout).not.toContain('copyright=Test');
});

test('video: cancelling the save dialog writes nothing and keeps the file selectable', async ({ page }, testInfo) => {
  const path = testInfo.outputPath('clip.mp4');
  const made = makeClip(path);
  test.skip(made.error !== undefined || made.status !== 0, 'ffmpeg (libx264) is not available');
  await page.evaluate(() => {
    (window as unknown as { showSaveFilePicker: () => Promise<never> }).showSaveFilePicker = () =>
      Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
  });
  await page.locator('#media').setInputFiles(path);
  await expect(page.locator('#footprint-result [role=status] strong').first()).toHaveText('Tarama tamamlandı');
  await page.locator('#remove-all-metadata').click();
  await expect(page.locator('#remove-all-metadata')).toBeEnabled();
  await expect(page.locator('.verification')).toHaveCount(0);
});
