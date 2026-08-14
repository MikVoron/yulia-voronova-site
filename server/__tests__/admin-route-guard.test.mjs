import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const { requireAdmin } = require('../src/middleware');
const { createAdminRouteGuard, isAdminRoute } = require('../src/admin-route-guard');

const apps = [];

function guardedApp() {
  const app = Fastify({ logger: false });
  app.addHook('onRoute', createAdminRouteGuard(requireAdmin));
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
});

describe('admin route fail-closed guard', () => {
  it('recognizes only the admin URL boundary', () => {
    expect(isAdminRoute('/admin')).toBe(true);
    expect(isAdminRoute('/admin/users')).toBe(true);
    expect(isAdminRoute('/administrator')).toBe(false);
    expect(isAdminRoute('/content/recipes')).toBe(false);
  });

  it('allows public routes and protected admin routes', async () => {
    const app = guardedApp();
    app.get('/health', async () => ({ ok: true }));
    app.get('/admin/check', { preHandler: requireAdmin }, async () => ({ ok: true }));
    await app.ready();
  });

  it('refuses to register an unprotected admin route', () => {
    const app = guardedApp();
    expect(() => {
      app.post('/admin/unprotected', async () => ({ ok: true }));
    }).toThrow(/must use requireAdmin/);
  });

  it('accepts every admin-bearing production route module', async () => {
    const app = guardedApp();
    await app.register(require('../src/routes/admin'));
    await app.register(require('../src/routes/content'));
    await app.register(require('../src/routes/ai'));
    await app.register(require('../src/routes/nutrition'));
    await app.ready();
  });
});
