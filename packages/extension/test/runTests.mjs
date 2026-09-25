// Integration tests: bundles the Mocha suites with esbuild, then runs them inside a
// downloaded VS Code build with the extension under development loaded.
import * as esbuild from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = path.resolve(here, '..');
const outDir = path.join(extensionDevelopmentPath, 'out-test');

const suites = globSync('suite/**/*.test.ts', { cwd: here }).map((f) => path.join(here, f));
await esbuild.build({
  entryPoints: [path.join(here, 'suite/index.ts'), ...suites],
  outdir: outDir,
  outbase: path.join(here, 'suite'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode', 'mocha'],
  sourcemap: 'inline',
  logLevel: 'warning',
});

// When launched from inside VS Code, this variable would make Electron behave as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

try {
  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? 'stable',
    extensionDevelopmentPath,
    extensionTestsPath: path.join(outDir, 'index.js'),
    launchArgs: [path.join(here, 'fixtures/workspace'), '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
  });
} catch (error) {
  console.error('Integration tests failed:', error);
  process.exit(1);
}
