import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Per-test state read by mockQuery ───────────────────────────────────────
let userState = { is_blocked: false, role: 'user' };
let subState = null; // null = no subscription row; or { status, trial_ends_at, active_until }
let dietaryPreferences = null;
let reviewRows = [];
let reviewAlreadyAnswered = false;
const sendReviewReply = vi.fn().mockResolvedValue(true);

const FREE_RECIPE = {
  id: 'free-1', cat: 'breakfasts', name: 'Free recipe',
  is_free: true, access_level: 'free',
  ingredients: [{ name: 'a' }], steps: [{ text: 's' }], note: 'free-note',
  categories: ['breakfasts'],
};
const PAID_RECIPE = {
  id: 'paid-1', cat: 'mains', name: 'Paid recipe',
  // Legacy-style: только is_free, без access_level — проверяем fallback на 'pro'
  is_free: false, access_level: null,
  ingredients: [{ name: 'b' }], steps: [{ text: 't' }], note: 'paid-note',
  categories: ['mains'],
};
const TRIAL_RECIPE = {
  id: 'trial-1', cat: 'mains', name: 'Trial recipe',
  is_free: false, access_level: 'trial',
  ingredients: [{ name: 'c' }], steps: [{ text: 'u' }], note: 'trial-note',
  categories: ['mains'],
};
const PRO_RECIPE = {
  id: 'pro-1', cat: 'mains', name: 'Pro recipe',
  is_free: false, access_level: 'pro',
  ingredients: [{ name: 'd' }], steps: [{ text: 'v' }], note: 'pro-note',
  categories: ['mains'],
};
const RECIPES = [FREE_RECIPE, PAID_RECIPE, TRIAL_RECIPE, PRO_RECIPE];
const CATEGORIES = [
  { id: 'breakfasts', name: 'Завтраки', emoji: '🥣', color: '#fff', description: '', sort_order: 1, auto_addons: {} },
  { id: 'soups', name: 'Супы', emoji: '🍲', color: '#d97706', description: 'Супы, борщи, щи и бульонные блюда', sort_order: 2, auto_addons: {} },
  { id: 'mains', name: 'Горячее', emoji: '🍽️', color: '#fff', description: 'Сытные горячие блюда', sort_order: 3, auto_addons: {} },
];

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
  if (/SELECT dietary_preferences FROM users WHERE id/.test(sql)) {
    return { rows: dietaryPreferences ? [{ dietary_preferences: dietaryPreferences }] : [] };
  }
  if (/FROM recipes r WHERE r\.is_published = true/.test(sql)) {
    return { rows: RECIPES.map(r => ({ ...r })) };
  }
  if (/SELECT id, name, emoji, color, description, sort_order, auto_addons FROM categories ORDER BY sort_order/.test(sql)) {
    return { rows: CATEGORIES.map(c => ({ ...c })) };
  }
  if (/LEFT JOIN review_replies rr ON rr.review_id = r.id/.test(sql)) {
    return { rows: reviewRows.map(r => ({ ...r })) };
  }
  if (/SELECT r.id, r.recipe_id, r.text AS review_text/.test(sql)) {
    return { rows: [{
      id: 17,
      recipe_id: 'salmon-ukha',
      review_text: 'Подскажите, можно ли заменить рыбу?',
      email: 'galina@example.com',
      display_name: 'Галина',
      recipe_name: 'Уха',
      has_reply: reviewAlreadyAnswered,
    }] };
  }
  if (/INSERT INTO review_replies/.test(sql)) {
    return { rows: [{ text: 'Спасибо за вопрос!', created_at: '2026-08-03T10:00:00.000Z', updated_at: '2026-08-03T10:00:00.000Z' }] };
  }
  if (/FROM recipe_categories rc\s+JOIN recipes r ON r\.id = rc\.recipe_id\s+WHERE r\.is_published = true/.test(sql)) {
    return {
      rows: RECIPES.flatMap(r => (r.categories || [r.cat]).map(category_id => ({
        category_id,
        id: r.id,
        ingredients: r.ingredients,
        dietary_flags: r.dietary_flags,
        dietary_verified: r.dietary_verified,
      }))),
    };
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
  sendReviewReply,
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
  dietaryPreferences = null;
  reviewRows = [];
  reviewAlreadyAnswered = false;
  mockQuery.mockClear();
  sendReviewReply.mockClear();
});

