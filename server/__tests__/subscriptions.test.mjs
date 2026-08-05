import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let duplicatePendingOnInsert = true;
let confirmedEarlyMembers = 0;
let earlyAccessMember = false;
let earlyAccessUntil = null;

const mockQuery = vi.fn(async (sql) => {
  if (/SELECT is_blocked FROM users WHERE id/.test(sql)) {
    return { rows: [{ is_blocked: false }] };
  }
  if (/SELECT id FROM payments WHERE user_id=\$1 AND status='pending' LIMIT 1/.test(sql)) {
    return { rows: [] };
  }
  if (/SELECT email FROM users WHERE id=\$1/.test(sql)) {
    return { rows: [{ email: 'user@example.com' }] };
  }
  if (/COUNT\(\*\)::int AS count FROM users WHERE early_access_member=true/.test(sql)) {
    return { rows: [{ count: confirmedEarlyMembers }] };
  }
  if (/SUM\(slots_delta\)/.test(sql)) {
    return { rows: [{ count: 0 }] };
  }
  if (/SELECT u\.early_access_member, s\.active_until/.test(sql)) {
    return { rows: [{ early_access_member: earlyAccessMember, active_until: earlyAccessUntil }] };
  }
  if (/INSERT INTO payments/.test(sql)) {
    if (!duplicatePendingOnInsert) return { rows: [] };
    const err = new Error('duplicate pending payment');
    err.code = '23505';
    err.constraint = 'idx_payments_one_pending_per_user';
    throw err;
  }
  if (/SET notice_dismissed_at=COALESCE/.test(sql)) {
    return { rows: [{ notice_dismissed_at: '2026-07-05T18:00:00.000Z' }] };
  }
  return { rows: [] };
});
const mockClientQuery = vi.fn(async () => ({ rows: [] }));
const mockRelease = vi.fn();
const mockConnect = vi.fn(async () => ({ query: mockClientQuery, release: mockRelease }));

const sendPaymentNotification = vi.fn().mockResolvedValue(true);
const sendFeedback = vi.fn().mockResolvedValue(true);
const auditLog = vi.fn();

const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const m = new Module(resolved);
  m.exports = exports;
  m.loaded = true;
  require.cache[resolved] = m;
}

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery, pool: { connect: mockConnect } });
registerMock(path.join(srcDir, 'email.js'), { sendPaymentNotification, sendFeedback });
registerMock(path.join(srcDir, 'audit.js'), { log: auditLog });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest-at-least-32-bytes';

let app;

async function buildApp() {
  const Fastify = require('fastify');
  const f = Fastify({ logger: false, trustProxy: true, bodyLimit: 8 * 1024 * 1024 });
  const subscriptionRoutes = require('../src/routes/subscriptions');
  await f.register(subscriptionRoutes);
  await f.ready();
  return f;
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
});

beforeEach(() => {
  duplicatePendingOnInsert = true;
  confirmedEarlyMembers = 0;
  earlyAccessMember = false;
  earlyAccessUntil = null;
  mockQuery.mockClear();
  mockClientQuery.mockClear();
  mockRelease.mockClear();
  mockConnect.mockClear();
  sendPaymentNotification.mockClear();
  sendFeedback.mockClear();
  auditLog.mockClear();
});

