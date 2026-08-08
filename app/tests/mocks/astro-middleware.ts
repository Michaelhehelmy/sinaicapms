// Stub for the `astro:middleware` virtual module (only resolvable at Astro
// build time). `defineMiddleware` is a pure wrapper, so the identity function
// lets tests invoke middleware handlers directly. Used only in vitest via
// resolve.alias in vitest.config.ts.
export function defineMiddleware(handler: unknown): unknown {
  return handler;
}
