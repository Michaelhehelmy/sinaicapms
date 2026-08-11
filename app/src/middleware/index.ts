import { sequence } from 'astro:middleware';
import { onRequest as tenantOnRequest } from './tenant';
import { onRequest as securityHeadersOnRequest } from './securityHeaders';

// Chain order: securityHeaders runs FIRST (outer), so it can set headers on
// the response produced by the inner chain (tenant resolution → page render).
export const onRequest = sequence(securityHeadersOnRequest, tenantOnRequest);
