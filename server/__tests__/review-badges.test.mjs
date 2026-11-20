import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const member = '11111111-1111-4111-8111-111111111111';
const friend = '22222222-2222-4222-8222-222222222222';
const early = '33333333-3333-4333-8333-333333333333';
const url = '/content/my-review-badges';
let pg, app, getReviewBadges, headers;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE ROLE smartplate;
    CREATE TABLE users (
      id uuid PRIMARY KEY, is_blocked boolean NOT NULL DEFAULT false, early_access_member boolean NOT NULL DEFAULT false
    );
    CREATE TABLE recipes (id text PRIMARY KEY, is_published boolean NOT NULL);
    CREATE TABLE reviews (id int PRIMARY KEY, user_id uuid NOT NULL, recipe_id text NOT NULL);
    CREATE TABLE review_photos (review_id int, user_id uuid NOT NULL, status text NOT NULL);
    INSERT INTO users(id, early_access_member) VALUES ('${member}', false), ('${friend}', false), ('${early}', true);
    INSERT INTO recipes VALUES ('a', true), ('b', true), ('c', true), ('draft', false);
    INSERT INTO reviews VALUES
      (1, '${member}', 'a'), (2, '${member}', 'b'), (3, '${member}', 'c'), (4, '${member}', 'draft'),
      (5, '${friend}', 'a'), (6, '${friend}', 'b'), (7, '${friend}', 'draft');
    INSERT INTO review_photos VALUES
      (1, '${member}', 'approved'), (5, '${friend}', 'pending'), (7, '${friend}', 'approved'),
      (5, '${member}', 'approved'), (NULL, '${friend}', 'approved');
  `);
  const migration = await readFile(new URL('../migrations/047_review_badges.sql', import.meta.url), 'utf8');
  await pg.exec(migration);
  await pg.exec(migration);
  await pg.query('UPDATE users SET review_friend_badge = true WHERE id = $1', [friend]);

  const dbPath = require.resolve('../src/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: pg.query.bind(pg) } };
  ({ getReviewBadges } = require('../src/review-badges'));
  process.env.JWT_SECRET = 'isolated-review-badge-test-secret';
  const token = require('../src/auth').generateAccessToken({ id: member, email: 'test@example.test', role: 'user' });
  headers = { authorization: 'Bearer ' + token };
  app = require('fastify')({ logger: false });
  await app.register(require('../src/routes/content'));
  await app.ready();
}, 30000);

afterAll(async () => {
  await app?.close();
  await pg?.close();
});

describe('review badges', () => {
  it('recognizes prior published contributions and both existing ways to be a friend', async () => {
    const profiles = await getReviewBadges([member, friend, early]);
    expect(profiles.get(member)).toEqual({ badges: ['cooks-with-us', 'shares-experience'], publicBadge: 'cooks-with-us' });
    expect(profiles.get(friend)).toEqual({ badges: ['friend'], publicBadge: 'friend' });
    expect(profiles.get(early)).toEqual({ badges: ['friend'], publicBadge: 'friend' });
  });

  it('only lets signed-in users choose one of their own earned badges', async () => {
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const profile = await app.inject({ method: 'GET', url, headers });
    expect(profile.json().publicBadge).toBe('cooks-with-us');
    expect(profile.headers['cache-control']).toBe('private, no-store');

    const choose = badge => app.inject({ method: 'PUT', url, headers, payload: { badge, userId: friend } });
    expect((await choose('author')).statusCode).toBe(400);
    expect((await choose('friend')).statusCode).toBe(409);
    expect((await choose('shares-experience')).json().publicBadge).toBe('shares-experience');
    expect((await app.inject({ method: 'GET', url, headers })).json().publicBadge).toBe('shares-experience');
    expect((await getReviewBadges([friend])).get(friend).publicBadge).toBe('friend');

    await pg.exec("UPDATE recipes SET is_published = false WHERE id = 'c'");
    expect((await getReviewBadges([member])).get(member)).toEqual({
      badges: ['cooks-with-us'], publicBadge: 'cooks-with-us'
    });
    await pg.exec("UPDATE review_photos SET status = 'deleted' WHERE review_id = 1");
    expect((await getReviewBadges([member])).get(member)).toEqual({ badges: [], publicBadge: null });
  });

  it('remembers shown badges without accepting unearned ones', async () => {
    await pg.exec("UPDATE recipes SET is_published = true WHERE id = 'c'");
    await pg.exec("UPDATE review_photos SET status = 'approved' WHERE review_id = 1");
    const seenUrl = url + '/seen';
    const read = async () => (await app.inject({ method: 'GET', url, headers })).json().newBadges;
    const see = badges => app.inject({ method: 'POST', url: seenUrl, headers, payload: { badges } });
    expect(await read()).toEqual(['cooks-with-us', 'shares-experience']);
    expect((await app.inject({ method: 'POST', url: seenUrl, payload: { badges: ['friend'] } })).statusCode).toBe(401);
    expect((await see(['invalid'])).statusCode).toBe(400);
    const results = await Promise.all([see(['cooks-with-us', 'friend']), see(['cooks-with-us'])]);
    expect(results.map(response => response.statusCode)).toEqual([200, 200]);
    expect(await read()).toEqual(['shares-experience']);
    expect((await pg.query('SELECT badge FROM user_review_badges_seen')).rows).toEqual([{ badge: 'cooks-with-us' }]);
  });
});
