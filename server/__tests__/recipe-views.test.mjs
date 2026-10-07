import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'recipe-views-test-secret-with-at-least-32-bytes';
const query = vi.fn();
const dbPath = require.resolve('../src/db');
const mock = new Module(dbPath);
mock.exports = { query };
mock.loaded = true;
require.cache[dbPath] = mock;
const { requireAdmin } = require('../src/middleware');
const { createAdminRouteGuard } = require('../src/admin-route-guard');
let app;
let role;
let blocked;
let access;
let subscription;
let published;
let email;
const eventId = '11111111-1111-4111-8111-111111111111';
const visitorId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const payload = { event_id: eventId, visitor_id: visitorId, recipe_id: 'recipe-1', view_mode: 'full' };
function token() { return jwt.sign({ sub: userId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' }); }
function post(body = payload, headers = {}) { return app.inject({ method: 'POST', url: '/content/recipe-views', payload: body, headers }); }
function inserts() { return query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO recipe_views')); }

beforeAll(async () => {
    app = require('fastify')({ logger: false });
    app.addHook('onRoute', createAdminRouteGuard(requireAdmin));
    await app.register(require('../src/routes/recipe-views'));
    await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
    role = 'user'; blocked = false; access = 'free'; subscription = null; published = true;
    email = 'reader@example.com';
    query.mockReset();
    query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT is_blocked')) return { rows: [{ is_blocked: blocked }] };
        if (sql.includes('SELECT role')) return { rows: [{ role }] };
        if (sql.includes('SELECT email')) return { rows: [{ email }] };
        if (sql.includes('FROM subscriptions')) return { rows: subscription ? [subscription] : [] };
        if (sql.includes('SELECT id, access_level')) return { rows: published ? [{ id: 'recipe-1', access_level: access, is_free: false }] : [] };
        if (sql.includes('first_recorded_at')) return { rows: [{ first_recorded_at: null }] };
        return { rows: [] };
    });
});

describe('recipe view API', () => {
    it('records a guest opening using a browser ID without an account', async () => {
        expect((await post()).statusCode).toBe(204);
        expect(inserts()[0][1]).toEqual([eventId, 'recipe-1', null, visitorId, 'full']);
        expect(inserts()[0][0]).toContain('ON CONFLICT (event_id) DO NOTHING');
    });
    it('resolves account identity from a verified token, ignoring a client-supplied user ID', async () => {
        expect((await post({ ...payload, user_id: 'forged' }, { authorization: 'Bearer ' + token() })).statusCode).toBe(204);
        expect(inserts()[0][1]).toEqual([eventId, 'recipe-1', userId, null, 'full']);
    });
    it('excludes admins according to the database role', async () => {
        role = 'admin';
        expect((await post(payload, { authorization: 'Bearer ' + token() })).statusCode).toBe(204);
        expect(inserts()).toHaveLength(0);
    });
    it.each(['voronova,yulia@gmail.com', 'voronova.yulia@gmail.com', ' VORONOVA.YULIA@GMAIL.COM '])('excludes the owner account %s even with a regular user role', async (address) => {
        email = address;
        expect((await post(payload, { authorization: 'Bearer ' + token() })).statusCode).toBe(204);
        expect(inserts()).toHaveLength(0);
    });
    it('does not let a client-supplied owner email suppress an ordinary account view', async () => {
        expect((await post({ ...payload, email: 'voronova.yulia@gmail.com' }, { authorization: 'Bearer ' + token() })).statusCode).toBe(204);
        expect(inserts()).toHaveLength(1);
    });
    it('does not downgrade expired/invalid authentication into a guest view', async () => {
        expect((await post(payload, { authorization: 'Bearer expired' })).statusCode).toBe(401);
        expect(inserts()).toHaveLength(0);
    });
    it('does not record blocked accounts', async () => {
        blocked = true;
        expect((await post(payload, { authorization: 'Bearer ' + token() })).statusCode).toBe(403);
        expect(inserts()).toHaveLength(0);
    });
    it('records a locked preview and ignores a false full-content claim', async () => {
        access = 'pro';
        expect((await post()).statusCode).toBe(204);
        expect(inserts()).toHaveLength(0);
        expect((await post({ ...payload, view_mode: 'preview' })).statusCode).toBe(204);
        expect(inserts()[0][1][4]).toBe('preview');
    });
    it('uses active subscription access when classifying full openings', async () => {
        access = 'pro'; subscription = { status: 'active', active_until: new Date(Date.now() + 60000) };
        expect((await post(payload, { authorization: 'Bearer ' + token() })).statusCode).toBe(204);
        expect(inserts()[0][1][4]).toBe('full');
    });
    it('does not collect draft or missing recipes', async () => {
        published = false;
        expect((await post()).statusCode).toBe(404);
        expect(inserts()).toHaveLength(0);
    });
    it('ignores common crawler requests', async () => {
        expect((await post(payload, { 'user-agent': 'Googlebot' })).statusCode).toBe(204);
        expect(inserts()).toHaveLength(0);
    });
    it.each([
        { ...payload, recipe_id: '../recipe' }, { ...payload, event_id: 'invalid' },
        { ...payload, visitor_id: null }, { ...payload, view_mode: 'other' }
    ])('rejects malformed identifiers or modes', async (body) => {
        expect((await post(body)).statusCode).toBe(400);
        expect(inserts()).toHaveLength(0);
    });
    it('keeps reports private and does not trust the role inside a JWT', async () => {
        expect((await app.inject('/admin/recipe-views')).statusCode).toBe(401);
        expect((await app.inject({ url: '/admin/recipe-views', headers: { authorization: 'Bearer ' + token() } })).statusCode).toBe(403);
    });
    it.each([['7', 7], ['30', 30], ['all', null]])('passes period %s as a bound SQL parameter', async (period, days) => {
        role = 'admin';
        const response = await app.inject({ url: '/admin/recipe-views?period=' + period, headers: { authorization: 'Bearer ' + token() } });
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.json()).toEqual({ period, firstRecordedAt: null, recipes: [] });
        expect(query.mock.calls.find(([sql]) => sql.includes('WITH views AS'))[1]).toEqual([days, ['voronova,yulia@gmail.com', 'voronova.yulia@gmail.com']]);
        expect(query.mock.calls.find(([sql]) => sql.includes('first_recorded_at'))[1]).toEqual([['voronova,yulia@gmail.com', 'voronova.yulia@gmail.com']]);
    });
    it('rejects arbitrary report periods', async () => {
        role = 'admin';
        const response = await app.inject({ url: '/admin/recipe-views?period=100', headers: { authorization: 'Bearer ' + token() } });
        expect(response.statusCode).toBe(400);
    });
});
