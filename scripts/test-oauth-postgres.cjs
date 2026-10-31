'use strict';
// Uses only the disposable cluster created by the companion runner. No .env.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const socket = process.env.OAUTH_TEST_SOCKET || '';
if (!/^\/tmp\/smartplate-oauth-test\.[A-Za-z0-9]+\/socket$/.test(socket)) throw Error('Disposable socket required');
const db = new Pool({ host: socket, port: 59477, user: 'smartplate-admin', database: 'postgres', max: 8 });
const accountFile = path.resolve(process.argv[2]);
const routeFile = path.resolve(process.argv[3]);
const originalLoad = Module._load;
const trialCalls = [];
const sessions = [];
const notifications = [];
let fixture = {};
Object.assign(process.env, { VK_APP_ID: '54502528', VK_OAUTH_ENABLED: 'true', VK_ONETAP_ENABLED: 'true', YANDEX_CLIENT_ID: 'test-app', YANDEX_CLIENT_SECRET: 'isolated-secret', YANDEX_OAUTH_ENABLED: 'true' });
const routeMocks = {
  '../auth': { generateRefreshToken: () => crypto.randomBytes(24).toString('hex') },
  '../refresh-sessions': { issueRefreshSession: async id => { sessions.push(id); return 'isolated-session'; } },
  '../email': { sendWelcome: async () => {}, sendNewUserNotification: async user => { notifications.push(user); } },
  '../trial-guard': { tryGrantTrial: async (...args) => { trialCalls.push(args); return { grant: true }; } },
  '../trial-monitor': { reportTrialSignals() {} },
  '../audit': { log: async () => {} }
};
Module._load = function(request, parent, isMain) {
  if (parent?.filename === accountFile && request === './db') return { pool: db };
  if (parent?.filename === routeFile && request === '../oauth-accounts') return require(accountFile);
  if (parent?.filename === routeFile && Object.hasOwn(routeMocks, request)) return routeMocks[request];
  return originalLoad.call(this, request, parent, isMain);
};
global.fetch = async (url, options) => {
  const vk = url.includes('id.vk.ru');
  if (url.endsWith('/oauth2/auth') || url.endsWith('/token')) {
    return { ok: true, json: async () => ({ access_token: 'isolated-access', state: options.body.get('state') }) };
  }
  return { ok: true, json: async () => vk
    ? { user: { user_id: fixture.vkId || 42, email: fixture.email, first_name: 'Provider' } }
    : { id: fixture.yandexId || '123456789', default_email: fixture.email, display_name: 'Provider name' } };
};
const { resolveOAuthAccount } = require(accountFile);
const app = require('fastify')({ logger: false });
const reports = [];

async function reset() {
  await db.query('TRUNCATE users CASCADE');
  sessions.length = 0; trialCalls.length = 0; notifications.length = 0;
  fixture = { email: 'reaom@yandex.ru' };
}

async function seed(status = 'active', role = 'user', blocked = false) {
  const user = (await db.query(
    'INSERT INTO users(email,display_name,avatar,weight_kg,role,is_blocked,newsletter_subscribed) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *',
    ['reaom@yandex.ru', 'Existing name', 'existing-avatar', 63, role, blocked]
  )).rows[0];
  await db.query("INSERT INTO auth_accounts VALUES ($1,'email',$2)", [user.id, user.email]);
  await db.query("INSERT INTO subscriptions(user_id,status,expires_at) VALUES ($1,$2,'2027-03-01T00:00:00Z')", [user.id, status]);
  await db.query('INSERT INTO payments VALUES ($1,999)', [user.id]);
  await db.query("INSERT INTO favorites VALUES ($1,'existing-recipe')", [user.id]);
  await db.query("INSERT INTO notes VALUES ($1,'existing-note')", [user.id]);
  return user;
}

async function snapshot() {
  const result = {};
  for (const table of ['users', 'subscriptions', 'payments', 'favorites', 'notes']) {
    const order = table === 'users' ? 'id' : 'user_id';
    result[table] = (await db.query('SELECT * FROM ' + table + ' ORDER BY ' + order)).rows;
  }
  return result;
}

async function login(provider = 'yandex', widget = false) {
  const start = await app.inject({ method: 'GET', url: '/auth/oauth/' + provider + (widget ? '/config' : '') + '?fingerprint=' + 'a'.repeat(64) });
  assert.equal(start.statusCode, widget ? 200 : 302);
  const state = widget ? start.json().state : new URL(start.headers.location).searchParams.get('state');
  return app.inject({ method: 'GET', url: '/auth/oauth/' + provider + '/callback?' + new URLSearchParams({ code: 'isolated-code', state, device_id: 'isolated-device' }),
    cookies: Object.fromEntries(start.cookies.filter(c => c.value).map(c => [c.name, c.value])) });
}

