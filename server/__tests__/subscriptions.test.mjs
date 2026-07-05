import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let duplicatePendingOnInsert = true;
let reservedEarlyUsers = 0;
let confirmedEarlyPayments = 0;
let firstEarlyPaymentAt = null;

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
  if (/COUNT\(DISTINCT p\.user_id\)/.test(sql)) {
    return { rows: [{ count: reservedEarlyUsers }] };
  }
  if (/MIN\(created_at\) AS first_early_payment_at/.test(sql)) {
    return { rows: [{ count: confirmedEarlyPayments, first_early_payment_at: firstEarlyPaymentAt }] };
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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest';

let app;

async function buildApp() {
  const Fastify = require('fastify');
  const f = Fastify({ logger: false, trustProxy: true });
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
  reservedEarlyUsers = 0;
  confirmedEarlyPayments = 0;
  firstEarlyPaymentAt = null;
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

  it('offers one early-price renewal to an early member with one confirmed payment', async () => {
    reservedEarlyUsers = 18;
    confirmedEarlyPayments = 1;
    firstEarlyPaymentAt = '2026-06-30T10:00:00.000Z';

    const res = await app.inject({
      method: 'GET',
      url: '/subscription/early-bird',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: true,
      eligibility: 'renewal',
      renewalAvailable: true,
      remaining: 32,
      prices: { 1: 250, 3: 690, 12: 2490 }
    });
  });

  it('switches an early member to regular prices after the included renewal', async () => {
    reservedEarlyUsers = 18;
    confirmedEarlyPayments = 2;
    firstEarlyPaymentAt = '2026-06-30T10:00:00.000Z';

    const res = await app.inject({
      method: 'GET',
      url: '/subscription/early-bird',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      eligible: false,
      eligibility: 'standard',
      renewalUsed: true,
      prices: { 1: 390, 3: 990, 12: 2990 }
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

  it('accepts a normal browser payment payload and stores normalized values', async () => {
    duplicatePendingOnInsert = false;
    const screenshot = 'data:image/png;base64,aGVsbG8=';
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
    const res = await app.inject({
      method: 'PUT',
      url: '/subscription/payments/17/dismiss-notice',
      headers: { authorization: 'Bearer ' + makeToken() }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id=$1 AND user_id=$2 AND status='rejected'"),
      [17, 1]
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
