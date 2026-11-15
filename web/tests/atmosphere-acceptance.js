// Run with Playwright browser_run_code against the production build on localhost:3000.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('http://localhost:3000');
  await page.evaluate(() => {
    window.atmosphereFrames = 0; window.atmosphereArcs = [];
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.matches('.atmosphere')) { window.atmosphereFrames++; window.atmosphereArcs = []; }
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (this.canvas.matches('.atmosphere')) window.atmosphereArcs.push({ x: args[0], y: args[1], alpha: this.globalAlpha });
      return arc.apply(this, args);
    };
  });
  await page.waitForFunction(() => window.atmosphereFrames > 5);
  const sample = () => page.evaluate(() => ({ frames: window.atmosphereFrames, stars: window.atmosphereArcs, pixels: document.querySelector('.atmosphere').toDataURL() }));
  const before = await sample();
  await page.waitForTimeout(2200);
  const after = await sample();
  assert(after.frames > before.frames + 30, 'requestAnimationFrame did not keep drawing');
  assert(after.pixels !== before.pixels, 'Canvas pixels did not change');
  const distances = after.stars.map((star, i) => Math.hypot(star.x - before.stars[i].x, star.y - before.stars[i].y));
  assert(distances.some(d => d > .5), 'Stars did not drift');
  assert(Math.max(...distances) - Math.min(...distances) > .5, 'Depth speeds are not different');
  assert(after.stars.some((star, i) => Math.abs(star.alpha - before.stars[i].alpha) > .01), 'Twinkle did not change');
  const stopped = async label => {
    await page.waitForTimeout(100);
    const a = await sample(); await page.waitForTimeout(300); const b = await sample();
    assert(a.frames === b.frames && a.pixels === b.pixels, `${label}: animation continued`);
  };
  await page.emulateMedia({ reducedMotion: 'reduce' }); await stopped('reduced motion');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(n => window.atmosphereFrames > n, (await sample()).frames);
  // Deterministic visibility event exercises the same browser lifecycle handler.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await stopped('hidden tab');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(n => window.atmosphereFrames > n, (await sample()).frames);
  await page.evaluate(() => {
    window.actualWorker = Worker;
    window.Worker = class { postMessage() {} terminate() {} };
  });
  await page.locator('#media').setInputFiles('C:/_projectsmert/ai-footprint-deleter/web/tests/fixtures/image-1.png');
  await page.getByText('Metadata taranıyor…', { exact: true }).waitFor();
  await stopped('file analysis');
  await page.getByRole('button', { name: 'İptal et', exact: true }).click();
  await page.waitForFunction(n => window.atmosphereFrames > n, (await sample()).frames);
  await page.evaluate(() => { window.Worker = window.actualWorker; });
  const sizes = [];
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.locator('.atmosphere').evaluate(canvas => ({ width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height, left: canvas.getBoundingClientRect().left, pointer: getComputedStyle(canvas).pointerEvents, opacity: getComputedStyle(canvas).opacity, zIndex: getComputedStyle(canvas).zIndex, base: getComputedStyle(document.body).backgroundColor, oldGlow: getComputedStyle(document.querySelector('.hero'), '::before').content, overflow: document.documentElement.scrollWidth > innerWidth }));
    assert(geometry.width === width && geometry.height === 900 && geometry.left === 0, `Canvas not viewport-wide ${width}`);
    assert(!geometry.overflow && geometry.pointer === 'none' && geometry.opacity === '1' && geometry.zIndex === '-1', `Layer problem ${width}`);
    assert(geometry.base === 'rgb(11, 18, 36)' && geometry.oldGlow === 'none', 'Base color or old rectangular glow remains');
    sizes.push(geometry);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stars = await page.evaluate(() => window.atmosphereArcs.length);
  return { frames: after.frames - before.frames, driftRange: [Math.min(...distances), Math.max(...distances)], changedPixels: true, twinkle: true, reducedMotion: 'paused', visibilityHandler: 'paused/resumed (simulated hidden event)', analysis: 'paused/resumed', sizes, stars };
}