describe('GET /content/recipes dietary filtering', () => {
  it('keeps unverified recipes visible when a user selects an exclusion', async () => {
    dietaryPreferences = { excluded_flags: ['milk'], allow_swaps: true };
    const recipe = {
      ...FREE_RECIPE,
      id: 'diet-unverified',
      dietary_verified: false,
      dietary_flags: ['milk'],
    };
    RECIPES.push(recipe);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/content/recipes',
        headers: { authorization: 'Bearer ' + makeToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().some(r => r.id === recipe.id)).toBe(true);
    } finally {
      RECIPES.pop();
    }
  });

  it('hides a verified conflicting recipe without a compatible replacement', async () => {
    dietaryPreferences = { excluded_flags: ['milk'], allow_swaps: true };
    const recipe = {
      ...FREE_RECIPE,
      id: 'diet-blocked',
      dietary_verified: true,
      dietary_flags: ['milk'],
      ingredients: [{ name: 'Cream', dietary_flags: ['milk'] }],
    };
    RECIPES.push(recipe);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/content/recipes',
        headers: { authorization: 'Bearer ' + makeToken() },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().some(r => r.id === recipe.id)).toBe(false);
    } finally {
      RECIPES.pop();
    }
  });
});

describe('GET /content/categories', () => {
  it('keeps soups as a separate category from hot dishes', async () => {
    const soup = {
      ...PAID_RECIPE,
      id: 'soup-test',
      cat: 'soups',
      name: 'Soup recipe',
      is_soup: true,
      categories: ['soups'],
    };
    RECIPES.push(soup);
    try {
      const res = await app.inject({ method: 'GET', url: '/content/categories' });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      const soups = data.find(c => c.id === 'soups');
      const mains = data.find(c => c.id === 'mains');
      expect(soups.name).toBe('Супы');
      expect(mains.name).toBe('Горячее');
      expect(soups.dishes).toContain('soup-test');
      expect(mains.dishes).not.toContain('soup-test');
    } finally {
      RECIPES.pop();
    }
  });
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

describe('recipe reviews', () => {
  it('returns the platform author reply in the public review list', async () => {
    reviewRows = [{
      id: 17, stars: 5, text: 'Подскажите, можно ли заменить рыбу?',
      created_at: '2026-08-03T09:00:00.000Z', user_id: 'u-7',
      display_name: 'Галина', avatar: null, early_access_member: false,
      reply_text: 'Да, подойдёт любая белая рыба.',
      reply_created_at: '2026-08-03T10:00:00.000Z',
      reply_updated_at: '2026-08-03T10:00:00.000Z',
    }];
    const res = await app.inject({ method: 'GET', url: '/content/reviews/salmon-ukha' });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0].reply).toEqual({
      text: 'Да, подойдёт любая белая рыба.',
      createdAt: '2026-08-03T10:00:00.000Z',
      updatedAt: '2026-08-03T10:00:00.000Z',
    });
  });

  it('lets an admin publish a reply to an existing review', async () => {
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/reviews/17/reply',
      headers: { authorization: 'Bearer ' + makeToken('admin-1') },
      payload: { text: 'Спасибо за вопрос!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reply.text).toBe('Спасибо за вопрос!');
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO review_replies/.test(sql))).toBe(true);
    expect(sendReviewReply).toHaveBeenCalledWith(
      'galina@example.com', 'Уха', 'salmon-ukha',
      'Подскажите, можно ли заменить рыбу?', 'Спасибо за вопрос!', 'Галина'
    );
  });

  it('does not email again when an admin edits an existing review reply', async () => {
    reviewAlreadyAnswered = true;
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/reviews/17/reply',
      headers: { authorization: 'Bearer ' + makeToken('admin-1') },
      payload: { text: 'Уточнённый ответ' },
    });
    expect(res.statusCode).toBe(200);
    expect(sendReviewReply).not.toHaveBeenCalled();
  });
});

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

  // Note: тест «trial-пользователь видит paid-1 полностью» удалён.
  // Под старой моделью trial видел всё; под новой access_level моделью paid-1
  // с access_level=null → fallback 'pro' → trial его не видит. Новое
  // поведение покрыто в describe('access_level matrix') ниже.

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

