import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const nodeBuiltins = [
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'fs/promises', 'http', 'https', 'module',
  'net', 'os', 'path', 'process', 'stream', 'url', 'util', 'worker_threads', 'zlib',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out-test/**', '.playwright-mcp/**', '**/node_modules/**', '**/.vscode-test/**', '**/coverage/**', 'openspec/**', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['scripts/**', '**/*.mjs', 'packages/extension/test/**'],
    languageOptions: { globals: { ...globals.node, ...globals.mocha } },
  },
  {
    files: ['packages/renderer/**', 'packages/webview/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // packages/core is pure: no VS Code, Node or DOM dependencies (spec §22.4).
    files: ['packages/core/src/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'vscode', message: 'packages/core must not depend on VS Code.' },
            ...nodeBuiltins.flatMap((m) => [
              { name: m, message: 'packages/core must not use Node.js built-ins.' },
              { name: `node:${m}`, message: 'packages/core must not use Node.js built-ins.' },
            ]),
          ],
          patterns: [
            { group: ['@mermaid-animator/renderer', '@mermaid-animator/webview', 'preact', 'preact/*', 'd3-*'], message: 'packages/core must not depend on DOM-oriented packages.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'self', 'process', 'require'],
    },
  },
);
