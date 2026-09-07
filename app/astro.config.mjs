import { defineConfig, sharpImageService } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

const vitePlugins = [tailwindcss()];

// ANALYZE=1 npm run build  ->  emit a bundle analysis report + per-chunk sizes to console
// (no-op when ANALYZE is unset)
if (process.env.ANALYZE === '1') {
  const { visualizer } = await import('rollup-plugin-visualizer');
  vitePlugins.push(
    visualizer({
      filename: 'bundle-analysis.html',
      emitFile: true,
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
    {
      name: 'bundle-size-report',
      generateBundle(_outputOptions, bundle) {
        const chunks = Object.values(bundle)
          .filter((o) => o.type === 'chunk' && o.fileName.endsWith('.js'))
          .sort((a, b) => b.code.length - a.code.length);
        console.log('\n[ANALYZE] chunks by size:');
        for (const c of chunks) {
          console.log(`  ${c.fileName.padEnd(64)} ${(c.code.length / 1024).toFixed(1)} KiB`);
        }
      },
    },
  );
}

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    react(),
  ],
  image: {
    // Real image pipeline (sharp). Remote https images are allowed because
    // normalizeAssetUrl() already validates/upgrades remote asset URLs; the
    // SafeImage component falls back to a plain <img> if a remote fetch fails
    // so pages never 500 on an unreachable image host.
    service: sharpImageService(),
    remotePatterns: [{ protocol: 'https' }],
  },
  server: {
    port: 4320,
  },
  vite: {
    plugins: vitePlugins,
    build: {
      target: 'es2022',
    },
    // GH withastro/astro#17868: duplicate `@` aliases (here vs tsconfig.json
    // compilerOptions.paths) trigger workerd SSR alias-resolution mismatches in
    // `astro dev` ("Unable to resolve [@/components/...tsx]"). Astro 7 inherits
    // tsconfig paths into Vite automatically, so no vite.resolve.alias here.
    // noDiscovery + excludes prevent mid-flight SSR dep discovery from wiping
    // .vite/deps_ssr and invalidating running workerd module handles.
    optimizeDeps: {
      exclude: [
        'astro',
        'astro/actions',
        'astro:actions',
        'astro/content',
        'astro:content',
        '@astrojs/cloudflare',
        '@astrojs/react',
      ],
    },
    ssr: {
      optimizeDeps: {
        noDiscovery: true,
        exclude: [
          'astro',
          'astro/actions',
          'astro:actions',
          'astro/content',
          'astro:content',
          '@astrojs/cloudflare',
          '@astrojs/react',
        ],
      },
    },
  },
});
