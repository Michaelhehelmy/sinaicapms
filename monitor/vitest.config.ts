import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts}', 'src/**/*.{test,spec}.{js,mjs,cjs,ts}'],
    environment: 'node',
    globals: true,
  },
});
