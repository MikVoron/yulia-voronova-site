import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

const mockQuery = vi.fn(async (sql) => {
  if (/SELECT 1 AS ok/.test(sql)) return { rows: [{ ok: 1 }] };
  if (/FROM users/.test(sql)) return { rows: [{ count: '12' }] };
  if (/FROM payments/.test(sql)) return { rows: [{ count: '2' }] };
  if (/FROM feedback_messages/.test(sql)) return { rows: [{ count: '3' }] };
  if (/FROM subscriptions GROUP BY/.test(sql)) return { rows: [{ status: 'active', count: 5 }] };
  if (/FROM cron_runs/.test(sql)) {
    return { rows: [{ job_name: 'clean_codes', status: 'success', affected_rows: 4 }] };
  }
  return { rows: [] };
});

function registerMock(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const mod = new Module(resolved);
  mod.exports = exports;
  mod.loaded = true;
  require.cache[resolved] = mod;
}

function loadTelegramModule() {
  registerMock(path.join(srcDir, 'db.js'), { query: mockQuery });
  const telegramPath = require.resolve('../src/telegram');
  delete require.cache[telegramPath];
  return require('../src/telegram');
}

beforeEach(() => {
  process.env.TG_BOT_TOKEN = 'test-token';
  process.env.TG_CHAT_ID = '5754803866';
  process.env.TG_ALERT_MIN_INTERVAL_MS = '300000';
  mockQuery.mockClear();
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ ok: true, result: {} })
  }));
});

afterEach(() => {
  delete process.env.TG_BOT_TOKEN;
  delete process.env.TG_CHAT_ID;
  delete process.env.TG_ALERT_MIN_INTERVAL_MS;
  vi.restoreAllMocks();
});

describe('telegram alerts and status', () => {
  it('sends the first alert and suppresses repeated alerts by key', async () => {
    const telegram = loadTelegramModule();

    await expect(telegram.sendTelegramAlert('boom', { key: 'same' })).resolves.toBe(true);
    await expect(telegram.sendTelegramAlert('boom again', { key: 'same' })).resolves.toBe(false);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('/sendMessage');
  });

  it('returns health text when DB is reachable', async () => {
    const telegram = loadTelegramModule();

    const text = await telegram.getHealthText();

    expect(text).toContain('api: online');
    expect(text).toContain('db: ok');
  });

  it('builds a status response with operational counters', async () => {
    const telegram = loadTelegramModule();

    const text = await telegram.getStatusText();

    expect(text).toContain('SmartPlate status');
    expect(text).toContain('users: 12');
    expect(text).toContain('pending payments: 2');
    expect(text).toContain('waiting feedback: 3');
    expect(text).toContain('active:5');
  });
});
