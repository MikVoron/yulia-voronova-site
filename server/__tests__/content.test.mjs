import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Per-test state read by mockQuery ───────────────────────────────────────
let userState = { is_blocked: false, role: 'user' };
let subState = null; // null = no subscription row; or { status, trial_ends_at, active_until }

const FREE_RECIPE = {
  id: 'free-1', cat: 'breakfasts', name: 'Free recipe', is_free: true,
  ingredients: [{ name: 'a' }], steps: [{ text: 's' }], note: 'free-note',
  categories: ['breakfasts'],
};
const PAID_RECIPE = {
  id: 'paid-1', cat: 'mains', name: 'Paid recipe', is_free: false,
  ingredients: [{ name: 'b' }], steps: [{ text: 't' }], note: 'paid-note',
  categories: ['mains'],
};
const RECIPES = [FREE_RECIPE, PAID_RECIPE];

const mockQuery = vi.fn(async (sql /*, params */) => {
  if (/SELECT is_blocked FROM users WHERE id/.test(sql)) {
    return { rows: [{ is_blocked: userState.is_blocked }] };
  }
  if (/SELECT role FROM users WHERE id/.test(sql)) {
    return { rows: [{ role: userState.role }] };
  }
  if (/FROM subscriptions WHERE user_id/.test(sql)) {
    return { rows: subState ? [subState] : [] };
  }
  if (/FROM recipes r WHERE r\.is_published = true/.test(sql)) {
    return { rows: RECIPES.map(r => ({ ...r })) };
  }
  return { rows: [] };
});

// ── Inject mocks into Node's require cache ─────────────────────────────────
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

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
registerMock(path.join(srcDir, 'email.js'), {
  sendLoginCode: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
  sendNewUserNotification: vi.fn().mockResolvedValue(true),
});
registerMock(path.join(srcDir, 'audit.js'), { log: vi.fn() });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest';

// ── Build app ──────────────────────────────────────────────────────────────
let app;
async function buildApp() {
  const Fastify = require('fastify');
  const f = Fastify({ logger: false });
  const contentRoutes = require('../src/routes/content');
  await f.register(contentRoutes);
  await f.ready();
  return f;
}

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { if (app) await app.close(); });

beforeEach(() => {
  userState = { is_blocked: false, role: 'user' };
  subState = null;
  mockQuery.mockClear();
});

const jwt = require('jsonwebtoken');
function makeToken(userId = 'u-1') {
  return jwt.sign(
    { sub: userId, email: 'test@test.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

function expectStripped(recipe) {
  expect(recipe).toBeDefined();
  expect(recipe.ingredients).toBeUndefined();
  expect(recipe.steps).toBeUndefined();
  expect(recipe.note).toBeUndefined();
}

function expectFull(recipe) {
  expect(recipe).toBeDefined();
  expect(recipe.ingredients).toBeDefined();
  expect(recipe.steps).toBeDefined();
  expect(recipe.note).toBeDefined();
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GET /content/recipes — paywall stripping', () => {
  it('without token: paid recipe stripped, free recipe full', async () => {
    const res = await app.inject({ method: 'GET', url: '/content/recipes' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectStripped(data.find(r => r.id === 'paid-1'));
  });

  it('user with active subscription: paid recipe full', async () => {
    subState = { status: 'active', trial_ends_at: PAST, active_until: FUTURE };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectFull(res.json().find(r => r.id === 'paid-1'));
  });

  it('user with active trial: paid recipe full', async () => {
    subState = { status: 'trial', trial_ends_at: FUTURE, active_until: PAST };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectFull(res.json().find(r => r.id === 'paid-1'));
  });

  it('user with expired subscription: paid recipe stripped', async () => {
    subState = { status: 'expired', trial_ends_at: PAST, active_until: PAST };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });

  it('user with no subscription row: paid recipe stripped', async () => {
    subState = null;
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });

  it('blocked user with valid JWT + active sub: paid recipe stripped (regression for is_blocked leak)', async () => {
    userState = { is_blocked: true, role: 'user' };
    subState = { status: 'active', trial_ends_at: PAST, active_until: FUTURE };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });

  it('admin without subscription: paid recipe full', async () => {
    userState = { is_blocked: false, role: 'admin' };
    subState = null;
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectFull(res.json().find(r => r.id === 'paid-1'));
  });

  it('blocked admin: paid recipe stripped (block trumps role)', async () => {
    userState = { is_blocked: true, role: 'admin' };
    subState = null;
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });

  it('invalid JWT: treated as unauthenticated, paid recipe stripped', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer not-a-real-token' },
    });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });
});
