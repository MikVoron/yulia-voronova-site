import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const query = vi.fn();
const dbPath = require.resolve('../src/db');
const mock = new Module(dbPath);
mock.exports = { query, pool: { connect: async () => ({ query, release() {} }) } };
mock.loaded = true;
require.cache[dbPath] = mock;
process.env.JWT_SECRET = 'review-discussion-identity-test-secret-only';
const jwt = require('jsonwebtoken');
const { publicComment, discussionSummaries, registerDiscussionRoutes } = require('../src/review-discussions');
const userId = '33333333-3333-4333-8333-333333333333';
const row = {
  id: 7, review_id: 1, user_id: userId, text: 'Мой ответ',
  display_name: 'Мишель', avatar: 'https://example.test/michel.webp', role: 'admin',
  created_at: '2026-11-15T10:00:00Z', updated_at: '2026-11-15T10:00:00Z',
  like_count: 3, liked_by_user: true,
};
let app;

beforeAll(async () => {
  app = require('fastify')({ logger: false });
  registerDiscussionRoutes(app);
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async sql => {
    if (sql.includes('SELECT is_blocked')) return { rows: [{ is_blocked: false }] };
    if (sql.includes('SELECT display_name')) return { rows: [{ display_name: row.display_name }] };
    if (sql.includes('AS comment_count')) return { rows: [{ review_id: 1, comments: [row], comment_count: 1 }] };
    if (sql.includes('SELECT id, review_id, text')) return { rows: [row] };
    if (sql.includes('FROM review_comments c')) return { rows: [row] };
    if (sql.includes('FROM reviews') || sql.includes('INSERT INTO review_comments')) return { rows: [{ id: 7 }] };
    return { rows: [] };
  });
});

function expectPersonalIdentity(comment) {
  expect(comment).toMatchObject({ userId, author: 'Мишель', avatar: row.avatar, isAuthor: false,
    likeCount: 3, likedByCurrentUser: true });
}

describe('personal identity in review discussions', () => {
  it.each(['admin', 'user'])('keeps the account identity for a normal reply by %s', role => {
    expectPersonalIdentity(publicComment({ ...row, role }));
  });

  it('keeps personal identity when existing comments are embedded in review summaries', async () => {
    expectPersonalIdentity((await discussionSummaries([1])).get(1).comments[0]);
  });

  it('keeps personal identity when existing messages are loaded', async () => {
    const response = await app.inject({ method: 'GET', url: '/content/reviews/1/comments' });
    expect(response.statusCode).toBe(200);
    expectPersonalIdentity(response.json().comments[0]);
  });

  it('returns the authenticated administrator as themselves after posting a normal reply', async () => {
    const token = jwt.sign({ sub: userId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const response = await app.inject({
      method: 'POST', url: '/content/reviews/1/comments',
      headers: { authorization: 'Bearer ' + token },
      payload: { text: row.text, requestId: '11111111-1111-4111-8111-111111111111', isAuthor: true },
    });
    expect(response.statusCode).toBe(201);
    expectPersonalIdentity(response.json().comment);
    const insert = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO review_comments'));
    expect(insert[1][1]).toBe(userId);
  });
});