// access_level matrix — см. docs/guest-mode-mvp.md §5A.3, §5A.8
describe('GET /content/recipes — access_level matrix', () => {
  it('guest: free=full, trial=stripped, pro=stripped', async () => {
    const res = await app.inject({ method: 'GET', url: '/content/recipes' });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectStripped(data.find(r => r.id === 'trial-1'));
    expectStripped(data.find(r => r.id === 'pro-1'));
  });

  it('trial user: free=full, trial=full, pro=stripped', async () => {
    subState = { status: 'trial', trial_ends_at: FUTURE, active_until: PAST };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectFull(data.find(r => r.id === 'trial-1'));
    expectStripped(data.find(r => r.id === 'pro-1'));
  });

  it('active user: free=full, trial=full, pro=full', async () => {
    subState = { status: 'active', trial_ends_at: PAST, active_until: FUTURE };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectFull(data.find(r => r.id === 'trial-1'));
    expectFull(data.find(r => r.id === 'pro-1'));
  });

  it('admin without subscription: all levels full', async () => {
    userState = { is_blocked: false, role: 'admin' };
    subState = null;
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectFull(data.find(r => r.id === 'trial-1'));
    expectFull(data.find(r => r.id === 'pro-1'));
  });

  it('expired user: free=full, trial=stripped, pro=stripped', async () => {
    subState = { status: 'expired', trial_ends_at: PAST, active_until: PAST };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectStripped(data.find(r => r.id === 'trial-1'));
    expectStripped(data.find(r => r.id === 'pro-1'));
  });

  it('blocked user with active sub: all paid levels stripped (block trumps tier)', async () => {
    userState = { is_blocked: true, role: 'user' };
    subState = { status: 'active', trial_ends_at: PAST, active_until: FUTURE };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expectFull(data.find(r => r.id === 'free-1'));
    expectStripped(data.find(r => r.id === 'trial-1'));
    expectStripped(data.find(r => r.id === 'pro-1'));
  });

  it('legacy recipe with is_free=false and no access_level: stripped for guest (fallback to pro)', async () => {
    // paid-1 имеет access_level: null — должен трактоваться как 'pro'
    const res = await app.inject({ method: 'GET', url: '/content/recipes' });
    expect(res.statusCode).toBe(200);
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });

  it('legacy recipe with is_free=false and no access_level: stripped for trial (fallback to pro)', async () => {
    subState = { status: 'trial', trial_ends_at: FUTURE, active_until: PAST };
    const res = await app.inject({
      method: 'GET',
      url: '/content/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
    });
    expect(res.statusCode).toBe(200);
    // paid-1 → access_level fallback 'pro' → стрипается для trial
    expectStripped(res.json().find(r => r.id === 'paid-1'));
  });
});

// Validation tests for admin write endpoints.
// Любой невалидный access_level должен дать 400 ДО касания БД — никакого silent fallback.
describe('admin /recipes: access_level validation', () => {
  it('POST /admin/recipes: invalid access_level returns 400', async () => {
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        id: 'bogus-test', name: 'Bogus', categories: ['mains'],
        access_level: 'super-secret',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.field).toBe('access_level');
    expect(body.error).toMatch(/access_level/i);
  });

  it('PUT /admin/recipes/:id: invalid access_level returns 400', async () => {
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/recipes/some-id',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        name: 'X', categories: ['mains'],
        access_level: 'ULTRA',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.field).toBe('access_level');
  });

  it('POST /admin/recipes: empty access_level falls back via is_free (no 400)', async () => {
    // access_level отсутствует / пуст → backward compat: is_free=true → 'free'
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        // намеренно без access_level
        id: 'fallback-test', name: 'X', categories: ['mains'],
        is_free: true,
      },
    });
    // Хэндлер пройдёт валидацию (т.к. fallback на is_free=true → 'free') и
    // упадёт уже на INSERT (mockQuery возвращает пустой rows[0] → TypeError).
    // Главное — это НЕ 400-ошибка валидации access_level.
    expect(res.statusCode).not.toBe(400);
  });

  it('POST /admin/recipes: oversized ingredient list returns 400 before insert', async () => {
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/recipes',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        id: 'oversized-test',
        name: 'Oversized',
        categories: ['mains'],
        ingredients: Array.from({ length: 121 }, (_, i) => ({ name: 'Ingredient ' + i })),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('ingredients');
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO recipes/.test(sql))).toBe(false);
  });

  it('POST /admin/news: oversized text returns 400 before insert', async () => {
    userState = { is_blocked: false, role: 'admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/admin/news',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { text: 'x'.repeat(5001) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().field).toBe('text');
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO news/.test(sql))).toBe(false);
  });
});
