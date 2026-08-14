import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-admin-authorization-secret-with-32-bytes';

const query = vi.fn();
const srcDir = path.resolve(import.meta.dirname, '..', 'src');
const dbPath = require.resolve(path.join(srcDir, 'db.js'));
const dbModule = new Module(dbPath);
dbModule.exports = { query };
dbModule.loaded = true;
require.cache[dbPath] = dbModule;

const { requireAdmin } = require('../src/middleware');
const { createAdminRouteGuard } = require('../src/admin-route-guard');

let app;

function accessToken(payload = {}) {
  return jwt.sign(
    { sub: 'user-1', email: 'user@example.com', role: 'admin', ...payload },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

beforeAll(async () => {
  const Fastify = require('fastify');
  app = Fastify({ logger: false });
  app.addHook('onRoute', createAdminRouteGuard(requireAdmin));
  app.get('/admin/check', { preHandler: requireAdmin }, async () => ({ ok: true }));
  await app.ready();
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(() => {
  query.mockReset();
});

describe('admin authorization boundary', () => {
  it('returns 401 without an access token', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/check' });

    expect(response.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns 403 when the database role is not admin, even if the JWT role was forged', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_blocked: false }] })
      .mockResolvedValueOnce({ rows: [{ role: 'user' }] });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/check',
      headers: { authorization: 'Bearer ' + accessToken({ role: 'admin' }) }
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows access according to the current database role, not the JWT role', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ is_blocked: false }] })
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/check',
      headers: { authorization: 'Bearer ' + accessToken({ role: 'user' }) }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
