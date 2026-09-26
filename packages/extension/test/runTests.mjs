// Integration tests: bundles the Mocha suites with esbuild, then runs them inside a
// downloaded VS Code build with the extension under development loaded.
import * as esbuild from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// `EXTENSION_PATH=<folder>` runs the suites against another copy, e.g. an unpacked VSIX.
const extensionDevelopmentPath = path.resolve(process.env.EXTENSION_PATH ?? path.join(here, '..'));
const outDir = path.join(here, '..', 'out-test');

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
    // `MOCHA_GREP=<pattern>` runs matching tests only.
    extensionTestsEnv: { MOCHA_GREP: process.env.MOCHA_GREP ?? '', KEEP_EXPORTS: process.env.KEEP_EXPORTS ?? '' },
    launchArgs: [path.join(here, 'fixtures/workspace'), '--disable-extensions', '--skip-welcome', '--skip-release-notes'],
  });
} catch (error) {
  console.error('Integration tests failed:', error);
  process.exit(1);
}
