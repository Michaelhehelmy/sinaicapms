declare module 'cloudflare:workers' {
  interface Env {
    API_BACKEND: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    };
    ASSETS?: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    };
    [key: string]: unknown;
  }
  export const env: Env;
}
