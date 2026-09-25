import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx', 'packages/extension/unit/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'packages/extension/test/**'],
    environment: 'node',
  },
});
