import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../platform/data-v2.js'), 'utf8');
const authStart = source.indexOf('const Auth = {');
const authEnd = source.indexOf('// ─── FEEDBACK NOTIFICATIONS', authStart);
const authSource = source.slice(authStart, authEnd).replace('const Auth = {', 'globalThis.Auth = {');

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createLockManager() {
  let tail = Promise.resolve();
  return {
    request(_name, _options, callback) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      return previous.then(() => Promise.resolve(callback()).finally(release));
    }
  };
}

function createBroadcastChannel() {
  const channels = new Set();
  return class TestBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      channels.add(this);
    }
    postMessage(data) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name && typeof channel.onmessage === 'function') {
          queueMicrotask(() => channel.onmessage({ data }));
        }
      }
    }
  };
}

function loadAuth({ locks, BroadcastChannel, fetchWithTimeout, hostname = 'app.voronova.online' }) {
  let reloads = 0;
  const context = {
    API_BASE: 'https://api.example.test',
    LEGAL_OFFER_ENABLED: false,
    SESSION_MIGRATION_HOST: 'plate.voronova.online',
    BroadcastChannel,
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
    navigator: { locks },
    location: {
      hostname,
      pathname: '/index.html',
      search: '',
      reload() { reloads += 1; }
    },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    setInterval,
    setTimeout,
    clearTimeout,
    clearContentCache() {},
    _fetchWithTimeout: fetchWithTimeout,
    globalThis: null
  };
  context.globalThis = context;
  vm.runInNewContext(authSource, context);
  return {
    auth: context.Auth,
    localStorage: context.localStorage,
    sessionStorage: context.sessionStorage,
    reloadCount: () => reloads
  };
}

describe('cross-tab refresh coordination', () => {
  it('uses one rotating refresh request and gives both tabs the new access token', async () => {
    const locks = createLockManager();
    const BroadcastChannel = createBroadcastChannel();
    let refreshCalls = 0;
    const fetchWithTimeout = async () => {
      refreshCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: true, json: async () => ({ accessToken: 'fresh-access-token' }) };
    };
    const first = loadAuth({ locks, BroadcastChannel, fetchWithTimeout });
    const second = loadAuth({ locks, BroadcastChannel, fetchWithTimeout });

    await Promise.all([first.auth.refreshToken(), second.auth.refreshToken()]);

    expect(refreshCalls).toBe(1);
    expect(first.sessionStorage.getItem('hp_st')).toBe('fresh-access-token');
    expect(second.sessionStorage.getItem('hp_st')).toBe('fresh-access-token');
  });

  it('restores the API session once on plate.voronova.online and reloads as the same user', async () => {
    const fetchWithTimeout = async () => ({
      ok: true,
      json: async () => ({
        accessToken: 'migrated-access-token',
        user: {
          id: 'user-1',
          email: 'subscriber@example.test',
          displayName: 'Subscriber',
          avatar: null,
          weight: 64,
          role: 'user',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      })
    });
    const state = loadAuth({
      locks: createLockManager(),
      BroadcastChannel: createBroadcastChannel(),
      fetchWithTimeout,
      hostname: 'plate.voronova.online'
    });

    expect(await state.auth.waitForDomainSessionMigration()).toBe(true);
    expect(JSON.parse(state.localStorage.getItem('hp_user'))).toMatchObject({
      id: 'user-1',
      email: 'subscriber@example.test',
      name: 'Subscriber',
      role: 'user',
      weight: 64
    });
    expect(state.sessionStorage.getItem('hp_st')).toBe('migrated-access-token');
    expect(state.sessionStorage.getItem('hp_plate_domain_session_checked')).toBe('1');
    expect(state.reloadCount()).toBe(1);
  });

  it('does not run domain migration on the existing app host', async () => {
    let refreshCalls = 0;
    const state = loadAuth({
      locks: createLockManager(),
      BroadcastChannel: createBroadcastChannel(),
      fetchWithTimeout: async () => {
        refreshCalls += 1;
        return { ok: false, status: 401 };
      }
    });

    expect(await state.auth.waitForDomainSessionMigration()).toBe(false);
    expect(refreshCalls).toBe(0);
    expect(state.localStorage.getItem('hp_user')).toBe(null);
    expect(state.reloadCount()).toBe(0);
  });

  it('keeps a plate visitor without an API session in guest mode', async () => {
    let refreshCalls = 0;
    const state = loadAuth({
      locks: createLockManager(),
      BroadcastChannel: createBroadcastChannel(),
      fetchWithTimeout: async () => {
        refreshCalls += 1;
        return { ok: false, status: 401 };
      },
      hostname: 'plate.voronova.online'
    });

    expect(await state.auth.waitForDomainSessionMigration()).toBe(false);
    expect(refreshCalls).toBe(2);
    expect(state.localStorage.getItem('hp_user')).toBe(null);
    expect(state.reloadCount()).toBe(0);
  });
});
