import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Mock modules at CJS level before requiring routes ──────────────────────

// Mock DB
const mockQuery = vi.fn(async (sql, params) => {
  if (/SELECT COUNT.*login_codes.*ip/.test(sql)) return { rows: [{ count: '0' }] };
  if (/SELECT COUNT.*login_codes.*email/.test(sql)) return { rows: [{ count: '0' }] };
  if (/COALESCE.*SUM.*attempts/.test(sql)) return { rows: [{ total: '0' }] };
  if (/INSERT INTO login_codes/.test(sql)) return { rows: [] };
  if (/SELECT \* FROM login_codes WHERE email/.test(sql)) return { rows: [] };
  if (/SELECT is_blocked FROM users WHERE id/.test(sql)) return { rows: [{ is_blocked: false }] };
  if (/SELECT role FROM users WHERE email/.test(sql)) return { rows: [] };
  if (/SELECT u\.\* FROM auth_accounts/.test(sql)) return { rows: [] };
  if (/SELECT \* FROM users WHERE email/.test(sql)) return { rows: [] };
  if (/INSERT INTO users/.test(sql)) {
    return { rows: [{ id: 1, email: params?.[0], role: 'user', display_name: null, avatar: null, is_blocked: false, created_at: new Date() }] };
  }
  if (/INSERT INTO auth_accounts/.test(sql)) return { rows: [] };
  if (/INSERT INTO refresh_sessions/.test(sql)) return { rows: [] };
  if (/refresh_sessions rs JOIN users/.test(sql)) return { rows: [] };
  if (/DELETE FROM refresh_sessions/.test(sql)) return { rows: [] };
  if (/UPDATE users SET/.test(sql)) return { rows: [] };
  if (/UPDATE login_codes/.test(sql)) return { rows: [] };
  if (/SELECT u\.\*.*subscriptions/.test(sql)) return { rows: [] };
  return { rows: [] };
});

// Inject mocks into Node's require cache before loading routes
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

// Hijack require for our modules
const origResolve = Module._resolveFilename;
const mockModules = {};

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  mockModules[resolved] = exports;
  // Pre-populate cache
  const m = new Module(resolved);
  m.exports = exports;
  m.loaded = true;
  require.cache[resolved] = m;
}

registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
registerMock(path.join(srcDir, 'email.js'), {
  sendLoginCode: vi.fn().mockResolvedValue(true),
  sendWelcome: vi.fn().mockResolvedValue(true),
});
registerMock(path.join(srcDir, 'audit.js'), { log: vi.fn() });
registerMock(path.join(srcDir, 'trial-guard.js'), {
  tryGrantTrial: vi.fn().mockResolvedValue({ grant: true }),
});
// Middleware needs db mock too — it's already covered since it require('./db') which hits our cache

// Set JWT_SECRET for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest';

// ── Build app ──────────────────────────────────────────────────────────────

let app;

async function buildApp() {
  const Fastify = require('fastify');
  const cookie = require('@fastify/cookie');
  const f = Fastify({ logger: false, trustProxy: true });
  await f.register(cookie);
  const authRoutes = require('../src/routes/auth');
  const oauthRoutes = require('../src/routes/oauth');
  await f.register(authRoutes);
  await f.register(oauthRoutes);
  await f.ready();
  return f;
}

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { if (app) await app.close(); });

// ── Tests ──────────────────────────────────────────────────────────────────

describe('auth/send-code', () => {
  it('returns 400 for invalid email', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/send-code', payload: { email: 'not-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('email');
  });

  it('returns 400 for empty body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/send-code', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 for valid email', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/send-code', payload: { email: 'test@example.com' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 200 (silent deny) for admin context with non-admin email', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/send-code', payload: { email: 'hacker@evil.com', context: 'admin' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().message).toBeUndefined();
  });
});

describe('auth/verify', () => {
  it('returns 400 for empty body', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/verify', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid code (no matching login_codes)', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/verify', payload: { email: 'test@example.com', code: '000000' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Код не найден');
  });

  it('rejects a fingerprint with the wrong length', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/verify',
      payload: { email: 'test@example.com', code: '000000', fingerprint: 'a'.repeat(63) }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('fingerprint');
  });

  it('rejects a non-hex fingerprint', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/verify',
      payload: { email: 'test@example.com', code: '000000', fingerprint: 'z'.repeat(64) }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('fingerprint');
  });
});

