// Captures the screenshots of the home page from the webview harness, which runs the real animator in a browser with
// a mocked VS Code API. Run after a UI change:
//
//   npm run build                              (repository root)
//   node scripts/serve-harness.mjs 5199        (repository root, leave it running)
//   node scripts/capture-screens.mjs           (site/)
//
// It writes static/img/screens/*.png, which are committed.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HARNESS = process.env.HARNESS_URL ?? 'http://localhost:5199/packages/webview/harness/';
const OUT = fileURLToPath(new URL('../static/img/screens/', import.meta.url));

const SHOTS = [
  { name: 'sequence', theme: 'light', mode: 'ivory', steps: 5, keys: [] },
  { name: 'topology', theme: 'light', mode: 'ivory', steps: 6, keys: ['t'] },
  { name: 'split', theme: 'light', mode: 'ivory', steps: 6, keys: ['s'] },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const params = new URLSearchParams({ theme: shot.theme, mode: shot.mode, fixture: 'checkout-story.mmd', chrome: '0' });
    for (const [k, v] of Object.entries(shot.settings ?? {})) params.set(`s.${k}`, v);
    await page.goto(`${HARNESS}?${params}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.mouse.click(640, 400);
    for (const key of shot.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(1200);
    }
    for (let i = 0; i < shot.steps; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(650);
    }
    await page.waitForTimeout(900);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${OUT}${shot.name}.png` });
    if (errors.length) throw new Error(`${shot.name}: ${errors.join('; ')}`);
    console.log(`wrote static/img/screens/${shot.name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
