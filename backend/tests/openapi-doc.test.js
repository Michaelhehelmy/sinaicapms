/**
 * T8-A — OpenAPI document scaffold tests.
 * Proves the registry produces a well-formed spec with the 8 auth paths and that
 * the checked-in backend/openapi.json artifact matches the in-code document.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../src/routes/registry.js';

const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/change-password',
];

describe('OpenAPI document (registry)', () => {
  it('has a valid 3.0.0 envelope with info + paths', () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toBe('3.0.0');
    expect(doc.info.title).toBe('SinaiCamps API');
    expect(typeof doc.paths).toBe('object');
  });

  it('includes all 8 auth paths', () => {
    const doc = buildOpenApiDocument();
    for (const p of AUTH_PATHS) {
      expect(doc.paths[p], `missing path ${p}`).toBeDefined();
    }
    const authPaths = Object.keys(doc.paths).filter((p) => p.startsWith('/api/auth'));
    expect(authPaths).toHaveLength(8);
  });

  it('login route has request body schema + success/error responses', () => {
    const doc = buildOpenApiDocument();
    const login = doc.paths['/api/auth/login'].post;
    expect(login.tags).toEqual(['auth']);
    const bodySchema = login.requestBody.content['application/json'].schema;
    expect(bodySchema).toBeDefined();
    expect(login.responses['200']).toBeDefined();
    expect(login.responses['401']).toBeDefined();
  });

  it('registers named components (AuthSession, User, ErrorEnvelope)', () => {
    const doc = buildOpenApiDocument();
    const schemas = doc.components.schemas;
    expect(schemas.AuthSession).toBeDefined();
    expect(schemas.User).toBeDefined();
    expect(schemas.ErrorEnvelope).toBeDefined();
  });

  it('checked-in backend/openapi.json artifact matches the generated document', () => {
    const doc = buildOpenApiDocument();
    const artifactPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    expect(artifact).toEqual(doc);
  });
});
