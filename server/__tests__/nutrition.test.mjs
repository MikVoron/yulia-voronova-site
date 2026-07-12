import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const m = new Module(resolved);
  m.exports = exports;
  m.loaded = true;
  require.cache[resolved] = m;
}

registerMock(path.join(srcDir, 'middleware.js'), {
  authenticate: async (req) => { req.user = { sub: 'admin-1', role: 'admin' }; },
  requireAdmin: async (req) => { req.user = { sub: 'admin-1', role: 'admin' }; },
});

let app;

async function buildApp() {
  const Fastify = require('fastify');
  const f = Fastify({ logger: false });
  const nutritionRoutes = require('../src/routes/nutrition');
  await f.register(nutritionRoutes);
  await f.ready();
  return f;
}

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { if (app) await app.close(); });

describe('admin nutrition hardening', () => {
  it('rejects too many ingredients', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/nutrition/calculate',
      payload: { ingredients: Array.from({ length: 61 }, (_, i) => 'Тофу: ' + (i + 1) + ' г'), servings: 4 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Слишком много ингредиентов');
  });

  it('rejects an overly long ingredient string', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/nutrition/calculate',
      payload: { ingredients: ['x'.repeat(201)], servings: 4 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Слишком длинное');
  });

  it('rejects out-of-range servings', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/nutrition/calculate',
      payload: { ingredients: ['Тофу: 100 г'], servings: 101 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('servings');
  });

  it('calculates a valid built-in ingredient without USDA network', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/nutrition/calculate',
      payload: { ingredients: ['Тофу: 100 г'], servings: 2 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total.kcal).toBe(78);
    expect(body.per_serving.kcal).toBe(39);
  });
});
