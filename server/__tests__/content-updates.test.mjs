import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire, Module } from 'node:module';

const require = createRequire(import.meta.url);
const query = vi.fn();
const dbPath = require.resolve('../src/db.js');
const dbModule = new Module(dbPath);
dbModule.exports = { query };
dbModule.loaded = true;
require.cache[dbPath] = dbModule;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'content-updates-test-secret-at-least-32-bytes';
const jwt = require('jsonwebtoken');
const token = jwt.sign({ sub: 'u-1', email: 'test@example.com', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
const headers = { authorization: 'Bearer ' + token };
let app;
beforeAll(async () => {
    app = require('fastify')({ logger: false });
    await app.register(require('../src/routes/content.js'));
    await app.ready();
});
afterAll(async () => { await app?.close(); });
beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async sql => /SELECT is_blocked/.test(sql)
        ? { rows: [{ is_blocked: false }] } : { rows: [] });
});

describe('content update API', () => {
    it('keeps legacy limits and returns the complete unread list on request', async () => {
        expect((await app.inject({ url: '/content/updates?limit=5', headers })).statusCode).toBe(200);
        expect(query.mock.calls.at(-1)[1]).toEqual(['u-1', 5]);
        query.mockImplementation(async sql => /SELECT is_blocked/.test(sql)
            ? { rows: [{ is_blocked: false }] } : { rows: Array.from({ length: 25 }, (_, i) => ({ id: i + 1 })) });
        const res = await app.inject({ url: '/content/updates?all=1', headers });
        expect(res.json()).toHaveLength(25);
        const [sql, params] = query.mock.calls.at(-1);
        expect(sql).not.toContain('LIMIT');
        expect(params).toEqual(['u-1']);
        expect(sql).toContain('seen.news_id IS NULL');
        expect(sql).toContain('n.created_at >= u.created_at');
    });
    it('requires authentication for both list and batch acknowledgement', async () => {
        expect((await app.inject({ url: '/content/updates?all=1' })).statusCode).toBe(401);
        expect((await app.inject({ method: 'POST', url: '/content/updates/read', payload: { ids: [1] } })).statusCode).toBe(401);
        expect(query).not.toHaveBeenCalled();
    });
    it('writes only the selected published IDs for the signed-in account, idempotently', async () => {
        query.mockImplementation(async sql => /SELECT is_blocked/.test(sql)
            ? { rows: [{ is_blocked: false }] } : { rows: [{ news_id: 1 }, { news_id: 2 }] });
        const res = await app.inject({ method: 'POST', url: '/content/updates/read', headers, payload: { ids: [1, 2, 1] } });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true, read_ids: [1, 2] });
        const [sql, params] = query.mock.calls.at(-1);
        expect(params).toEqual(['u-1', [1, 2]]);
        expect(sql).toContain('n.id = ANY($2::int[]) AND n.is_published = true');
        expect(sql).toContain('u.id = $1 AND n.created_at >= u.created_at');
        expect(sql).toContain('ON CONFLICT (user_id, news_id) DO NOTHING');
    });
    it.each([{}, { ids: [] }, { ids: ['1'] }, { ids: [0] }, { ids: [1.5] }, { ids: [2147483648] }, { ids: Array(501).fill(1) }])('rejects an invalid batch: %j', async payload => {
        const res = await app.inject({ method: 'POST', url: '/content/updates/read', headers, payload });
        expect(res.statusCode).toBe(400);
        expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
    });
});
