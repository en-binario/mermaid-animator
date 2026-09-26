// Builds the three bundles of the extension (spec §22.2, design D2 of add-m0-foundations):
//   dist/extension.node.js  — extension host on Node.js
//   dist/extension.web.js   — extension host in the browser (vscode.dev); Node built-ins are forbidden
//   dist/webview/           — the animator webview (ESM with code splitting) plus fonts and codicons
import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'packages/extension');
const dist = path.join(ext, 'dist');
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');
const require = createRequire(import.meta.url);

/** Fails the build when browser-targeted code imports a Node.js built-in module. */
export const noNodeBuiltins = {
  name: 'no-node-builtins',
  setup(build) {
    const names = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
    build.onResolve({ filter: /.*/ }, (args) => {
      if (names.has(args.path) || args.path.startsWith('node:')) {
        return { errors: [{ text: `Node.js built-in "${args.path}" is not allowed in a browser bundle (imported by ${args.importer}).` }] };
      }
      return undefined;
    });
  },
};

/** Metafiles of nested builds (embedded workers), for the third-party notices. */
const nestedResults = [];

/**
 * Embeds worker sources as text modules (`virtual:elk-worker`, `virtual:export-worker`): webview
 * workers start from a blob holding the whole script, because a blob worker cannot `importScripts`
 * extension resources in a VS Code webview (see packages/webview/src/workers/embedded.ts).
 */
const workerSources = {
  name: 'worker-sources',
  setup(build) {
    build.onResolve({ filter: /^virtual:(elk|export)-worker$/ }, (args) => ({ path: args.path, namespace: 'worker-source' }));
    build.onLoad({ filter: /.*/, namespace: 'worker-source' }, async (args) => {
      if (args.path === 'virtual:elk-worker') {
        const elk = path.dirname(require.resolve('elkjs/package.json', { paths: [path.join(root, 'packages/webview')] }));
        const file = path.join(elk, 'lib', 'elk-worker.min.js');
        return { contents: `export default ${JSON.stringify(await readFile(file, 'utf8'))};`, loader: 'js', watchFiles: [file] };
      }
      const result = await esbuild.build({
        entryPoints: [path.join(root, 'packages/webview/src/workers/export.worker.ts')],
        bundle: true,
        write: false,
        minify: production,
        target: 'es2022',
        platform: 'browser',
        format: 'iife',
        legalComments: 'none',
        metafile: true,
        plugins: [noNodeBuiltins],
      });
      nestedResults.push(result);
      return { contents: `export default ${JSON.stringify(result.outputFiles[0].text)};`, loader: 'js', watchFiles: Object.keys(result.metafile.inputs).map((f) => path.resolve(root, f)) };
    });
  },
};

const common = {
  bundle: true,
  sourcemap: production ? false : 'linked',
  minify: production,
  logLevel: 'info',
  target: 'es2022',
  legalComments: 'linked',
  metafile: true,
};

const configs = [
  {
    ...common,
    entryPoints: [path.join(ext, 'src/extension.ts')],
    outfile: path.join(dist, 'extension.node.js'),
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    // Prefer ES module entries: jsonc-parser's UMD `main` uses require() calls esbuild cannot follow.
    mainFields: ['module', 'main'],
  },
  {
    ...common,
    entryPoints: [path.join(ext, 'src/extension.ts')],
    outfile: path.join(dist, 'extension.web.js'),
    platform: 'browser',
    format: 'cjs',
    external: ['vscode'],
    plugins: [noNodeBuiltins],
  },
  {
    ...common,
    entryPoints: { main: path.join(root, 'packages/webview/src/main.tsx') },
    outdir: path.join(dist, 'webview'),
    platform: 'browser',
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: { '.woff2': 'dataurl', '.ttf': 'file' },
    assetNames: 'assets/[name]-[hash]',
    plugins: [noNodeBuiltins, workerSources],
  },
  {
    // The self-contained HTML player (M3 D5): the host inlines player.js and player.css into exported files.
    ...common,
    sourcemap: false,
    entryPoints: { player: path.join(root, 'packages/webview/src/player/main.ts') },
    outdir: path.join(dist, 'player'),
    platform: 'browser',
    format: 'iife',
    loader: { '.woff2': 'dataurl' },
    plugins: [noNodeBuiltins],
  },
];

/** Copies fonts and codicons and writes the @font-face stylesheet (fonts are bundled; no network). */
async function copyAssets() {
  const out = path.join(dist, 'webview');
  await mkdir(path.join(out, 'fonts'), { recursive: true });
  await mkdir(path.join(out, 'codicons'), { recursive: true });

  const fonts = [
    { family: 'Inter Variable', pkg: '@fontsource-variable/inter', base: 'inter' },
    { family: 'Source Serif 4 Variable', pkg: '@fontsource-variable/source-serif-4', base: 'source-serif-4' },
  ];
  const ranges = {
    latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  };
  let css = '/* Generated by scripts/build.mjs — bundled fonts (SIL OFL 1.1). */\n';
  for (const font of fonts) {
    const dir = path.dirname(require.resolve(`${font.pkg}/package.json`));
    for (const [subset, range] of Object.entries(ranges)) {
      const file = `${font.base}-${subset}-wght-normal.woff2`;
      await copyFile(path.join(dir, 'files', file), path.join(out, 'fonts', file));
      css += `@font-face{font-family:'${font.family}';font-style:normal;font-display:swap;font-weight:100 900;src:url('./fonts/${file}') format('woff2-variations');unicode-range:${range};}\n`;
    }
    await copyFile(path.join(dir, 'LICENSE'), path.join(out, 'fonts', `${font.base}.LICENSE.txt`));
  }
  await writeFile(path.join(out, 'fonts.css'), css);

  // The ELK layout worker (M2b) is embedded unmodified as text (see the worker-sources plugin).

  const codicons = path.join(path.dirname(require.resolve('@vscode/codicons/package.json')), 'dist');
  await copyFile(path.join(codicons, 'codicon.css'), path.join(out, 'codicons', 'codicon.css'));
  await copyFile(path.join(codicons, 'codicon.ttf'), path.join(out, 'codicons', 'codicon.ttf'));
}

