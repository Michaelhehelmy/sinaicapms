import { LoginForm } from '@/components/shell/LoginForm';
import type { PosUser } from '../types';

/**
 * POS login view — Phase 8 thin wrapper.
 *
 * All markup/behavior moved verbatim into the shared shell `LoginForm`
 * (realm="pos"), which owns the posLogin call and session-kernel persistence.
 * This file remains so `React.lazy(() => import('./views/LoginView'))` in
 * POSApp keeps its code-split boundary.
 */
export default function LoginView({ onLogin }: { onLogin: (u: PosUser, t: string) => void }) {
  return <LoginForm realm="pos" onPosSuccess={onLogin} />;
}
