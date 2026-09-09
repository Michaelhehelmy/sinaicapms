import AdminApp from './AdminApp';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/Toast';
import { DebugFeedbackWidget } from '@/components/debug/DebugFeedbackWidget';

/**
 * Client-only admin SPA shell. Wraps AdminApp in the AuthProvider +
 * ToastProvider stack, mirroring what the old inline `<script>` on the
 * admin host page did (createRoot → ToastProvider → AuthProvider →
 * AdminApp).
 *
 * Rendered with `client:only="react"` from the admin host page. Using an
 * Astro island instead of a raw page-level `<script>` block keeps the
 * admin SPA working in `astro dev`: @astrojs/cloudflare v14 dev runs
 * inside workerd (Vite plugin), and page-level `?astro&type=script`
 * virtual modules fail to resolve there ("Unable to resolve"), returning
 * empty bodies. Islands go through the hydration pipeline, which resolves
 * correctly.
 */
export default function AdminShell() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AdminApp />
        <DebugFeedbackWidget />
      </AuthProvider>
    </ToastProvider>
  );
}