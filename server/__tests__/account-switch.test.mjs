import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../platform/data-v2.js'), 'utf8');
const authSource = source.slice(source.indexOf('const Auth = {'), source.indexOf('// ─── FEEDBACK NOTIFICATIONS'))
  .replace('const Auth = {', 'globalThis.Auth = {');
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function load(fetch, locks) {
  const context = {
    API_BASE: 'https://api.example.test', navigator: { locks },
    localStorage: storage({ hp_user: '{"email":"first@example.test"}', fav_recipes_first: 'preserve' }),
    sessionStorage: storage({ hp_st: 'old-access', 'smartplate.login.pending.v1.email': 'old-code', 'smartplate.oauth.pending.v1': 'old-oauth' }),
    clearContentCache: vi.fn(), Plate: { clear: vi.fn() }, _fetchWithTimeout: fetch,
    clearInterval: vi.fn(), setInterval: vi.fn(() => 9), globalThis: null
  };
  context.globalThis = context;
  vm.runInNewContext(authSource, context);
  return context;
}
describe('explicit account switch', () => {
  it('waits for refresh and successful cookie revocation before clearing the account', async () => {
    let releaseRefresh, finishLogout;
    const events = [];
    const fetch = vi.fn(() => { events.push('logout'); return new Promise(resolve => { finishLogout = resolve; }); });
    const lock = vi.fn(async (name, options, callback) => { events.push(name); return callback(); });
    const state = load(fetch, { request: lock });
    state.Auth._refreshInFlight = new Promise(resolve => { releaseRefresh = resolve; });
    const switching = state.Auth.switchAccount();
    expect(fetch).not.toHaveBeenCalled();
    releaseRefresh(true);
    await vi.waitFor(() => expect(events).toEqual(['smartplate-auth-refresh', 'logout']));
    expect(state.localStorage.getItem('hp_user')).not.toBeNull();
    finishLogout({ ok: true });
    expect(await switching).toBe(true);
    expect(fetch).toHaveBeenCalledWith('https://api.example.test/auth/logout', { method: 'POST', credentials: 'include' }, 8000);
    expect(state.localStorage.getItem('hp_user')).toBeNull();
    expect(state.sessionStorage.getItem('hp_st')).toBeNull();
    expect(state.sessionStorage.getItem('smartplate.login.pending.v1.email')).toBeNull();
    expect(state.sessionStorage.getItem('smartplate.oauth.pending.v1')).toBeNull();
    expect(state.localStorage.getItem('fav_recipes_first')).toBe('preserve');
    expect(state.Plate.clear).toHaveBeenCalledOnce();
  });
  it.each(['http', 'network', 'lock'])('keeps the current account on %s failure and permits retry', async failure => {
    const fetch = vi.fn(async () => { if (failure === 'network') throw Error('offline'); return { ok: false }; });
    const locks = failure === 'lock' ? { request: async () => { throw Error('lock unavailable'); } } : null;
    const state = load(fetch, locks);
    state.Auth._refreshTimer = 7;
    expect(await state.Auth.switchAccount()).toBe(false);
    expect(state.localStorage.getItem('hp_user')).not.toBeNull();
    expect(state.sessionStorage.getItem('hp_st')).toBe('old-access');
    expect(state.clearContentCache).not.toHaveBeenCalled();
    expect(state.Auth._refreshTimer).toBe(9);
    state.navigator.locks = null;
    fetch.mockResolvedValue({ ok: true });
    expect(await state.Auth.switchAccount()).toBe(true);
    expect(state.localStorage.getItem('hp_user')).toBeNull();
  });
});
