import { test, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Each tests/<name>-acceptance.js file is a bare `async page => { ... }` expression (the same
// input Playwright MCP's browser_run_code takes). Evaluate it unchanged and call it with a page.
function load(name: string): (page: Page) => Promise<unknown> {
  const source = readFileSync(new URL(`../${name}-acceptance.js`, import.meta.url), 'utf8');
  return new Function(`return (${source}\n);`)() as (page: Page) => Promise<unknown>;
}

// Scripts open their own contexts; give those a finite default timeout so a missing element
// fails with the locator that was awaited instead of hanging until the test timeout.
function boundedContexts(browser: Browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args: Parameters<Browser['newContext']>) => {
    const context = await newContext(...args);
    context.setDefaultTimeout(15_000);
    return context;
  };
}

// Only scripts that still match the current UI run here; the others (written for the 2026-11-15 UI) stay
// as manual browser_run_code references until rewritten. Current flows are covered by app.spec.ts.
for (const name of ['atmosphere']) {
  test(`${name} acceptance`, async ({ page, browser }) => {
    page.setDefaultTimeout(15_000);
    boundedContexts(browser);
    await load(name)(page);
  });
}
