import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      'msw/node': path.resolve(__dirname, 'tests/mocks/msw.ts'),
      msw: path.resolve(__dirname, 'tests/mocks/msw.ts'),
    },
  },
});
