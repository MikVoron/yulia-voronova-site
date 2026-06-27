import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

let networkCounts;
let fingerprintUsed;

const mockClient = {
  query: vi.fn(async (sql) => {
    if (/FROM subscriptions\s+WHERE registration_ip/.test(sql)) {
      return {
        rows: [{
          count_24h: networkCounts.count24h,
          count_7d: networkCounts.count7d,
          count_90d: networkCounts.count90d
        }]
      };
    }
    if (/SELECT 1 FROM trial_fingerprints/.test(sql)) {
      return { rows: fingerprintUsed ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  }),
  release: vi.fn()
};

const mockDb = {
  pool: { connect: vi.fn(async () => mockClient) },
  query: vi.fn(async () => ({ rows: [] }))
};

const dbPath = require.resolve(path.join(srcDir, 'db.js'));
const dbModule = new Module(dbPath);
dbModule.exports = mockDb;
dbModule.loaded = true;
require.cache[dbPath] = dbModule;

const {
  tryGrantTrial,
  classifyNetworkObservation,
  NETWORK_THRESHOLDS
} = require('../src/trial-guard');

beforeEach(() => {
  networkCounts = { count24h: 0, count7d: 0, count90d: 0 };
  fingerprintUsed = false;
  mockClient.query.mockClear();
  mockClient.release.mockClear();
  mockDb.pool.connect.mockClear();
  mockDb.query.mockClear();
});

describe('trial network observation', () => {
  it('defines watch and alert thresholds without treating IP as identity', () => {
    expect(classifyNetworkObservation({ count24h: 5, count7d: 10, count90d: 20 })).toBe('normal');
    expect(classifyNetworkObservation({ count24h: 6, count7d: 10, count90d: 20 })).toBe('watch');
    expect(classifyNetworkObservation({ count24h: 11, count7d: 10, count90d: 20 })).toBe('alert');
    expect(NETWORK_THRESHOLDS.watch24h).toBe(5);
  });

  it('observes a high-volume network but still grants a new fingerprint', async () => {
    networkCounts = { count24h: 10, count7d: 20, count90d: 30 };

    const result = await tryGrantTrial('a'.repeat(64), '203.0.113.10', 'user-1');

    expect(result.grant).toBe(true);
    expect(result.reason).toBe('ok');
    expect(result.observation).toEqual({ count24h: 11, count7d: 21, count90d: 31, level: 'alert' });
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO subscriptions"),
      ['user-1', '203.0.113.10', 'a'.repeat(64)]
    );
    expect(mockClient.query.mock.calls.some(([sql]) => /ip_limit/.test(sql))).toBe(false);
  });

  it('still denies reuse of the same valid fingerprint', async () => {
    fingerprintUsed = true;

    const result = await tryGrantTrial('b'.repeat(64), '203.0.113.11', 'user-2');

    expect(result.grant).toBe(false);
    expect(result.reason).toBe('fingerprint_used');
    expect(result.observation.level).toBe('normal');
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("'expired'"),
      ['user-2', '203.0.113.11', 'b'.repeat(64)]
    );
  });
});
