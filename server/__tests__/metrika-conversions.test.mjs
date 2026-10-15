import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const path = require('path');
const Module = require('module');
const srcDir = path.resolve(import.meta.dirname, '..', 'src');
const dbPath = require.resolve(path.join(srcDir, 'db.js'));
const mockQuery = vi.fn();
const mockModule = new Module(dbPath);
mockModule.exports = { query: mockQuery };
mockModule.loaded = true;
require.cache[dbPath] = mockModule;

const { normalizeClientId, queueMetrikaGoal, flushMetrikaGoals } = require('../src/metrika-conversions');

describe('Metrika conversion outbox', () => {
  const originalToken = process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockQuery.mockReset();
    delete process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN;
    else process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN = originalToken;
  });

  it('accepts only a numeric Metrika ClientID', () => {
    expect(normalizeClientId('1710232430899999999')).toBe('1710232430899999999');
    expect(normalizeClientId(' user@example.com ')).toBeNull();
    expect(normalizeClientId('123')).toBeNull();
  });

  it('does not queue a goal without a usable ClientID', async () => {
    await expect(queueMetrikaGoal({ goalId: 'registration_completed', clientId: 'not-a-client-id' })).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'missing_client_id'],
    ['person@example.com', 'invalid_client_id']
  ])('records a safe reason for a skipped event (%s)', async (clientId, reason) => {
    const logger = { warn: vi.fn() };
    await expect(queueMetrikaGoal({
      goalId: 'registration_completed', userId: 'private-user-id', clientId,
      logger, requestId: 'req-test'
    })).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith({
      goalId: 'registration_completed', requestId: 'req-test', reason
    }, 'Metrika goal skipped');
    expect(mockQuery).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('person@example.com');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-user-id');
  });

  it('queues a valid registration and lets database failures reach the route logger', async () => {
    const logger = { warn: vi.fn() };
    const input = { goalId: 'registration_completed', clientId: '1710232430899999999', logger };
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(queueMetrikaGoal(input)).resolves.toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
    mockQuery.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(queueMetrikaGoal(input)).rejects.toThrow('database unavailable');
  });

  it('sends a queued goal through Measurement Protocol and removes the ClientID after acknowledgement', async () => {
    process.env.METRIKA_MEASUREMENT_PROTOCOL_TOKEN = 'test-measurement-token';
    mockQuery
      .mockResolvedValueOnce({ rows: [{
        id: 7,
        goal_id: 'registration_completed',
        metrika_client_id: '1710232430899999999',
        occurred_at: new Date('2026-09-03T09:00:00Z'),
        attempts: 1
      }] })
      .mockResolvedValueOnce({ rows: [] });
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    const logger = { warn: vi.fn(), error: vi.fn() };
    await expect(flushMetrikaGoals({ log: logger }, 1)).resolves.toEqual({ sent: 1, failed: 0, skipped: false });
    const requestUrl = new URL(global.fetch.mock.calls[0][0]);
    expect(requestUrl.searchParams.get('tid')).toBe('111434385');
    expect(requestUrl.searchParams.get('cid')).toBe('1710232430899999999');
    expect(requestUrl.searchParams.get('ea')).toBe('registration_completed');
    expect(mockQuery.mock.calls[1][0]).toContain("metrika_client_id=NULL");
  });
});
