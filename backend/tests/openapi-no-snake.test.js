/**
 * T8-D2 — No-snake contract test.
 *
 * Asserts the OpenAPI spec is 100% camelCase: zero snake_case keys anywhere
 * (paths, component schema property names, request bodies, responses) and zero
 * snake_case query/path parameter names (they live as VALUES of the `name`
 * field, not as object keys — added T8-E-3 to close that blind spot). Auth
 * endpoints expose `tenantId` (never `tenant_id`).
 *
 * Wire contract (T8): request body keys camelCase, response keys camelCase,
 * query/path param names camelCase. DB columns (tenant_id) are an internal
 * layer detail and never appear on the wire or in the spec.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../src/routes/registry.js';

const SNAKE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function findSnakeKeys(node, trail = [], out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findSnakeKeys(item, [...trail, `[${i}]`], out));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (SNAKE_RE.test(key)) out.push([...trail, key].join('.'));
      // Parameter names are VALUES of the `name` field (OpenAPI Parameter
      // objects) — check them too so snake_case param names can't slip in.
      if (key === 'name' && typeof value === 'string' && SNAKE_RE.test(value)) {
        out.push([...trail, key].join('.') + '=' + value);
      }
      findSnakeKeys(value, [...trail, key], out);
    }
  }
  return out;
}

describe('OpenAPI no-snake contract (T8-D)', () => {
  it('checked-in backend/openapi.json artifact matches the generated document', () => {
    const doc = buildOpenApiDocument();
    const artifactPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    expect(artifact).toEqual(doc);
  });

  it('has ZERO snake_case keys across the entire spec', () => {
    const doc = buildOpenApiDocument();
    const snake = findSnakeKeys(doc);
    expect(snake).toEqual([]);
  });

  it('login request body is camelCase-only (tenantId, no tenant_id)', () => {
    const doc = buildOpenApiDocument();
    const props = doc.paths['/api/auth/login'].post.requestBody.content['application/json'].schema.properties;
    expect(props.tenantId).toBeDefined();
    expect(props.tenant_id).toBeUndefined();
  });

  it('auth user response schema exposes tenantId (not tenant_id)', () => {
    const doc = buildOpenApiDocument();
    const user = doc.components.schemas.User.properties;
    expect(user.tenantId).toBeDefined();
    expect(user.tenant_id).toBeUndefined();
  });
});