describe('auth/refresh', () => {
  it('returns 401 without refresh cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('refresh');
  });

  it('returns 401 with invalid refresh cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh',
      cookies: { refreshToken: 'invalid-token-value' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('atomically allows only one of two concurrent refresh requests', async () => {
    let consumed = false;
    const session = {
      user_id: 42,
      email: 'parallel@example.com',
      role: 'user',
      display_name: 'Parallel User',
      avatar: null,
      is_blocked: false,
      user_created_at: new Date('2026-01-01T00:00:00Z')
    };
    const defaultImplementation = mockQuery.getMockImplementation();

    mockQuery.mockImplementation(async (sql) => {
      if (/DELETE FROM refresh_sessions rs\s+USING users u/.test(sql)) {
        // Let both handlers reach the atomic database operation before one wins.
        await new Promise(resolve => setImmediate(resolve));
        if (consumed) return { rows: [] };
        consumed = true;
        return { rows: [session] };
      }
      return { rows: [] };
    });
    mockQuery.mockClear();

    try {
      const request = () => app.inject({
        method: 'POST', url: '/auth/refresh',
        cookies: { refreshToken: 'same-refresh-token' }
      });
      const responses = await Promise.all([request(), request()]);

      expect(responses.map(res => res.statusCode).sort()).toEqual([200, 401]);
      expect(mockQuery.mock.calls.filter(([sql]) => /DELETE FROM refresh_sessions rs\s+USING users u/.test(sql))).toHaveLength(2);
    } finally {
      mockQuery.mockImplementation(defaultImplementation);
    }
  });

  it('does not issue a new session for a blocked user', async () => {
    const defaultImplementation = mockQuery.getMockImplementation();
    mockQuery.mockImplementation(async (sql) => {
      if (/DELETE FROM refresh_sessions rs\s+USING users u/.test(sql)) {
        return {
          rows: [{
            user_id: 43,
            email: 'blocked@example.com',
            role: 'user',
            display_name: null,
            avatar: null,
            is_blocked: true,
            user_created_at: new Date('2026-01-01T00:00:00Z')
          }]
        };
      }
      return { rows: [] };
    });

    try {
      mockQuery.mockClear();
      const res = await app.inject({
        method: 'POST', url: '/auth/refresh',
        cookies: { refreshToken: 'blocked-user-token' }
      });

      expect(res.statusCode).toBe(403);
      expect(mockQuery).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO refresh_sessions/), expect.any(Array));
    } finally {
      mockQuery.mockImplementation(defaultImplementation);
    }
  });
});

describe('auth/profile — avatar validation', () => {
  const jwt = require('jsonwebtoken');
  function makeToken(userId = 1) {
    return jwt.sign({ sub: userId, email: 'test@test.com', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  }

  it('returns 400 for non-string displayName before updating the user', async () => {
    mockQuery.mockClear();
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { displayName: { bad: true } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('имя');
    expect(mockQuery).not.toHaveBeenCalledWith(expect.stringMatching(/UPDATE users SET/), expect.any(Array));
  });

  it('returns 400 for non-string avatar before updating the user', async () => {
    mockQuery.mockClear();
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: { data: 'bad' } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('аватар');
    expect(mockQuery).not.toHaveBeenCalledWith(expect.stringMatching(/UPDATE users SET/), expect.any(Array));
  });

  it('returns 400 for invalid avatar format (not data:image)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: 'javascript:alert(1)' }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('формат');
  });

  it('returns 400 for oversized avatar (>220KB decoded)', async () => {
    const bigPayload = Buffer.alloc(230 * 1024, 'A').toString('base64');
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: 'data:image/png;base64,' + bigPayload }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('большой');
  });

  it('accepts valid small avatar', async () => {
    const smallPayload = Buffer.alloc(1024, 'A').toString('base64');
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: 'data:image/jpeg;base64,' + smallPayload }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('returns 400 for disallowed image type (svg)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('формат');
  });

  it('allows avatar reset (null)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/auth/profile',
      headers: { authorization: 'Bearer ' + makeToken() },
      payload: { avatar: null }
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('OAuth state validation', () => {
  it('VK callback rejects missing state', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/oauth/vk/callback?code=testcode' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('VK callback rejects mismatched state', async () => {
    const res = await app.inject({
      method: 'GET', url: '/auth/oauth/vk/callback?code=testcode&state=wrong',
      cookies: { oauth_state_vk: 'correct' }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('Yandex callback rejects missing state', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/oauth/yandex/callback?code=testcode' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('Yandex callback rejects mismatched state', async () => {
    const res = await app.inject({
      method: 'GET', url: '/auth/oauth/yandex/callback?code=testcode&state=wrong',
      cookies: { oauth_state_yandex: 'correct' }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });

  it('VK state cookie does not interfere with Yandex (parallel auth)', async () => {
    const res = await app.inject({
      method: 'GET', url: '/auth/oauth/yandex/callback?code=testcode&state=abc123',
      cookies: { oauth_state_vk: 'abc123' }
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=invalid_state');
  });
});
