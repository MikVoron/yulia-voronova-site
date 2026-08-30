import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../platform/data-v2.js'), 'utf8');
const cacheSource = source.slice(
  source.indexOf('let _contentError = false;'),
  source.indexOf('function _applyContentPayload')
);

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(key),
    dump: () => Object.fromEntries(values)
  };
}

function runtime({ loggedIn = false, initial = {} } = {}) {
  const sessionStorage = storage(initial);
  const localStorage = storage(initial);
  const context = vm.createContext({
    Auth: {
      isLoggedIn: () => loggedIn,
      getUser: () => loggedIn ? { id: 1, role: 'user' } : null
    },
    sessionStorage,
    localStorage,
    Date,
    JSON,
    encodeURIComponent
  });
  vm.runInContext(cacheSource, context);
  return { context, sessionStorage, localStorage };
}

describe('guest content browser cache', () => {
  it('purges legacy and v3 cache entries before they can be read', () => {
    const state = runtime({
      initial: {
        'sp_content_cache_v1:user%3A1%3Auser': JSON.stringify({ recipes: [{ steps: ['secret'] }] }),
        'sp_content_cache_v3:guest': JSON.stringify({ recipes: [{ id: 'free', steps: [] }] })
      }
    });
    expect(state.sessionStorage.dump()).toEqual({});
    expect(state.localStorage.dump()).toEqual({});
  });

  it('never writes catalog payloads for logged-in users', () => {
    const state = runtime({ loggedIn: true });
    vm.runInContext("_writeContentCache({ recipes: [{ id: 'pro', ingredients: ['secret'], steps: ['secret'], note: 'secret' }], categories: [], ingredients: [] })", state.context);
    expect(state.sessionStorage.dump()).toEqual({});
    expect(state.localStorage.dump()).toEqual({});
  });

  it('keeps the public recipe content of free recipes, including step photos', () => {
    const state = runtime();
    vm.runInContext("_writeContentCache({ recipes: [{ id: 'free', access_level: 'free', name: 'Card', ingredients: ['x'], steps: [{ text: 'y', photo: 'images/step.webp' }], note: 'z' }], categories: [], ingredients: [{ id: 'x' }] })", state.context);
    const cached = JSON.parse(Object.values(state.localStorage.dump())[0]);
    expect(cached.recipes).toEqual([{ id: 'free', access_level: 'free', name: 'Card', ingredients: ['x'], steps: [{ text: 'y', photo: 'images/step.webp' }], note: 'z' }]);
    expect(cached.ingredients).toEqual([]);
  });

  it('strips protected content from trial and pro recipes', () => {
    const state = runtime();
    vm.runInContext("_writeContentCache({ recipes: [{ id: 'trial', access_level: 'trial', ingredients: ['x'], steps: ['y'], note: 'z' }, { id: 'pro', access_level: 'pro', ingredients: ['x'], steps: ['y'], note: 'z' }], categories: [], ingredients: [] })", state.context);
    const cached = JSON.parse(Object.values(state.localStorage.dump())[0]);
    expect(cached.recipes).toEqual([{ id: 'trial', access_level: 'trial' }, { id: 'pro', access_level: 'pro' }]);
  });
});
