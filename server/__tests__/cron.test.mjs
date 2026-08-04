import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

const defaultQuery = async (sql) => {
  if (/INSERT INTO cron_runs/.test(sql)) return { rows: [{ id: 101 }] };
  if (/SELECT u\.email FROM subscriptions/.test(sql)) return { rows: [] };
  if (/UPDATE subscriptions SET status='expired'/.test(sql)) return { rows: [], rowCount: 0 };
  if (/DELETE FROM login_codes/.test(sql)) return { rows: [], rowCount: 2 };
  if (/DELETE FROM refresh_sessions/.test(sql)) return { rows: [], rowCount: 3 };
  if (/UPDATE cron_runs SET/.test(sql)) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
};
const mockQuery = vi.fn(defaultQuery);

const sendTelegramAlert = vi.fn().mockResolvedValue(false);
const sendSubscriptionExpiryReminder = vi.fn().mockResolvedValue(true);

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

function loadCronModule() {
  registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
  registerMock(path.join(srcDir, 'email.js'), {
    sendTrialExpired: vi.fn().mockResolvedValue(true),
    sendSubscriptionExpired: vi.fn().mockResolvedValue(true),
    sendSubscriptionExpiryReminder,
  });
  registerMock(path.join(srcDir, 'telegram.js'), { sendTelegramAlert });
  const cronPath = require.resolve('../src/cron');
  delete require.cache[cronPath];
  return require('../src/cron');
}

beforeEach(() => {
  mockQuery.mockClear();
  mockQuery.mockImplementation(defaultQuery);
  sendTelegramAlert.mockClear();
  sendSubscriptionExpiryReminder.mockClear();
});

describe('subscription expiry reminders', () => {
  it('reserves and emails each due subscription once', async () => {
    mockQuery.mockImplementation(async (sql) => {
      if (/INSERT INTO cron_runs/.test(sql)) return { rows: [{ id: 102 }] };
      if (/WITH due AS/.test(sql)) return { rows: [{ email: 'user@example.com', active_until: '2026-08-07T00:00:00.000Z' }], rowCount: 1 };
      if (/UPDATE cron_runs SET/.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const { sendSubscriptionExpiryReminders } = loadCronModule();
    const fastify = { log: { error: vi.fn() } };

    await sendSubscriptionExpiryReminders(fastify);

    expect(sendSubscriptionExpiryReminder).toHaveBeenCalledWith('user@example.com', '2026-08-07T00:00:00.000Z');
    expect(mockQuery.mock.calls.some(([sql]) => /expiry_reminder_sent_at=now\(\)/.test(sql))).toBe(true);
  });
});

describe('cron cleanup', () => {
  it('deletes expired refresh sessions during hourly cron jobs', async () => {
    const { runCronJobs } = loadCronModule();
    const fastify = {
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    await runCronJobs(fastify);

    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM refresh_sessions WHERE expires_at <= now()');
    expect(fastify.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ cleanedCodes: 2, cleanedRefreshSessions: 3 }),
      'cron completed'
    );
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });
});
