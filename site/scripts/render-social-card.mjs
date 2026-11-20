// Renders static/img/social-card.png (1200×630), the Open Graph image of every page, with Playwright's Chromium.
// Run it after changing the icon, the tagline or the screenshots: `node scripts/render-social-card.mjs`. Committed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const b64 = (rel) => readFileSync(new URL(rel, import.meta.url)).toString('base64');
const icon = b64('../../packages/extension/media/icon.png');
const shot = b64('../static/img/screens/sequence.png');

const html = `<!doctype html><html><head><style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden}
  body{background:#faf8f3;color:#1b1e23;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif}
  .wrap{box-sizing:border-box;width:1200px;height:630px;padding:60px 64px;display:grid;
    grid-template-columns:500px 1fr;gap:44px;align-items:center;border-bottom:12px solid #1f3b61}
  .brand{display:flex;align-items:center;gap:18px}
  .brand img{width:80px;height:80px;border-radius:16px}
  .brand span{font-size:46px;font-weight:700;letter-spacing:-0.5px}
  h1{font-family:Georgia,'Palatino Linotype',serif;font-size:44px;line-height:1.15;font-weight:600;margin:38px 0 0}
  p{font-size:23px;color:#4f555e;margin:26px 0 0;font-family:Consolas,ui-monospace,monospace}
  .shot{border-radius:12px;overflow:hidden;border:1px solid #c9c2b4;box-shadow:0 24px 48px -22px rgba(27,30,35,.45)}
  .shot img{display:block;width:100%}
</style></head><body><div class="wrap">
  <div>
    <div class="brand"><img src="data:image/png;base64,${icon}" alt=""><span>Mermaid Animator</span></div>
    <h1>The diagrams already in your repository, animated.</h1>
    <p>mermaid-animator.enbinario.com</p>
  </div>
  <div class="shot"><img src="data:image/png;base64,${shot}" alt=""></div>
</div></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.waitForTimeout(300);
  await page.screenshot({ path: fileURLToPath(new URL('../static/img/social-card.png', import.meta.url)) });
  console.log('wrote static/img/social-card.png');
} finally {
  await browser.close();
}
