import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(async () => ({ query: mockClientQuery, release: mockRelease }));

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery, pool: { connect: mockConnect } });
registerMock(path.join(srcDir, 'middleware.js'), {
  authenticate: async (req) => { req.user = { sub: 'user-1' }; }
});

let app;

beforeAll(async () => {
  const Fastify = require('fastify');
  app = Fastify({ logger: false });
  await app.register(require('../src/routes/notes'));
  await app.register(require('../src/routes/favorites'));
  await app.ready();
});

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
  mockConnect.mockClear();
  mockRelease.mockClear();
  mockQuery.mockResolvedValue({ rows: [] });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

afterAll(async () => {
  if (app) await app.close();
});

describe('notes hardening', () => {
  it('rejects oversized note text instead of silently truncating it', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/notes/upsert',
      payload: { id: 1, title: 'T', text: 'x'.repeat(10001) }
    });

    expect(res.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects too many notes in sync', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/notes/sync',
      payload: { notes: Array.from({ length: 201 }, (_, i) => ({ id: i + 1, text: 'n' })) }
    });

    expect(res.statusCode).toBe(400);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe('favorites hardening', () => {
  it('rejects invalid favorite ids', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/favorites/toggle',
      payload: { recipe_id: '../not-a-recipe' }
    });

    expect(res.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects too many favorite ids in sync', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/favorites/sync',
      payload: { ids: Array.from({ length: 501 }, (_, i) => 'recipe-' + i) }
    });

    expect(res.statusCode).toBe(400);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