(async () => {
  try {
    await db.query(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,avatar text,weight_kg numeric,role text DEFAULT 'user',is_blocked boolean DEFAULT false,newsletter_subscribed boolean DEFAULT true,created_at timestamptz DEFAULT now());
      CREATE TABLE auth_accounts(user_id uuid REFERENCES users(id) ON DELETE CASCADE,provider text,provider_id text CHECK(provider_id <> 'fail'),UNIQUE(provider,provider_id));
      CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,status text,expires_at timestamptz);
      CREATE TABLE payments(user_id uuid REFERENCES users(id) ON DELETE CASCADE,amount numeric);
      CREATE TABLE favorites(user_id uuid REFERENCES users(id) ON DELETE CASCADE,recipe_id text);
      CREATE TABLE notes(user_id uuid REFERENCES users(id) ON DELETE CASCADE,body text);`);
    await app.register(require('@fastify/cookie'));
    await app.register(require(routeFile));
    await app.ready();

    for (const status of ['active', 'trial', 'expired']) {
      await reset();
      const user = await seed(status);
      const before = await snapshot();
      fixture.email = 'Reaom@Yandex.Ru';
      assert.match((await login()).headers.location, /auth-callback.html$/);
      assert.equal(sessions[0], user.id);
      assert.deepEqual(await snapshot(), before);
      assert.equal(trialCalls.length, 0);
      assert.equal(notifications.length, 0);
      assert.equal((await db.query("SELECT user_id FROM auth_accounts WHERE provider='yandex'")).rows[0].user_id, user.id);
      assert.match((await login()).headers.location, /auth-callback.html$/);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 1);
      assert.equal((await db.query("SELECT count(*)::int AS count FROM auth_accounts WHERE provider='yandex'")).rows[0].count, 1);
      assert.deepEqual(await snapshot(), before);
      reports.push('existing_' + status + '_same_identity_and_unchanged_data');
    }

    await reset();
    const existing = await seed();
    const before = await snapshot();
    const results = await Promise.all(Array.from({ length: 8 }, () => login()));
    assert.ok(results.every(r => r.headers.location.endsWith('/auth-callback.html')));
    assert.ok(sessions.every(id => id === existing.id));
    assert.deepEqual(await snapshot(), before);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM auth_accounts WHERE provider='yandex'")).rows[0].count, 1);
    assert.equal(trialCalls.length, 0);
    reports.push('eight_parallel_existing_logins_no_duplicate_or_trial');

    await reset();
    const newResults = await Promise.all(Array.from({ length: 8 }, () => login()));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 1);
    assert.equal(newResults.filter(r => r.headers.location.includes('welcome=1')).length, 1);
    assert.equal(trialCalls.length, 1);
    assert.equal(trialCalls[0][0], 'a'.repeat(64));
    reports.push('eight_parallel_new_logins_one_account_and_one_trial_request');

    await reset();
    const both = await Promise.all([login('vk'), login('yandex')]);
    assert.ok(both.every(r => r.statusCode === 302));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 1);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM auth_accounts')).rows[0].count, 2);
    assert.equal(trialCalls.length, 1);
    reports.push('parallel_vk_yandex_same_email_one_account');

    await reset();
    const oneTapUser = await seed();
    const oneTapBefore = await snapshot();
    const oneTapResults = await Promise.all(Array.from({ length: 8 }, () => login('vk', true)));
    assert.ok(oneTapResults.every(r => r.headers.location.endsWith('/auth-callback.html')));
    assert.ok(sessions.every(id => id === oneTapUser.id));
    assert.deepEqual(await snapshot(), oneTapBefore);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM auth_accounts WHERE provider='vk'")).rows[0].count, 1);
    assert.equal(trialCalls.length, 0);
    reports.push('eight_parallel_onetap_logins_preserve_paid_account');

    for (const [role, blocked] of [['user', true], ['admin', false]]) {
      await reset();
      await seed('active', role, blocked);
      const before = await snapshot();
      assert.match((await login()).headers.location, new RegExp('error=' + (blocked ? 'blocked' : 'admin_mfa_required')));
      assert.deepEqual(await snapshot(), before);
      assert.equal((await db.query("SELECT count(*)::int AS count FROM auth_accounts WHERE provider='yandex'")).rows[0].count, 0);
      assert.equal(sessions.length, 0);
      reports.push('no_new_link_or_session_for_' + (blocked ? 'blocked' : 'admin'));
    }

    await reset();
    fixture.email = undefined;
    assert.match((await login()).headers.location, /error=oauth_email_required/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
    reports.push('first_login_without_email_creates_no_user');

    await reset();
    const linked = await seed();
    await db.query("INSERT INTO auth_accounts VALUES($1,'yandex','123456789')", [linked.id]);
    fixture.email = undefined;
    assert.match((await login()).headers.location, /auth-callback.html$/);
    assert.equal(sessions[0], linked.id);
    reports.push('linked_account_still_works_without_new_email_grant');

    await reset();
    await assert.rejects(resolveOAuthAccount('yandex', 'fail', 'rollback@example.test', 'Test', true));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
    reports.push('failed_identity_insert_rolls_back_new_user');

    console.log(JSON.stringify({ marker: 'OAUTH_POSTGRES_OK', count: reports.length, reports, productionDatabaseUsed: false, realProviderCalls: false, realMailSent: false }));
  } finally {
    await app.close();
    await db.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