describe('subscription/early-bird', () => {
  const jwt = require('jsonwebtoken');

  function makeToken(userId = 1) {
    return jwt.sign(
      { sub: userId, email: 'user@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  it('keeps the early price for an early member who renews in time', async () => {
    confirmedEarlyMembers = 18;
    earlyAccessMember = true;
    earlyAccessUntil = '2099-06-30T10:00:00.000Z';

    const res = await app.inject({
      method: 'GET',
      url: '/subscription/early-bird',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: true,
      eligibility: 'renewal',
      remaining: 12,
      isEarlyBird: true,
      prices: { 1: 190, 3: 540, 12: 1900 }
    });
  });

  it('switches an early member to regular prices after a break longer than 7 days', async () => {
    confirmedEarlyMembers = 18;
    earlyAccessMember = true;
    earlyAccessUntil = '2020-06-30T10:00:00.000Z';

    const res = await app.inject({
      method: 'GET',
      url: '/subscription/early-bird',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: false,
      eligibility: 'standard',
      isEarlyBird: true,
      prices: { 1: 250, 3: 690, 12: 2500 }
    });
  });
});

describe('subscription/payment', () => {
  const jwt = require('jsonwebtoken');

  function makeToken(userId = 1) {
    return jwt.sign(
      { sub: userId, email: 'user@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  it('returns 409 when the pending payment unique index catches a parallel submit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { amount: 1000, paymentDate: '2026-06-26T10:00' }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('платёж на проверке');
    expect(sendPaymentNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejects malformed payment payloads before querying payment rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { amount: 'free', paymentDate: '2026-06-26T10:00' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('сумма');
    expect(mockQuery).not.toHaveBeenCalledWith(
      "SELECT id FROM payments WHERE user_id=$1 AND status='pending' LIMIT 1",
      expect.any(Array)
    );
    expect(sendPaymentNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejects non-image bytes disguised as a supported screenshot', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        amount: 1000,
        paymentDate: '2026-06-26T10:00',
        screenshot: 'data:image/png;base64,aGVsbG8='
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('скриншота');
    expect(sendPaymentNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejects a screenshot whose declared MIME does not match its signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        amount: 1000,
        paymentDate: '2026-06-26T10:00',
        screenshot: VALID_PNG_DATA_URL.replace('image/png', 'image/jpeg')
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('скриншота');
    expect(sendPaymentNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('rejects a decoded screenshot larger than five MiB', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized);
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        amount: 1000,
        paymentDate: '2026-06-26T10:00',
        screenshot: 'data:image/png;base64,' + oversized.toString('base64')
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('большой');
    expect(sendPaymentNotification).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('accepts a normal browser payment payload and stores normalized values', async () => {
    duplicatePendingOnInsert = false;
    const screenshot = VALID_PNG_DATA_URL;
    const res = await app.inject({
      method: 'POST',
      url: '/subscription/payment',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: {
        amount: '250',
        paymentDate: '2026-06-26T10:00',
        comment: '  чек отправлен  ',
        screenshot
      }
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      'INSERT INTO payments (user_id, amount, sender_name, payment_date, user_comment, screenshot, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [1, 250, 'user@example.com', '2026-06-26T10:00', 'чек отправлен', screenshot, 'pending']
    );
    expect(sendPaymentNotification).toHaveBeenCalledWith('user@example.com', 250, '2026-06-26T10:00', true);
    expect(auditLog).toHaveBeenCalled();
  });

  it('persists a rejected payment notice dismissal for the signed-in user', async () => {
    const paymentId = 'fad11838-a168-48ec-a365-202f06ee1d2d';
    const res = await app.inject({
      method: 'PUT',
      url: '/subscription/payments/' + paymentId + '/dismiss-notice',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id=$1 AND user_id=$2 AND status='rejected'"),
      [paymentId, 1]
    );
  });
});

describe('feedback hardening', () => {
  const jwt = require('jsonwebtoken');

  function makeToken(userId = 1) {
    return jwt.sign(
      { sub: userId, email: 'user@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  it('rejects non-string feedback text before opening a DB transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { category: 'wish', text: { bad: true } }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('текст');
    expect(mockConnect).not.toHaveBeenCalled();
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it('rejects invalid feedback categories before opening a DB transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { category: '<script>', text: 'Помогите, пожалуйста' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('категория');
    expect(mockConnect).not.toHaveBeenCalled();
    expect(sendFeedback).not.toHaveBeenCalled();
  });

  it('checks feedback length after trimming whitespace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedback',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { category: 'problem', text: ' '.repeat(1000) }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('текст');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('rejects non-string follow-up text before querying feedback rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedback/12/messages',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { text: ['bad'] }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('текст');
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('FROM feedback_messages WHERE id=$1'),
      expect.any(Array)
    );
  });
});
