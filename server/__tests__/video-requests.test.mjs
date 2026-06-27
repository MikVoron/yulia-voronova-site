import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = 'video-vote-test';
let recipe;
let request;
let votes;

const sendVideoRequestThresholdNotification = vi.fn().mockResolvedValue(true);

const mockQuery = vi.fn(async (sql, params = []) => {
  if (/SELECT is_blocked FROM users WHERE id/.test(sql)) {
    return { rows: [{ is_blocked: false }] };
  }
  if (/SELECT role FROM users WHERE id/.test(sql)) {
    return { rows: [{ role: 'user' }] };
  }
  if (/FROM recipes r\s+LEFT JOIN recipe_video_requests/.test(sql)) {
    if (params[0] !== recipe.id) return { rows: [] };
    return { rows: [{
      id: recipe.id,
      has_video: recipe.hasVideo,
      goal: request?.goal || params[1] || 10,
      status: recipe.hasVideo ? 'published' : (request?.status || 'collecting'),
      reached_at: request?.reached_at || null,
      votes: votes.size,
      voted: params[2] ? votes.has(params[2]) : false,
    }] };
  }
  if (/SELECT name,\s+\(COALESCE[\s\S]+FROM recipes WHERE id=\$1 AND is_published=true/.test(sql)) {
    return params[0] === recipe.id
      ? { rows: [{ name: recipe.name, has_video: recipe.hasVideo }] }
      : { rows: [] };
  }
  if (/INSERT INTO recipe_video_requests/.test(sql)) {
    if (!request) request = { goal: params[1], status: 'collecting', reached_at: null };
    return { rows: [] };
  }
  if (/INSERT INTO recipe_video_votes/.test(sql)) {
    const key = params[1];
    if (votes.has(key)) return { rows: [] };
    votes.add(key);
    return { rows: [{ recipe_id: params[0] }] };
  }
  if (/SELECT COUNT\(\*\)::int AS votes FROM recipe_video_votes/.test(sql)) {
    return { rows: [{ votes: votes.size }] };
  }
  if (/UPDATE recipe_video_requests\s+SET status='goal_reached'/.test(sql)) {
    if (request && request.status === 'collecting' && request.goal <= params[1]) {
      request.status = 'goal_reached';
      request.reached_at = new Date().toISOString();
      return { rows: [{ ...request }] };
    }
    return { rows: [] };
  }
  if (/SELECT goal, status, reached_at FROM recipe_video_requests/.test(sql)) {
    return { rows: request ? [{ ...request }] : [] };
  }
  if (/DELETE FROM recipe_video_votes/.test(sql)) {
    votes.delete(params[1]);
    return { rows: [] };
  }
  if (/SELECT vr.goal, vr.status, vr.reached_at, COUNT\(vv.user_id\)::int AS votes/.test(sql)) {
    return { rows: request ? [{ ...request, votes: votes.size }] : [] };
  }
  return { rows: [] };
});

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const m = new Module(resolved);
  m.exports = exports;
  m.loaded = true;
  require.cache[resolved] = m;
}

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
registerMock(path.join(srcDir, 'email.js'), { sendVideoRequestThresholdNotification });
registerMock(path.join(srcDir, 'audit.js'), { log: vi.fn() });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest';
const jwt = require('jsonwebtoken');
function token(userId = USER_ID) {
  return jwt.sign({ sub: userId, email: 'vote@test.com', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

let app;
beforeAll(async () => {
  const Fastify = require('fastify');
  app = Fastify({ logger: false });
  delete require.cache[require.resolve('../src/routes/content')];
  await app.register(require('../src/routes/content'));
  await app.ready();
});

afterAll(async () => { if (app) await app.close(); });

beforeEach(() => {
  recipe = { id: RECIPE_ID, name: 'Тестовый рецепт', hasVideo: false };
  request = null;
  votes = new Set();
  mockQuery.mockClear();
  sendVideoRequestThresholdNotification.mockClear();
});

describe('recipe video requests', () => {
  it('returns public progress and the current user vote', async () => {
    request = { goal: 10, status: 'collecting', reached_at: null };
    votes.add(USER_ID);
    const res = await app.inject({
      method: 'GET',
      url: '/content/video-requests/' + RECIPE_ID,
      headers: { authorization: 'Bearer ' + token() },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ votes: 1, goal: 10, voted: true, status: 'collecting' });
  });

  it('keeps one vote per user even after a repeated POST', async () => {
    const requestOptions = {
      method: 'POST',
      url: '/content/video-requests/' + RECIPE_ID + '/vote',
      headers: { authorization: 'Bearer ' + token() },
    };
    const first = await app.inject(requestOptions);
    const second = await app.inject(requestOptions);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ votes: 1, inserted: true, voted: true });
    expect(second.json()).toMatchObject({ votes: 1, inserted: false, voted: true });
  });

  it('locks the reached status and sends one threshold notification', async () => {
    request = { goal: 10, status: 'collecting', reached_at: null };
    for (let i = 0; i < 9; i++) votes.add('00000000-0000-4000-8000-00000000000' + i);
    const res = await app.inject({
      method: 'POST',
      url: '/content/video-requests/' + RECIPE_ID + '/vote',
      headers: { authorization: 'Bearer ' + token() },
    });
    expect(res.json()).toMatchObject({ votes: 10, status: 'goal_reached' });
    expect(sendVideoRequestThresholdNotification).toHaveBeenCalledTimes(1);

    await app.inject({
      method: 'POST',
      url: '/content/video-requests/' + RECIPE_ID + '/vote',
      headers: { authorization: 'Bearer ' + token() },
    });
    expect(sendVideoRequestThresholdNotification).toHaveBeenCalledTimes(1);
  });

  it('rejects new votes once a video link exists', async () => {
    recipe.hasVideo = true;
    const progress = await app.inject({
      method: 'GET',
      url: '/content/video-requests/' + RECIPE_ID,
    });
    expect(progress.json()).toMatchObject({ hasVideo: true, status: 'published' });

    const res = await app.inject({
      method: 'POST',
      url: '/content/video-requests/' + RECIPE_ID + '/vote',
      headers: { authorization: 'Bearer ' + token() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/уже есть видео/i);
  });

  it('does not revoke a reached goal when a vote is removed', async () => {
    request = { goal: 10, status: 'goal_reached', reached_at: new Date().toISOString() };
    votes.add(USER_ID);
    const res = await app.inject({
      method: 'DELETE',
      url: '/content/video-requests/' + RECIPE_ID + '/vote',
      headers: { authorization: 'Bearer ' + token() },
    });
    expect(res.json()).toMatchObject({ votes: 0, voted: false, status: 'goal_reached' });
  });
});
