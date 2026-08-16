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

function loadAuth({ locks, BroadcastChannel, fetchWithTimeout }) {
  const context = {
    API_BASE: 'https://api.example.test',
    LEGAL_OFFER_ENABLED: false,
    BroadcastChannel,
    crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
    navigator: { locks },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    setInterval,
    setTimeout,
    clearTimeout,
    _fetchWithTimeout: fetchWithTimeout,
    globalThis: null
  };
  context.globalThis = context;
  vm.runInNewContext(authSource, context);
  return { auth: context.Auth, sessionStorage: context.sessionStorage };
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
});
