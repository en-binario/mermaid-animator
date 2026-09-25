// Serves the repository over HTTP so the webview harness can load the built ES modules.
// Usage: node scripts/serve-harness.mjs [port]   → http://localhost:<port>/packages/webview/harness/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? 5173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mmd': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/** Every demo and corpus diagram, exposed to the harness as `window.harnessFixtures`. */
async function fixturesScript() {
  const { readdir } = await import('node:fs/promises');
  const fixtures = {};
  for (const dir of ['fixtures/demo', 'fixtures/mermaid/sequence/valid', 'fixtures/mermaid/sequence/invalid']) {
    const folder = path.join(root, dir);
    for (const file of (await readdir(folder)).filter((f) => f.endsWith('.mmd')).sort()) {
      const key = dir === 'fixtures/demo' ? file : `${dir.split('/').pop()}/${file}`;
      fixtures[key] = await readFile(path.join(folder, file), 'utf8');
    }
  }
  // Spanish strings keyed like the webview catalogue, from the real l10n bundle.
  const catalogue = await readFile(path.join(root, 'packages/protocol/src/strings.ts'), 'utf8');
  const bundle = JSON.parse(await readFile(path.join(root, 'packages/extension/l10n/bundle.l10n.es.json'), 'utf8'));
  const es = {};
  for (const m of catalogue.matchAll(/'([\w.]+)':\s*'((?:[^'\\]|\\.)*)'/g)) {
    const english = m[2].replace(/\\'/g, "'");
    if (bundle[english]) es[m[1]] = bundle[english];
  }
  return `window.harnessFixtures = ${JSON.stringify(fixtures)};\nwindow.harnessStringsEs = ${JSON.stringify(es)};`;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    if (url.pathname.endsWith('/harness-fixtures.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(await fixturesScript());
      return;
    }
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`Harness: http://localhost:${port}/packages/webview/harness/`));
