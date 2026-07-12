import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');

function registerMock(file, exports) {
  const resolved = require.resolve(path.join(srcDir, file));
  const module = new Module(resolved);
  module.exports = exports;
  module.loaded = true;
  require.cache[resolved] = module;
}

const auditLog = vi.fn();
const sendTelegramAlert = vi.fn().mockResolvedValue(true);
registerMock('audit.js', { log: auditLog });
registerMock('telegram.js', { sendTelegramAlert });

const { inspectFingerprint, reportTrialSignals } = require('../src/trial-monitor');

beforeEach(() => {
  auditLog.mockClear();
  sendTelegramAlert.mockClear();
});

describe('trial fingerprint validation and monitoring', () => {
  it('accepts exactly 64 hexadecimal characters and normalizes case', () => {
    const result = inspectFingerprint('A'.repeat(64));
    expect(result).toEqual({ status: 'valid', value: 'a'.repeat(64) });
  });

  it('distinguishes missing from malformed fingerprints', () => {
    expect(inspectFingerprint(null)).toEqual({ status: 'missing', value: null });
    expect(inspectFingerprint('x'.repeat(64))).toEqual({ status: 'invalid', value: null });
    expect(inspectFingerprint('a'.repeat(65))).toEqual({ status: 'invalid', value: null });
  });

  it('journals watch signals and sends a deduplicated alert for alert level', () => {
    reportTrialSignals({
      trial: { observation: { level: 'alert', count24h: 11, count7d: 21, count90d: 31 } },
      userId: 'user-3',
      email: 'watch@example.com',
      method: 'email',
      ip: '203.0.113.12',
      ua: 'test-agent',
      fastify: { log: { error: vi.fn() } },
      fingerprintStatus: 'valid'
    });

    expect(auditLog).toHaveBeenCalledWith('trial_network_alert', expect.objectContaining({
      userId: 'user-3',
      ip: '203.0.113.12'
    }));
    expect(sendTelegramAlert).toHaveBeenCalledWith(
      expect.stringContaining('24ч: 11'),
      expect.objectContaining({ key: 'trial-network-203.0.113.12' })
    );
  });

  it('journals a missing email fingerprint without blocking or alerting', () => {
    reportTrialSignals({
      trial: { observation: { level: 'normal', count24h: 1, count7d: 1, count90d: 1 } },
      userId: 'user-4',
      email: 'missing@example.com',
      method: 'email',
      ip: '203.0.113.13',
      ua: 'test-agent',
      fingerprintStatus: 'missing'
    });

    expect(auditLog).toHaveBeenCalledWith('trial_fingerprint_missing', expect.objectContaining({ userId: 'user-4' }));
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });
});
