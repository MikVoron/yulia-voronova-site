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
const sendTestingInvitation = vi.fn().mockResolvedValue(true);
const previewPersonalMessage = vi.fn(() => '<html>preview</html>');
const sendPersonalMessage = vi.fn().mockResolvedValue(true);
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
  sendFeedbackReply,
  sendTestingInvitation,
  previewPersonalMessage,
  sendPersonalMessage
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
  sendTestingInvitation.mockClear();
  previewPersonalMessage.mockClear();
  sendPersonalMessage.mockClear();
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

describe('admin user deletion', () => {
  const userId = 'bcbd9441-106c-4706-b646-10cf9c845b50';

  it('deletes a test user and dependent feedback in one transaction', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, role FROM users')) {
        return { rows: [{ id: userId, email: 'test@example.com', role: 'user' }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/' + userId,
      payload: { confirmEmail: 'test@example.com' }
    });

    expect(res.statusCode).toBe(200);
    expect(mockClientQuery).toHaveBeenCalledWith('UPDATE feedback_messages SET admin_id=NULL WHERE admin_id=$1', [userId]);
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM feedback_messages WHERE user_id=$1', [userId]);
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id=$1', [userId]);
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(auditLog).toHaveBeenCalledWith('user_delete', expect.objectContaining({
      userId: 'admin-1',
      email: 'test@example.com'
    }));
  });

  it('refuses to delete an administrator', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, role FROM users')) {
        return { rows: [{ id: userId, email: 'admin@example.com', role: 'admin' }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/' + userId,
      payload: { confirmEmail: 'admin@example.com' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Администратора');
    expect(mockClientQuery).not.toHaveBeenCalledWith('DELETE FROM users WHERE id=$1', [userId]);
  });

  it('refuses to delete a user with a confirmed payment', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, role FROM users')) {
        return { rows: [{ id: userId, email: 'paid@example.com', role: 'user' }] };
      }
      if (sql.includes("status='confirmed'")) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/' + userId,
      payload: { confirmEmail: 'paid@example.com' }
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain('подтверждённой оплатой');
    expect(mockClientQuery).not.toHaveBeenCalledWith('DELETE FROM users WHERE id=$1', [userId]);
  });

  it('requires an exact email confirmation', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, email, role FROM users')) {
        return { rows: [{ id: userId, email: 'test@example.com', role: 'user' }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/users/' + userId,
      payload: { confirmEmail: 'other@example.com' }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Email не совпадает');
    expect(mockClientQuery).not.toHaveBeenCalledWith('DELETE FROM users WHERE id=$1', [userId]);
  });
});

describe('admin feedback hardening', () => {
  it('rejects non-string feedback replies before opening a DB transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/feedback/10/reply',
      payload: { reply: { bad: true } }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('текст ответа');
    expect(mockConnect).not.toHaveBeenCalled();
    expect(sendFeedbackReply).not.toHaveBeenCalled();
  });

  it('checks admin feedback reply length after trimming whitespace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/feedback/10/reply',
      payload: { reply: ' '.repeat(10) }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('текст ответа');
    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe('admin testing invitations', () => {
  it('sends one invitation with an optional name and records the action', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT display_name, unsubscribe_token FROM users')) {
        return { rows: [{ display_name: 'Имя из профиля', unsubscribe_token: 'unsubscribe-token' }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/testing-invitations',
      payload: { email: ' Tester@Example.com ', displayName: ' Анна ' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, email: 'tester@example.com' });
    expect(sendTestingInvitation).toHaveBeenCalledWith('tester@example.com', 'unsubscribe-token', 'Анна');
    expect(auditLog).toHaveBeenCalledWith('testing_invitation_send', expect.objectContaining({
      userId: 'admin-1', email: 'tester@example.com', detail: 'name=Анна'
    }));
  });

  it('uses the saved name when the form name is empty and rejects bad email addresses', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [{ display_name: 'Мария', unsubscribe_token: null }] }));
    const res = await app.inject({
      method: 'POST',
      url: '/admin/testing-invitations',
      payload: { email: 'tester@example.com', displayName: '' }
    });
    expect(res.statusCode).toBe(200);
    expect(sendTestingInvitation).toHaveBeenCalledWith('tester@example.com', null, 'Мария');

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/testing-invitations',
      payload: { email: 'not-an-email' }
    });
    expect(invalid.statusCode).toBe(400);
    expect(sendTestingInvitation).toHaveBeenCalledTimes(1);
  });
});

describe('admin personal messages', () => {
  it('renders a safe preview without sending or auditing it', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [{ display_name: 'Мария' }] }));
    const res = await app.inject({
      method: 'POST',
      url: '/admin/personal-messages',
      payload: {
        email: 'user@example.com', sender: 'yulia', subject: 'Важная тема', text: 'Текст письма', preview: true
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ html: '<html>preview</html>' });
    expect(previewPersonalMessage).toHaveBeenCalledWith(expect.objectContaining({
      email: 'user@example.com', displayName: 'Мария', sender: 'yulia'
    }));
    expect(sendPersonalMessage).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('sends only a valid personal message and records no free-text content in audit', async () => {
    mockQuery.mockImplementation(async () => ({ rows: [] }));
    const res = await app.inject({
      method: 'POST',
      url: '/admin/personal-messages',
      payload: {
        email: ' User@Example.com ', displayName: ' Анна ', sender: 'hello', subject: 'Добрый день', text: 'Приватный текст'
      }
    });

    expect(res.statusCode).toBe(200);
    expect(sendPersonalMessage).toHaveBeenCalledWith('user@example.com', expect.objectContaining({
      sender: 'hello', subject: 'Добрый день', text: 'Приватный текст', displayName: 'Анна'
    }));
    expect(auditLog).toHaveBeenCalledWith('personal_message_send', expect.objectContaining({
      email: 'user@example.com', detail: 'hello; chars=15'
    }));

    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/personal-messages',
      payload: { email: 'bad', sender: 'other', subject: '', text: '' }
    });
    expect(invalid.statusCode).toBe(400);
    expect(sendPersonalMessage).toHaveBeenCalledTimes(1);
  });
});
