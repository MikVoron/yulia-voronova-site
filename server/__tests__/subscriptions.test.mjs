import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
  if (/INSERT INTO payments/.test(sql)) {
    const err = new Error('duplicate pending payment');
    err.code = '23505';
    err.constraint = 'idx_payments_one_pending_per_user';
    throw err;
  }
  return { rows: [] };
});

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

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
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
  mockQuery.mockClear();
  sendPaymentNotification.mockClear();
  sendFeedback.mockClear();
  auditLog.mockClear();
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
});
