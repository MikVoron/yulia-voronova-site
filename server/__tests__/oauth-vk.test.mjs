import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const cookie = require('@fastify/cookie');
const savedModules = new Map();
const envNames = ['VK_APP_ID', 'VK_APP_SECRET', 'VK_OAUTH_ENABLED', 'VK_ONETAP_ENABLED', 'YANDEX_CLIENT_ID', 'YANDEX_CLIENT_SECRET', 'YANDEX_OAUTH_ENABLED'];
const savedEnv = new Map(envNames.map(name => [name, process.env[name]]));
const account = { id: 12, email: 'existing@example.test', role: 'user', is_blocked: false };
const query = vi.fn(async () => ({ rows: [account] }));
const transactionQuery = vi.fn(async (sql, parameters) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) || sql.includes('pg_advisory_xact_lock')
  ? { rows: [] } : query(sql, parameters));
const issueSession = vi.fn(async () => 'test-session');
const auditLog = vi.fn(async () => {});
const trial = vi.fn(async () => ({ grant: true }));
const sendWelcome = vi.fn(async () => {});
const sendNotification = vi.fn(async () => {});
let app;

function mockModule(relativePath, exports) {
  const id = require.resolve(relativePath);
  savedModules.set(id, require.cache[id]);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

beforeAll(async () => {
  Object.assign(process.env, {
    VK_APP_ID: '54502528', VK_OAUTH_ENABLED: 'true',
    YANDEX_CLIENT_ID: 'test-yandex-app', YANDEX_CLIENT_SECRET: 'test-yandex-secret', YANDEX_OAUTH_ENABLED: 'true'
  });
  delete process.env.VK_APP_SECRET;
  mockModule('../src/db.js', { query, pool: { connect: async () => ({ query: transactionQuery, release() {} }) } });
  mockModule('../src/auth.js', { generateRefreshToken: () => 'test-refresh' });
  mockModule('../src/refresh-sessions.js', { issueRefreshSession: issueSession });
  mockModule('../src/email.js', { sendWelcome, sendNewUserNotification: sendNotification });
  mockModule('../src/trial-guard.js', { tryGrantTrial: trial });
  mockModule('../src/trial-monitor.js', { reportTrialSignals: vi.fn() });
  mockModule('../src/audit.js', { log: auditLog });
  const routeId = require.resolve('../src/routes/oauth.js');
  const accountId = require.resolve('../src/oauth-accounts.js');
  savedModules.set(accountId, require.cache[accountId]);
  delete require.cache[accountId];
  savedModules.set(routeId, require.cache[routeId]);
  delete require.cache[routeId];
  app = Fastify();
  await app.register(cookie);
  await app.register(require('../src/routes/oauth.js'));
  await app.ready();
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VK_OAUTH_ENABLED = 'true';
  process.env.VK_ONETAP_ENABLED = 'false';
  process.env.YANDEX_OAUTH_ENABLED = 'true';
  query.mockResolvedValue({ rows: [account] });
  vi.stubGlobal('fetch', vi.fn());
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllGlobals();
  for (const [id, entry] of savedModules) {
    if (entry) require.cache[id] = entry;
    else delete require.cache[id];
  }
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function startVk(fingerprint) {
  const response = await app.inject({ method: 'GET', url: '/auth/oauth/vk' + (fingerprint ? '?fingerprint=' + encodeURIComponent(fingerprint) : '') });
  const url = new URL(response.headers.location);
  return {
    response, url,
    cookies: Object.fromEntries(response.cookies.map(c => [c.name, c.value])),
    state: url.searchParams.get('state')
  };
}

function callback(flow, parameters = {}, cookies = flow.cookies) {
  const queryString = new URLSearchParams({ code: 'test-code', state: flow.state, device_id: 'test-device', ...parameters });
  return app.inject({ method: 'GET', url: '/auth/oauth/vk/callback?' + queryString, cookies });
}

function providerResponses(state, profile = { user: { user_id: 42 } }) {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-access', state }) });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => profile });
}

describe('VK ID authorization code flow', () => {
  it('uses a fresh SHA-256 challenge and a short-lived private verifier cookie', async () => {
    const first = await startVk();
    const second = await startVk();
    expect(first.url.origin).toBe('https://id.vk.ru');
    expect(first.url.searchParams.get('code_challenge_method')).toBe('s256');
    expect(first.cookies.oauth_pkce_vk).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(first.cookies.oauth_pkce_vk).digest('base64url')
    );
    expect(first.url.searchParams.has('code_verifier')).toBe(false);
    expect(first.url.searchParams.has('client_secret')).toBe(false);
    expect(first.cookies.oauth_pkce_vk).not.toBe(second.cookies.oauth_pkce_vk);
    expect(first.state).not.toBe(second.state);
    const verifierCookie = first.response.headers['set-cookie'].find(c => c.startsWith('oauth_pkce_vk='));
    expect(verifierCookie).toContain('Path=/auth/oauth/vk/callback');
    expect(verifierCookie).toContain('HttpOnly');
    expect(verifierCookie).toContain('Secure');
    expect(verifierCookie).toContain('SameSite=Lax');
    expect(verifierCookie).toContain('Max-Age=600');
  });

  it('exchanges the original verifier, state and device ID before issuing a session', async () => {
    const flow = await startVk();
    providerResponses(flow.state);
    const response = await callback(flow);
    expect(fetch).toHaveBeenNthCalledWith(1, 'https://id.vk.ru/oauth2/auth', expect.any(Object));
    const body = fetch.mock.calls[0][1].body;
    expect(body.get('code_verifier')).toBe(flow.cookies.oauth_pkce_vk);
    expect(body.get('state')).toBe(flow.state);
    expect(body.get('device_id')).toBe('test-device');
    expect(body.has('client_secret')).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT u.* FROM auth_accounts'), ['vk', '42']);
    expect(issueSession).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toMatch(/\/auth-callback.html$/);
    expect(response.cookies.find(c => c.name === 'refreshToken').value).toBe('test-refresh');
    expect(response.cookies.find(c => c.name === 'oauth_pkce_vk').maxAge).toBe(0);
  });

  it('reports the public VK app ready without a protected key', async () => {
    expect(process.env.VK_APP_SECRET).toBeUndefined();
    const response = await app.inject({ method: 'GET', url: '/auth/oauth/providers' });
    expect(response.json().vk).toBe(true);
  });

  it('carries the browser signal into the trial guard for a new user', async () => {
    const fingerprint = 'a'.repeat(64);
    const flow = await startVk(fingerprint);
    providerResponses(flow.state, { user: { user_id: 42, email: 'New@Example.Test' } });
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...account, email: 'new@example.test' }] }).mockResolvedValueOnce({ rows: [] });
    const response = await callback(flow);
    expect(response.headers.location).toContain('welcome=1');
    expect(trial).toHaveBeenCalledWith(fingerprint, expect.any(String), account.id);
    expect(sendWelcome).toHaveBeenCalledWith('new@example.test', true);
    expect(response.cookies.find(c => c.name === 'oauth_fp_vk').maxAge).toBe(0);
  });

  it('does not substitute an identity when the browser signal is invalid', async () => {
    const flow = await startVk('invalid');
    expect(flow.cookies.oauth_fp_vk).toBe('');
    providerResponses(flow.state, { user: { user_id: 42, email: 'new@example.test' } });
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [account] }).mockResolvedValueOnce({ rows: [] });
    await callback(flow);
    expect(trial).toHaveBeenCalledWith(null, expect.any(String), account.id);
  });

  it('does not create a separate account on first login without email', async () => {
    const flow = await startVk();
    providerResponses(flow.state);
    query.mockResolvedValue({ rows: [] });
    const response = await callback(flow);
    expect(response.headers.location).toContain('error=oauth_email_required');
    expect(query.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false);
    expect(trial).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it.each(['missing verifier', 'malformed verifier', 'missing device', 'wrong state'])('rejects %s before contacting VK', async problem => {
    const flow = await startVk();
    if (problem === 'missing verifier') delete flow.cookies.oauth_pkce_vk;
    if (problem === 'malformed verifier') flow.cookies.oauth_pkce_vk = 'too-short';
    const response = await callback(flow, problem === 'missing device' ? { device_id: '' } : problem === 'wrong state' ? { state: 'wrong' } : {});
    expect(response.headers.location).toContain('error=');
    expect(fetch).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('clears temporary cookies after a cancelled login', async () => {
    const flow = await startVk();
    const response = await callback(flow, { code: '', error: 'access_denied' });
    expect(response.headers.location).toContain('error=no_code');
    expect(response.cookies.find(c => c.name === 'oauth_pkce_vk').maxAge).toBe(0);
    expect(response.cookies.find(c => c.name === 'oauth_state_vk').maxAge).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops a pending login if VK is disabled before the callback', async () => {
    const flow = await startVk();
    process.env.VK_OAUTH_ENABLED = 'false';
    expect((await callback(flow)).statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a token response for another state before querying a user profile', async () => {
    const flow = await startVk();
    providerResponses('different-state');
    const response = await callback(flow);
    expect(response.headers.location).toContain('error=vk_token');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it.each([null, {}, { access_token: 42 }])('rejects a missing or non-string VK access token: %j', async token => {
    const flow = await startVk();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => token && { ...token, state: flow.state } });
    expect((await callback(flow)).headers.location).toContain('error=vk_token');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects an error profile without creating an account', async () => {
    const flow = await startVk();
    providerResponses(flow.state, { error: 'invalid_token' });
    const response = await callback(flow);
    expect(response.headers.location).toContain('error=vk_profile');
    expect(query).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it.each(['blocked', 'admin'])('does not issue an OAuth session to an %s account', async type => {
    const flow = await startVk();
    providerResponses(flow.state);
    query.mockResolvedValue({ rows: [{ ...account, is_blocked: type === 'blocked', role: type === 'admin' ? 'admin' : 'user' }] });
    const response = await callback(flow);
    expect(response.headers.location).toContain(type === 'blocked' ? 'error=blocked' : 'error=admin_mfa_required');
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('stops a pending Yandex login if the provider is disabled', async () => {
    process.env.YANDEX_OAUTH_ENABLED = 'false';
    const response = await app.inject({
      method: 'GET', url: '/auth/oauth/yandex/callback?code=test-code&state=test-state',
      cookies: { oauth_state_yandex: 'test-state' }
    });
    expect(response.statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('VK One Tap server context', () => {
  async function config() {
    process.env.VK_ONETAP_ENABLED = 'true';
    const response = await app.inject({ method: 'GET', url: '/auth/oauth/vk/config?fingerprint=' + 'b'.repeat(64) });
    return { response, ...response.json(), cookies: Object.fromEntries(response.cookies.map(c => [c.name, c.value])) };
  }

  it('keeps the widget disabled until separately enabled', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/oauth/vk/config' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: '/auth/oauth/providers' })).json().vkOneTap).toBe(false);
  });

  it('exposes the public challenge and keeps the verifier in a private cookie', async () => {
    const flow = await config();
    expect(flow.appId).toBe(54502528);
    expect(flow.response.headers['cache-control']).toBe('no-store');
    const value = flow.cookies['oauth_widget_vk_' + flow.state];
    const [verifier, fingerprint] = value.split('.');
    expect(fingerprint).toBe('b'.repeat(64));
    expect(flow.codeChallenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(flow.response.body).not.toContain(verifier);
    expect(flow.response.body).not.toContain('codeVerifier');
    const cookieHeader = [flow.response.headers['set-cookie']].flat().join(';');
    expect(cookieHeader).toContain('HttpOnly');
    expect(cookieHeader).toContain('Secure');
  });

  it('uses the same account resolution and session as the ordinary callback', async () => {
    const flow = await config();
    providerResponses(flow.state);
    const response = await callback(flow);
    expect(response.headers.location).toMatch(/\/auth-callback.html$/);
    expect(fetch.mock.calls[0][1].body.get('code_verifier')).toBe(flow.cookies['oauth_widget_vk_' + flow.state].split('.')[0]);
    expect(issueSession.mock.calls[0][0]).toBe(account.id);
    expect(trial).not.toHaveBeenCalled();
  });

  it('uses different cookies for widgets in parallel tabs', async () => {
    const first = await config();
    const second = await config();
    expect(Object.keys(first.cookies)).not.toEqual(Object.keys(second.cookies));
    providerResponses(first.state);
    const response = await callback(first, {}, { ...first.cookies, ...second.cookies });
    expect(response.headers.location).toMatch(/\/auth-callback.html$/);
    expect(response.cookies.map(c => c.name)).not.toContain('oauth_widget_vk_' + second.state);
  });

  it('rejects a widget callback without its private context cookie', async () => {
    const flow = await config();
    expect((await callback(flow, {}, {})).headers.location).toContain('error=invalid_state');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('can stop a pending widget login without stopping the ordinary VK button', async () => {
    const flow = await config();
    process.env.VK_ONETAP_ENABLED = 'false';
    expect((await callback(flow)).statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'GET', url: '/auth/oauth/vk' })).statusCode).toBe(302);
  });
});

describe('Yandex ID authorization code flow', () => {
  async function startYandex() {
    const response = await app.inject({ method: 'GET', url: '/auth/oauth/yandex' });
    return {
      response,
      state: new URL(response.headers.location).searchParams.get('state'),
      cookies: Object.fromEntries(response.cookies.map(c => [c.name, c.value]))
    };
  }

  function yandexCallback(flow, parameters = {}) {
    const queryString = new URLSearchParams({ code: 'yandex-code', state: flow.state, ...parameters });
    return app.inject({ method: 'GET', url: '/auth/oauth/yandex/callback?' + queryString, cookies: flow.cookies });
  }

  function yandexResponses(profile = { id: '123456789', default_email: 'Existing@Example.Test', display_name: 'Test' }) {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-yandex-access' }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => profile });
  }

  it('uses the configured redirect and keeps the secret out of the authorization URL', async () => {
    const flow = await startYandex();
    const url = new URL(flow.response.headers.location);
    expect(url.origin).toBe('https://oauth.yandex.ru');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.voronova.online/auth/oauth/yandex/callback');
    expect(url.searchParams.get('state')).toBe(flow.cookies.oauth_state_yandex);
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('exchanges the code and logs in an already linked account', async () => {
    const flow = await startYandex();
    yandexResponses();
    const response = await yandexCallback(flow);
    expect(fetch.mock.calls[0][0]).toBe('https://oauth.yandex.ru/token');
    expect(fetch.mock.calls[0][1].body.get('code')).toBe('yandex-code');
    expect(fetch.mock.calls[0][1].body.get('client_secret')).toBe('test-yandex-secret');
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('OAuth test-yandex-access');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SELECT u.* FROM auth_accounts'), ['yandex', '123456789']);
    expect(issueSession).toHaveBeenCalledOnce();
    expect(response.headers.location).toMatch(/\/auth-callback.html$/);
  });

  it('links a matching email to the same user without creating a new user or trial', async () => {
    const flow = await startYandex();
    yandexResponses();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [account] }).mockResolvedValueOnce({ rows: [] });
    const response = await yandexCallback(flow);
    expect(response.headers.location).toMatch(/\/auth-callback.html$/);
    expect(query).toHaveBeenCalledWith('SELECT * FROM users WHERE email=$1 FOR UPDATE', ['existing@example.test']);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth_accounts'), [account.id, 'yandex', '123456789']);
    expect(query.mock.calls.some(([sql]) => /INSERT INTO users|subscriptions/.test(sql))).toBe(false);
    expect(issueSession.mock.calls[0][0]).toBe(account.id);
  });

  it('does not link the administrator account merely because its email matches', async () => {
    const flow = await startYandex();
    yandexResponses();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ ...account, role: 'admin' }] });
    const response = await yandexCallback(flow);
    expect(response.headers.location).toContain('error=');
    expect(query.mock.calls.some(([sql]) => /INSERT/.test(sql))).toBe(false);
    expect(issueSession).not.toHaveBeenCalled();
  });

  it.each([{}, null, { error: 'invalid_token' }, { id: 'undefined' }])('rejects an invalid profile before accessing user records: %j', async profile => {
    const flow = await startYandex();
    yandexResponses(profile);
    const response = await yandexCallback(flow);
    expect(response.headers.location).toContain('error=yandex_profile');
    expect(query).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });

  it('rejects an unsuccessful profile response even if it contains an ID', async () => {
    const flow = await startYandex();
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-access' }) });
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ id: '12345' }) });
    expect((await yandexCallback(flow)).headers.location).toContain('error=yandex_profile');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unsuccessful token response without fetching a profile', async () => {
    const flow = await startYandex();
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ access_token: 'test-access' }) });
    expect((await yandexCallback(flow)).headers.location).toContain('error=yandex_token');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it('clears the state cookie on cancellation', async () => {
    const flow = await startYandex();
    const response = await yandexCallback(flow, { code: '', error: 'access_denied' });
    expect(response.headers.location).toContain('error=no_code');
    expect(response.cookies.find(c => c.name === 'oauth_state_yandex').maxAge).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
