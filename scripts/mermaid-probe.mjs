// Asks Mermaid's own parser (under jsdom) whether sources are valid.
// Usage: node scripts/mermaid-probe.mjs <file-or-dir>...   (dirs: every *.mmd inside)
//        node scripts/mermaid-probe.mjs --json cases.json  ({ "name": "source", ... })
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { mermaidParse } from './mermaid-jsdom.mjs';

const args = process.argv.slice(2);
const cases = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') {
    for (const [name, source] of Object.entries(JSON.parse(readFileSync(args[++i], 'utf8')))) cases.push([name, source]);
    continue;
  }
  const target = args[i];
  const files = statSync(target).isDirectory() ? readdirSync(target).filter((f) => f.endsWith('.mmd')).map((f) => path.join(target, f)) : [target];
  for (const f of files) cases.push([f, readFileSync(f, 'utf8')]);
}
for (const [name, source] of cases) {
  const result = await mermaidParse(source);
  console.log(result.ok ? `OK   ${name}` : `ERR  ${name} — ${result.error.split('\n')[0].slice(0, 140)}`);
}
