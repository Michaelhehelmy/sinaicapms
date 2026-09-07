import POSApp from './POSApp';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Client-only POS shell. Wraps POSApp in the shared ToastProvider, exactly
 * mirroring what the old inline `<script>` on the POS pages did
 * (createRoot → ToastProvider → POSApp).
 *
 * Rendered with `client:only="react"` from the POS Astro pages. Using an
 * Astro island instead of a raw page-level `<script>` block keeps the
 * POS SPA working in `astro dev`: @astrojs/cloudflare v14 runs dev inside
 * workerd (Vite plugin), and page-level `?astro&type=script` virtual
 * modules fail to resolve there ("Unable to resolve"), returning empty
 * bodies for every POS route. Islands go through the hydration pipeline,
 * which resolves correctly.
 */
export default function PosShell() {
  return (
    <ToastProvider>
      <POSApp />
    </ToastProvider>
  );
}