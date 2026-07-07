import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const DATA_FILE = path.resolve(import.meta.dirname, '../platform/data-v2.js');
const dataSource = fs.readFileSync(DATA_FILE, 'utf8');
const resilienceSource = dataSource.slice(
  dataSource.indexOf('let _contentError = false;'),
  dataSource.indexOf('// ─── HELPERS', dataSource.indexOf('let _contentError = false;'))
);

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(key); },
    dump() { return Object.fromEntries(data); },
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function createRuntime(fetchImpl, { session = {}, local = {} } = {}) {
  const sessionStorage = createStorage(session);
  const localStorage = createStorage(local);
  const context = vm.createContext({
    API_BASE: 'https://api.example.test',
    Auth: {
      getUser: () => null,
      isLoggedIn: () => false,
      getToken: () => null,
      refreshToken: async () => false,
    },
    RECIPES: {},
    CATEGORIES: {},
    _contentLoaded: false,
    _mapRecipe: value => value,
    sessionStorage,
    localStorage,
    fetch: fetchImpl,
    AbortController,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { dispatchEvent: () => {}, SP_INGREDIENTS: null },
    document: { body: null, getElementById: () => null },
    console: { error: () => {}, warn: () => {} },
    Math,
    Date,
    JSON,
    setTimeout: (fn) => { queueMicrotask(fn); return 1; },
    clearTimeout: () => {},
    queueMicrotask,
  });
  vm.runInContext(resilienceSource, context);
  return { context, sessionStorage, localStorage };
}

async function evaluate(context, expression) {
  return vm.runInContext(expression, context);
}

describe('SmartPlate content resilience', () => {
  it('persists a successful payload in both session and local storage', async () => {
    const fetchMock = async url => {
      if (url.endsWith('/content/recipes')) return response(200, [{ id: 'recipe-1' }]);
      if (url.endsWith('/content/categories')) return response(200, [{ id: 'mains', dishes: ['recipe-1'] }]);
      return response(200, []);
    };
    const runtime = createRuntime(fetchMock);

    await evaluate(runtime.context, 'loadContent()');

    assert.equal(await evaluate(runtime.context, 'isContentError()'), false);
    assert.equal(Object.keys(runtime.sessionStorage.dump()).length, 1);
    assert.equal(Object.keys(runtime.localStorage.dump()).length, 1);
    assert.equal(await evaluate(runtime.context, 'RECIPES["recipe-1"].id'), 'recipe-1');
  });

  it('uses a seven-hour-old persistent payload when every API request fails', async () => {
    const cacheKey = 'sp_content_cache_v1:guest';
    const cached = JSON.stringify({
      savedAt: Date.now() - 7 * 60 * 60 * 1000,
      recipes: [{ id: 'cached-recipe' }],
      categories: [{ id: 'mains', dishes: ['cached-recipe'] }],
      ingredients: [],
    });
    const runtime = createRuntime(
      async () => { throw new TypeError('Failed to fetch'); },
      { local: { [cacheKey]: cached } }
    );

    await evaluate(runtime.context, 'loadContent()');

    assert.equal(await evaluate(runtime.context, 'isContentError()'), false);
    assert.equal(await evaluate(runtime.context, 'isContentStale()'), true);
    assert.equal(await evaluate(runtime.context, 'RECIPES["cached-recipe"].id'), 'cached-recipe');
  });

  it('promotes an existing fresh session cache without changing its timestamp', async () => {
    const cacheKey = 'sp_content_cache_v1:guest';
    const savedAt = Date.now() - 30 * 60 * 1000;
    const cached = JSON.stringify({
      savedAt,
      recipes: [{ id: 'session-recipe' }],
      categories: [{ id: 'mains', dishes: ['session-recipe'] }],
      ingredients: [],
    });
    const runtime = createRuntime(
      async () => new Promise(() => {}),
      { session: { [cacheKey]: cached } }
    );

    await evaluate(runtime.context, 'loadContent()');

    const promoted = JSON.parse(runtime.localStorage.getItem(cacheKey));
    assert.equal(promoted.savedAt, savedAt);
    assert.equal(promoted.recipes[0].id, 'session-recipe');
  });

  it('classifies HTTP 429 separately when no fallback cache exists', async () => {
    const fetchMock = async url => {
      if (url.endsWith('/content/ingredients')) return response(200, []);
      return response(429, { error: 'rate limit' });
    };
    const runtime = createRuntime(fetchMock);

    await evaluate(runtime.context, 'loadContent()');

    assert.equal(await evaluate(runtime.context, 'isContentError()'), true);
    assert.equal(await evaluate(runtime.context, '_contentErrorType'), 'rate-limit');
  });

  it('clears audience caches from both storage layers', async () => {
    const runtime = createRuntime(async () => response(200, []), {
      session: { 'sp_content_cache_v1:guest': '{}', unrelated: 'keep' },
      local: { 'sp_content_cache_v1:user': '{}', unrelated: 'keep' },
    });

    await evaluate(runtime.context, 'clearContentCache()');

    assert.deepEqual(runtime.sessionStorage.dump(), { unrelated: 'keep' });
    assert.deepEqual(runtime.localStorage.dump(), { unrelated: 'keep' });
  });
});
