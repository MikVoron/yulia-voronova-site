import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mockQuery = vi.fn(async () => ({ rows: [] }));
const mockClientQuery = vi.fn(async () => ({ rows: [] }));
const mockRelease = vi.fn();
const mockConnect = vi.fn(async () => ({ query: mockClientQuery, release: mockRelease }));

const sendPaymentConfirmed = vi.fn().mockResolvedValue(true);
const sendPaymentRejected = vi.fn().mockResolvedValue(true);
const sendSubscriptionExtended = vi.fn().mockResolvedValue(true);
const sendFeedbackReply = vi.fn().mockResolvedValue(true);
const auditLog = vi.fn();

const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

registerMock(path.join(srcDir, 'db.js'), {
  query: mockQuery,
  pool: { connect: mockConnect }
});
registerMock(path.join(srcDir, 'middleware.js'), {
  requireAdmin: async (req) => { req.user = { sub: 'admin-1' }; }
});
registerMock(path.join(srcDir, 'email.js'), {
  sendPaymentConfirmed,
  sendPaymentRejected,
  sendSubscriptionExtended,
  sendFeedbackReply
});
registerMock(path.join(srcDir, 'audit.js'), { log: auditLog });

let app;

async function buildApp() {
  const Fastify = require('fastify');
  const f = Fastify({ logger: false, trustProxy: true });
  const adminRoutes = require('../src/routes/admin');
  await f.register(adminRoutes);
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
  mockClientQuery.mockClear();
  mockRelease.mockClear();
  mockConnect.mockClear();
  sendPaymentConfirmed.mockClear();
  sendPaymentRejected.mockClear();
  sendSubscriptionExtended.mockClear();
  sendFeedbackReply.mockClear();
  auditLog.mockClear();
});

describe('admin payment hardening', () => {
  it('rejects unsupported confirmation months before opening a DB transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/payments/10/confirm',
      payload: { months: 999, comment: 'test' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('months');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('rejects malformed payment ids before querying the DB', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/payments/not-a-number/confirm',
      payload: { months: 1 }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('id платежа');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('accepts UUID payment ids used by the production payments table', async () => {
    const paymentId = 'bcbd9441-106c-4706-b646-10cf9c845b50';
    const res = await app.inject({
      method: 'POST',
      url: '/admin/payments/' + paymentId + '/confirm',
      payload: { months: 1 }
    });

    expect(res.statusCode).not.toBe(400);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockClientQuery).toHaveBeenCalledWith(
      "UPDATE payments SET status='confirmed', admin_comment=$2, updated_at=now() WHERE id=$1 AND status='pending' RETURNING *",
      [paymentId, null]
    );
  });
});

describe('admin list hardening', () => {
  it('caps users pagination before querying the DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users?page=999999&limit=999999'
    });

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM users u LEFT JOIN subscriptions'),
      [200, 99800]
    );
  });

  it('rejects invalid feedback status before querying the DB', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/feedback?status=<script>'
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('статус');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects invalid audit event before querying the DB', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/audit?event=../../etc/passwd'
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('аудита');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects malformed user ids before updating block state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/users/not-a-user/block'
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('id пользователя');
    expect(mockQuery).not.toHaveBeenCalledWith(expect.stringMatching(/UPDATE users SET is_blocked/), expect.any(Array));
  });
});