/**
 * ThirdPartyNotices.txt (M2b 6.3): every npm package that ends up in the VSIX — found through the
 * esbuild metafiles plus the assets copied verbatim (fonts, codicons, the ELK worker) — with its
 * licence text.
 */
async function writeNotices(results) {
  const roots = new Set();
  const rootOf = (file) => {
    const normal = file.replace(/\\/g, '/');
    const m = /^(.*?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(normal);
    return m ? path.resolve(root, m[1]) : undefined;
  };
  for (const result of results) for (const input of Object.keys(result.metafile?.inputs ?? {})) {
    const r = rootOf(input);
    if (r) roots.add(r);
  }
  const webview = path.join(root, 'packages/webview');
  for (const pkg of ['@fontsource-variable/inter', '@fontsource-variable/source-serif-4', '@vscode/codicons', 'elkjs']) {
    roots.add(path.dirname(require.resolve(`${pkg}/package.json`, { paths: [webview] })));
  }
  const entries = [];
  for (const dir of roots) {
    let meta;
    try {
      meta = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (!meta.name || meta.name.startsWith('@mermaid-animator/')) continue;
    const files = (await readdir(dir)).filter((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
    const texts = await Promise.all(files.map((f) => readFile(path.join(dir, f), 'utf8')));
    const license = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? 'see text';
    entries.push({ id: `${meta.name}@${meta.version}`, name: meta.name, version: meta.version, license, text: texts.join('\n\n').trim() || `Licensed under ${license}.` });
  }
  const unique = [...new Map(entries.map((e) => [e.id, e])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const rule = '='.repeat(78);
  const body = [
    'Mermaid Animator — third-party notices',
    '',
    'This extension bundles the software listed below. Each component is provided under its own licence,',
    'reproduced in full. elkjs is used unmodified under the Eclipse Public License 2.0; its source is',
    'available at https://github.com/kieler/elkjs. Mediabunny is used unmodified under the Mozilla Public',
    `License 2.0; the source of the version shipped is available at https://github.com/Vanilagy/mediabunny/tree/v${unique.find((e) => e.name === 'mediabunny')?.version ?? ''}.`,
    '',
    ...unique.map((e) => `${e.id} (${e.license})`),
    '',
    ...unique.flatMap((e) => [rule, `${e.id} — ${e.license}`, rule, '', e.text, '']),
  ].join('\n');
  await writeFile(path.join(ext, 'ThirdPartyNotices.txt'), body);
  if (production) await writeSbom(unique);
  return unique.length;
}

/**
 * CycloneDX 1.5 SBOM of the components bundled into the VSIX (the same set as the notices), written
 * beside the VSIX as a release artefact: mermaid-animator.cdx.json.
 */
async function writeSbom(components) {
  const manifest = JSON.parse(await readFile(path.join(ext, 'package.json'), 'utf8'));
  const purl = (name, version) => `pkg:npm/${name.startsWith('@') ? `%40${name.slice(1)}` : name}@${version}`;
  const spdxId = /^[A-Za-z0-9.+-]+$/;
  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: { components: [{ type: 'application', name: 'mermaid-animator scripts/build.mjs' }] },
      component: { type: 'application', 'bom-ref': `vscode-extension:${manifest.publisher}.${manifest.name}@${manifest.version}`, name: manifest.name, version: manifest.version, publisher: manifest.publisher, licenses: [{ license: { id: manifest.license } }] },
    },
    components: components.map((c) => ({
      type: 'library',
      'bom-ref': purl(c.name, c.version),
      name: c.name,
      version: c.version,
      purl: purl(c.name, c.version),
      ...(c.license === 'see text' ? {} : { licenses: spdxId.test(c.license) ? [{ license: { id: c.license } }] : [{ expression: c.license }] }),
    })),
  };
  await writeFile(path.join(root, 'mermaid-animator.cdx.json'), `${JSON.stringify(bom, null, 2)}\n`);
}

async function main() {
  if (!watch) await rm(dist, { recursive: true, force: true });
  if (watch) {
    const contexts = await Promise.all(configs.map((c) => esbuild.context(c)));
    await copyAssets();
    await Promise.all(contexts.map((c) => c.watch()));
    console.log('[build] watching for changes…');
  } else {
    const results = await Promise.all(configs.map((c) => esbuild.build(c)));
    await copyAssets();
    const count = await writeNotices([...results, ...nestedResults]);
    console.log(`[build] ThirdPartyNotices.txt: ${count} packages`);
    const web = await readFile(path.join(dist, 'extension.web.js'), 'utf8');
    if (/require\(["'](node:)?(fs|path|os|child_process|crypto)["']\)/.test(web)) {
      throw new Error('extension.web.js references a Node.js built-in module.');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
