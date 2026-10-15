import { afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const { createSitemapRoutes } = require('../src/routes/sitemap');

const db = { query: async sql => {
  if (/SELECT id FROM recipes/.test(sql)) return { rows: [{ id: 'fresh-recipe' }] };
  if (/SELECT id FROM categories/.test(sql)) return { rows: [{ id: 'mains' }] };
  if (/SELECT id FROM ingredient_catalog/.test(sql)) return { rows: [] };
  if (/SELECT DISTINCT unnest\(main_ingredients\)/.test(sql)) return { rows: [] };
  throw new Error(`Unexpected query: ${sql}`);
} };

const app = Fastify({ logger: false });
await app.register(createSitemapRoutes(db));
await app.ready();

afterAll(async () => app.close());

describe('GET /_seo/sitemap', () => {
  it('serves sitemap XML generated from the current database', async () => {
    const response = await app.inject({ method: 'GET', url: '/_seo/sitemap' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/xml');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toContain('recipe.html?id=fresh-recipe');
  });
});
