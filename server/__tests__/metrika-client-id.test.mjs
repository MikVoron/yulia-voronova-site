import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const metrikaSource = fs.readFileSync(new URL('../../platform/metrika.js', import.meta.url), 'utf8');
const loginSource = fs.readFileSync(new URL('../../platform/login.js', import.meta.url), 'utf8');
const clientId = '1710232430899999999';

function browser() {
  const elements = new Map();
  const callbacks = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'email-input' ? 'test@example.com' : id === 'code-input' ? '123456' : '',
      dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, focus() {}, setAttribute() {}
    });
    return elements.get(id);
  };
  const fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'test response' }) }));
  const context = vm.createContext({
    setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    location: { search: '' }, API_BASE: 'https://api.test', fetch,
    Auth: { isLoggedIn: () => false, login: vi.fn(), api: fetch },
    document: {
      head: { appendChild() {} }, getElementById: element, querySelector: () => null,
      addEventListener() {}, createElement: () => ({})
    },
    requestAnimationFrame: fn => fn(),
    ym: vi.fn((counter, method, callback) => {
      if (method === 'getClientID') callbacks.push(callback);
    })
  });
  context.window = context;
  vm.runInContext(metrikaSource, context);
  return { context, callbacks, fetch, loadLogin: () => vm.runInContext(loginSource, context) };
}

describe('registration with delayed or unavailable Metrika', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a ClientID that arrives after the original timeout', async () => {
    const b = browser();
    const first = b.context.SmartPlateMetrika.getClientId();
    await vi.advanceTimersByTimeAsync(1500);
    await expect(first).resolves.toBeNull();
    b.callbacks[0](clientId);
    await expect(b.context.SmartPlateMetrika.getClientId()).resolves.toBe(clientId);
    expect(b.callbacks).toHaveLength(1);
  });

  it('waits for the ClientID before requesting a code and avoids parallel submissions', async () => {
    const b = browser();
    b.loadLogin();
    b.fetch.mockClear();
    const request = b.context.sendCode();
    const duplicate = b.context.sendCode();
    expect(b.fetch).not.toHaveBeenCalled();
    b.callbacks.at(-1)(clientId);
    await Promise.all([request, duplicate]);
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(b.fetch.mock.calls[0][1].body).metrikaClientId).toBe(clientId);
  });

  it('requests the ClientID again before verification after earlier attempts timed out', async () => {
    const b = browser();
    b.loadLogin();
    await vi.advanceTimersByTimeAsync(1500);
    b.fetch.mockClear();
    b.context.currentEmail = 'test@example.com';
    const request = b.context.verifyCode();
    const duplicate = b.context.verifyCode();
    expect(b.fetch).not.toHaveBeenCalled();
    b.callbacks.at(-1)(clientId);
    await Promise.all([request, duplicate]);
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(b.fetch.mock.calls[0][0]).toBe('https://api.test/auth/verify');
    expect(JSON.parse(b.fetch.mock.calls[0][1].body).metrikaClientId).toBe(clientId);
  });

  it('passes a late cached ClientID when resending a code', async () => {
    const b = browser();
    b.loadLogin();
    await vi.advanceTimersByTimeAsync(1500);
    b.callbacks[0](clientId);
    b.fetch.mockClear();
    b.context.currentEmail = 'test@example.com';
    await b.context.resendCode();
    expect(JSON.parse(b.fetch.mock.calls[0][1].body).metrikaClientId).toBe(clientId);
  });

  it('still verifies a code when Metrika is blocked', async () => {
    const b = browser();
    b.loadLogin();
    b.fetch.mockClear();
    b.context.currentEmail = 'test@example.com';
    const request = b.context.verifyCode();
    await vi.advanceTimersByTimeAsync(1500);
    await request;
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(b.fetch.mock.calls[0][1].body).metrikaClientId).toBeNull();
  });

  it('preserves browser goal fallback and does not duplicate a queued registration', async () => {
    for (const queued of [false, true]) {
      const b = browser();
      b.loadLogin();
      b.callbacks[0](clientId);
      b.context.currentEmail = 'test@example.com';
      b.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
        isNew: true, metrikaGoals: { registration_completed: queued },
        user: { id: 'test-user', email: 'test@example.com' }, accessToken: 'test-token'
      }) });
      await b.context.verifyCode();
      const goals = b.context.ym.mock.calls.filter(([, method, goal]) => method === 'reachGoal' && goal === 'registration_completed');
      expect(goals).toHaveLength(queued ? 0 : 1);
      expect(b.context.Auth.login).toHaveBeenCalledTimes(1);
    }
  });
});
