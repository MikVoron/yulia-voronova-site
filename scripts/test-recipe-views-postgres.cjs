// Optional isolated PostgreSQL validation; production credentials are never used.
// node scripts/test-recipe-views-postgres.cjs <absolute-path-to-pglite-module>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const { PGlite } = require(path.resolve(process.argv[2]));
const jwt = require(path.join(repo, 'server/node_modules/jsonwebtoken'));
process.env.JWT_SECRET = 'isolated-recipe-views-sql-validation-secret';

async function main() {
    const pg = new PGlite();
    let app;
    try {
        await pg.exec(`
            CREATE ROLE smartplate;
            CREATE TABLE users (id UUID PRIMARY KEY, role TEXT, email TEXT NOT NULL, is_blocked BOOLEAN DEFAULT false);
            CREATE TABLE subscriptions (user_id UUID, status TEXT, trial_ends_at TIMESTAMPTZ, active_until TIMESTAMPTZ);
            CREATE TABLE recipes (id TEXT PRIMARY KEY, name TEXT, access_level TEXT, is_free BOOLEAN, is_published BOOLEAN);
            CREATE TABLE user_favorites (user_id UUID, recipe_id TEXT);
            CREATE TABLE reviews (user_id UUID, recipe_id TEXT);
        `);
        const migration = fs.readFileSync(path.join(repo, 'server/migrations/040_recipe_views.sql'), 'utf8');
        await pg.exec(migration);
        await pg.exec(migration); // Must be safe to reapply.
        const dbPath = require.resolve(path.join(repo, 'server/src/db'));
        const dbModule = new Module(dbPath);
        dbModule.exports = { query: (sql, args) => pg.query(sql, args) };
        dbModule.loaded = true;
        require.cache[dbPath] = dbModule;
        const { requireAdmin } = require(path.join(repo, 'server/src/middleware'));
        app = require(path.join(repo, 'server/node_modules/fastify'))({ logger: false });
        app.addHook('onRoute', require(path.join(repo, 'server/src/admin-route-guard')).createAdminRouteGuard(requireAdmin));
        await app.register(require(path.join(repo, 'server/src/routes/recipe-views')));
        await app.ready();

        const admin = randomUUID(), user = randomUUID(), otherUser = randomUUID();
        const owner = randomUUID(), ownerComma = randomUUID();
        const guest = randomUUID(), otherGuest = randomUUID();
        for (const [id, role, email] of [[admin, 'admin', 'admin@example.com'], [user, 'user', 'reader@example.com'], [otherUser, 'user', 'other@example.com'], [owner, 'user', ' VORONOVA.YULIA@GMAIL.COM '], [ownerComma, 'user', 'voronova,yulia@gmail.com']]) {
            await pg.query('INSERT INTO users (id, role, email) VALUES ($1, $2, $3)', [id, role, email]);
        }
        await pg.exec(`INSERT INTO recipes VALUES
            ('r1', 'Суп', 'free', true, true), ('r2', 'Каша', 'free', true, true),
            ('draft', 'Черновик', 'free', true, false)`);
        async function view(recipe, account, browser, mode, days) {
            await pg.query(`INSERT INTO recipe_views VALUES ($1,$2,$3,$4,$5,now() - make_interval(days => $6))`,
                [randomUUID(), recipe, account, browser, mode, days]);
        }
        await view('r1', user, null, 'full', 2);
        await view('r1', user, null, 'preview', 12);
        await view('r1', user, null, 'full', 40);
        await view('r1', null, guest, 'full', 2);
        await view('r1', null, guest, 'full', 12);
        await view('r1', null, otherGuest, 'preview', 3);
        await view('r1', admin, null, 'full', 1); // Historical admin data must also be excluded.
        await view('r1', owner, null, 'full', 80); // Earliest historical staff view must not affect firstRecordedAt.
        await view('r1', ownerComma, null, 'preview', 1);
        await view('draft', null, guest, 'full', 1);
        for (const id of [admin, user, otherUser]) {
            await pg.query('INSERT INTO user_favorites VALUES ($1,$2)', [id, 'r1']);
            await pg.query('INSERT INTO reviews VALUES ($1,$2)', [id, 'r1']);
        }
        const auth = { authorization: 'Bearer ' + jwt.sign({ sub: admin }, process.env.JWT_SECRET) };
        const expected = {
            '7': { openings: 3, unique_visitors: 3, full_openings: 2, full_visitors: 2, preview_openings: 1, preview_visitors: 1 },
            '30': { openings: 5, unique_visitors: 3, full_openings: 3, full_visitors: 2, preview_openings: 2, preview_visitors: 2 },
            all: { openings: 6, unique_visitors: 3, full_openings: 4, full_visitors: 2, preview_openings: 2, preview_visitors: 2 }
        };
        for (const [period, counts] of Object.entries(expected)) {
            const response = await app.inject({ url: '/admin/recipe-views?period=' + period, headers: auth });
            assert.equal(response.statusCode, 200, response.body);
            const report = response.json();
            assert.equal(report.recipes.length, 2);
            assert.equal(report.recipes[0].id, 'r1');
            for (const [key, value] of Object.entries(counts)) assert.equal(report.recipes[0][key], value, period + ': ' + key);
            assert.equal(report.recipes[0].favorites, 2);
            assert.equal(report.recipes[0].reviews, 2);
            assert.equal(report.recipes[1].openings, 0);
            assert.ok(report.firstRecordedAt);
            assert.ok(Date.parse(report.firstRecordedAt) > Date.now() - 41 * 86400000);
        }
        const event = { event_id: randomUUID(), visitor_id: guest, recipe_id: 'r2', view_mode: 'full' };
        for (let n = 0; n < 2; n++) {
            const response = await app.inject({ method: 'POST', url: '/content/recipe-views', payload: event });
            assert.equal(response.statusCode, 204, response.body);
        }
        assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM recipe_views WHERE recipe_id='r2'")).rows[0].n, 1);
        const ownerResponse = await app.inject({ method: 'POST', url: '/content/recipe-views', payload: { ...event, event_id: randomUUID() },
            headers: { authorization: 'Bearer ' + jwt.sign({ sub: owner }, process.env.JWT_SECRET) } });
        assert.equal(ownerResponse.statusCode, 204, ownerResponse.body);
        assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM recipe_views WHERE user_id=$1', [owner])).rows[0].n, 1);
        await assert.rejects(() => pg.query(`INSERT INTO recipe_views (event_id, recipe_id, user_id, visitor_id, view_mode)
            VALUES ($1, 'r2', $2, $3, 'full')`, [randomUUID(), user, guest]));
        await assert.rejects(() => pg.query(`INSERT INTO recipe_views (event_id, recipe_id, view_mode)
            VALUES ($1, 'r2', 'full')`, [randomUUID()]));
        await pg.query('DELETE FROM users WHERE id=$1', [user]);
        assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM recipe_views WHERE user_id=$1', [user])).rows[0].n, 0);
        await pg.exec("DELETE FROM recipes WHERE id='r2'");
        assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM recipe_views WHERE recipe_id='r2'")).rows[0].n, 0);
        console.log('RECIPE_VIEWS_POSTGRES_OK: migration twice, 7/30/all unique counts, modes, admin/owner/draft exclusion, first recorded date, event deduplication, constraints and cascades');
    } finally {
        if (app) await app.close();
        await pg.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
