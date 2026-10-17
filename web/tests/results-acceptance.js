async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('http://localhost:3000');
  const upload = async (value, provenance = false) => {
    await page.evaluate(async ({ value, provenance }) => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const payload = new TextEncoder().encode(value);
      const length = payload.length + 2;
      const segment = new Uint8Array([255, provenance ? 235 : 254, length >> 8, length & 255, ...payload]);
      const data = new DataTransfer();
      data.items.add(new File([bytes.slice(0, 2), segment, bytes.slice(2)], 'metadata-sample.jpg', { type: 'image/jpeg' }));
      const input = document.querySelector('#media'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { value, provenance });
    await page.getByText('Metadata taraması tamamlandı', { exact: true }).waitFor();
  };
  await upload('trainedAlgorithmicMedia; Applied SynthID watermark; prompt: landscape');
  const results = page.locator('.metadata-results');
  assert(await results.getByRole('heading', { name: 'AI üretim beyanı bulunamadı', exact: true }).count() === 1, 'AI claim status missing');
  assert(await results.locator('.result-counts strong').nth(1).innerText() === '1', 'AI count incorrect');
  await results.getByRole('button', { name: 'Expand all', exact: true }).click();
  assert(await results.locator('.result-section:not([open])').count() === 0, 'Expand all failed');
  assert(await results.getByText(/Kaynak kaydında SynthID uygulandığı belirtiliyor/).isVisible(), 'SynthID source disclaimer missing');
  await results.getByRole('button', { name: 'Collapse all', exact: true }).click();
  assert(await results.locator('.result-section[open]').count() === 0, 'Collapse all failed');
  await results.getByRole('button', { name: /^File / }).click();
  assert(await results.locator('.result-section').count() === 1, 'Category filter failed');
  assert(await results.locator('.result-field').count() === 7, 'File category count incorrect');
  await results.getByRole('button', { name: /^Tümü / }).click();
  for (const width of [1320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await results.getByRole('button', { name: 'Expand all', exact: true }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await upload('camera note: ordinary photograph');
  assert(await results.getByRole('heading', { name: 'AI üretim beyanı bulunamadı', exact: true }).count() === 1, 'No AI status missing');
  assert(await results.locator('.result-counts strong').nth(1).innerText() === '0', 'Non AI count incorrect');
  await upload('c2pa opaque claim', true);
  assert(await results.getByText(/Content authenticity present but unverified/).count() === 1, 'Unverified provenance missing');
  assert(await results.locator('.result-counts strong').nth(1).innerText() === '0', 'C2PA must not imply AI');
  assert(await page.getByRole('button', { name: "Metadata'yı Temizle", exact: true }).isDisabled(), 'Provenance fail closed lost');
  return { aiClaim: 'passed', noAI: 'passed', provenance: 'unverified, blocked', categories: 'passed', expandCollapse: 'passed', layout: [1320, 390] };
}
