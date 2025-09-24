import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
    setupFiles: ['tests/setup/env.ts'],
    coverage: {
      enabled: false,
    },
  },
});
