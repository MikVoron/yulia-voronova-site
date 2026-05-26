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
  await app.register(require('../src/routes/plate'));
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

describe('plate history metadata', () => {
  it('returns the optional meal type in history', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 7,
        saved_at: new Date('2026-05-26T08:10:00.000Z'),
        items: [{ name: 'Dish' }],
        totals: { kcal: 234 },
        meal_type: 'lunch'
      }]
    });

    const res = await app.inject({ method: 'GET', url: '/plate/history' });

    expect(res.statusCode).toBe(200);
    expect(res.json()[0].mealType).toBe('lunch');
  });

  it('persists the client timestamp and sanitized meal type on save', async () => {
    const date = '2026-05-26T15:10:05.000Z';
    const res = await app.inject({
      method: 'POST',
      url: '/plate/history',
      payload: {
        date,
        items: [{ name: 'Dish', kcal: 234 }],
        totals: { kcal: 234 },
        mealType: 'dinner'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toContain('saved_at');
    expect(mockQuery.mock.calls[0][1][1].toISOString()).toBe(date);
    expect(mockQuery.mock.calls[0][1][4]).toBe('dinner');
  });

  it('allows clearing a previously assigned meal type', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/plate/history/meal-type',
      payload: { date: '2026-05-26T15:10:05.000Z', mealType: '' }
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE plate_history SET meal_type');
    expect(mockQuery.mock.calls[0][1][2]).toBeNull();
  });
});
