'use strict';

// Pure, fail-closed recovery policy for the future Linux/PM2 adapter.  It does
// not read files, invoke systemd/PM2, or modify a release state.
const { transition, validateState, ROLLBACK_WINDOW_MS } = require('./protocol.cjs');

const RECORD_VERSION = 2;
const MAX_CLOCK_SKEW_MS = 5000;
const BOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function check(ok, code) { if (!ok) throw new Error(code); }
function exact(value, keys, code) {
  check(value && typeof value === 'object' && !Array.isArray(value), code);
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
}
function safeTime(value, code) { check(Number.isSafeInteger(value) && value >= 0, code); }
function validateObserver(observer) {
  exact(observer, ['bootId', 'realtimeMs', 'monotonicMs'], 'RECOVERY_OBSERVER_FIELDS');
  check(typeof observer.bootId === 'string' && BOOT_ID.test(observer.bootId), 'RECOVERY_BOOT_ID');
  safeTime(observer.realtimeMs, 'RECOVERY_REALTIME');
  safeTime(observer.monotonicMs, 'RECOVERY_MONOTONIC');
}

function validateRecord(record, state) {
  validateState(state);
  check(state.phase !== 'prepared', 'RECOVERY_NOT_ARMED');
  exact(record, ['schemaVersion', 'releaseId', 'manifestSha256', 'bootId', 'armedRealtimeMs', 'armedMonotonicMs',
    'deadlineRealtimeMs', 'deadlineMonotonicMs'], 'RECOVERY_RECORD_FIELDS');
  check(record.schemaVersion === RECORD_VERSION && typeof record.bootId === 'string' && BOOT_ID.test(record.bootId),
    'RECOVERY_RECORD_ID');
  for (const key of ['armedRealtimeMs', 'armedMonotonicMs', 'deadlineRealtimeMs', 'deadlineMonotonicMs']) {
    safeTime(record[key], 'RECOVERY_RECORD_TIME');
  }
  check(record.deadlineRealtimeMs > record.armedRealtimeMs &&
    record.deadlineMonotonicMs > record.armedMonotonicMs, 'RECOVERY_RECORD_ORDER');
  check(record.releaseId === state.releaseId && record.manifestSha256 === state.manifestSha256 &&
    state.deadlineMs === record.deadlineRealtimeMs && state.lastNowMs >= record.armedRealtimeMs,
    'RECOVERY_PROTOCOL_BINDING');
  check(record.deadlineRealtimeMs - record.armedRealtimeMs === ROLLBACK_WINDOW_MS &&
    record.deadlineMonotonicMs - record.armedMonotonicMs === ROLLBACK_WINDOW_MS,
    'RECOVERY_WINDOW');
  return Object.freeze({ ...record });
}

function createRecord(state, observer) {
  validateState(state);
  validateObserver(observer);
  // Use the SAME clock sample as the arm event. A later sample must never
  // silently reset either clock's ten-minute window.
  check(state.phase === 'armed' && state.revision === 1 &&
    state.lastNowMs === observer.realtimeMs, 'RECOVERY_ARMED_STATE');
  return validateRecord({ schemaVersion: RECORD_VERSION, releaseId: state.releaseId,
    manifestSha256: state.manifestSha256, bootId: observer.bootId,
    armedRealtimeMs: observer.realtimeMs, armedMonotonicMs: observer.monotonicMs,
    deadlineRealtimeMs: state.deadlineMs,
    deadlineMonotonicMs: observer.monotonicMs + ROLLBACK_WINDOW_MS }, state);
}

// Reread the durable state/record under the adapter's global flock. Clock
// anomalies select rollback; corrupt/missing nonterminal records THROW and
// must block forward progress. This policy does not repair corrupt metadata.
function decide(state, record, observer) {
  validateState(state);
  const terminal = ['confirmed', 'rolled_back'].includes(state.phase);
  // A durable terminal decision no longer depends on its old clock record.
  if (terminal) return state.cleanupComplete ? 'idle' : 'cleanup';
  validateRecord(record, state);
  if (state.phase === 'rolling_back') return 'rollback';
  validateObserver(observer);
  if (observer.bootId !== record.bootId) return 'rollback';
  if (observer.realtimeMs < state.lastNowMs || observer.monotonicMs < record.armedMonotonicMs) return 'rollback';
  if (observer.realtimeMs >= record.deadlineRealtimeMs || observer.monotonicMs >= record.deadlineMonotonicMs) return 'rollback';
  const elapsedRealtime = observer.realtimeMs - record.armedRealtimeMs;
  const elapsedMonotonic = observer.monotonicMs - record.armedMonotonicMs;
  if (Math.abs(elapsedRealtime - elapsedMonotonic) > MAX_CLOCK_SKEW_MS) return 'rollback';
  return 'continue';
}

// Recovery has no forward deadline to extend. Keep the protocol's logical
// timestamp nondecreasing even when realtime steps back or resets after boot.
// NEVER use this normalization for arm/switch/pending/confirm/commit.
// Real checks still supply evidence; the adapter must log the raw clock sample
// separately and persist each returned state atomically under the same flock.
function recoveryTransition(state, event) {
  validateState(state);
  exact(event, ['action', 'expectedRevision', 'manifestSha256', 'nowMs', 'evidence'], 'EVENT_FIELDS');
  check(['rollback', 'restored', 'cleanup'].includes(event.action), 'RECOVERY_ACTION');
  safeTime(event.nowMs, 'RECOVERY_REALTIME');
  return transition(state, { ...event, nowMs: Math.max(event.nowMs, state.lastNowMs ?? 0) });
}

module.exports = { RECORD_VERSION, MAX_CLOCK_SKEW_MS, createRecord, validateRecord, decide, recoveryTransition };
