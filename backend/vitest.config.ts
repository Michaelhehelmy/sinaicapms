import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts}'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{js,mjs}'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'migrations/**',
        'wrangler.toml',
        // Entry/glue: Hono app bootstrap that only wires middleware + routes to the
        // handler modules below (each handler is covered by its own unit tests).
        'src/index.js',
        // Re-export barrel that delegates every symbol to sharedAuth.js — drags
        // down function coverage without adding any testable logic.
        'src/middleware/auth.js',
      ],
      thresholds: {
        branches: 85,
        functions: 100,
        lines: 99,
        statements: 99,
      },
    },
  },
});
