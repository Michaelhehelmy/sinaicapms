import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'tests/**',
        'node_modules/**',
        // Entry glue: chains two Astro middleware via `sequence` from
        // `astro:middleware`, which cannot be resolved in the vitest env.
        // The individual middleware (src/middleware/tenant.ts,
        // src/middleware/securityHeaders.ts) are unit-tested directly.
        'src/middleware/index.ts',
        // Storybook fixtures are dev-only and never shipped in the Astro
        // build. Their uncovered lines are demo interactivity (button
        // handlers that open modals/toasts), not production logic. The
        // render of every exported story is still regression-tested in
        // tests/unit/stories.test.tsx.
        'src/stories/**',
        // Type-only definition files — no runtime logic to cover
        '**/api-types.ts',
        '**/env.d.ts',
        '**/pos/types.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 99,
        lines: 99,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `astro:middleware` only exists during the Astro build. Map it to a
      // stub so the middleware modules can be unit-tested (see
      // tests/mocks/astro-middleware.ts).
      'astro:middleware': path.resolve(__dirname, 'tests/mocks/astro-middleware.ts'),
    },
  },
});
