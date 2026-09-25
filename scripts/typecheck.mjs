// Type-checks every package with its own compiler options (libs differ per runtime).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const projects = [
  'packages/core',
  'packages/protocol',
  'packages/renderer',
  'packages/webview',
  'packages/extension',
  'packages/extension/test',
  'tsconfig.tests.json',
].filter((p) => existsSync(p.endsWith('.json') ? p : `${p}/tsconfig.json`));

let failed = false;
for (const project of projects) {
  const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', project], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
