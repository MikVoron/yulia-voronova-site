'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, transition, CHECKS, ROLLBACK_WINDOW_MS } = require('../protocol.cjs');
const { RECORD_VERSION, createRecord, decide, validateRecord, recoveryTransition } = require('../recovery-policy.cjs');

const boot = '11111111-2222-3333-4444-555555555555';
const nextBoot = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function manifest() {
  return { schemaVersion: 1, releaseId: 'recovery-test', commit: 'a'.repeat(40), kind: 'dependencies',
    files: [{ path: 'package.json', beforeSha256: '1'.repeat(64), afterSha256: '2'.repeat(64) },
      { path: 'package-lock.json', beforeSha256: '3'.repeat(64), afterSha256: '4'.repeat(64) }],
    probes: [{ module: 'fastify', version: '5.12.3' }] };
}
function event(state, action, nowMs) {
  return { action, expectedRevision: state.revision, manifestSha256: state.manifestSha256, nowMs,
    evidence: Object.fromEntries((CHECKS[action] || []).map(key => [key, true])) };
}
function armed() {
  const prepared = createState(manifest());
  return transition(prepared, event(prepared, 'arm', 10000));
}
function setup(phase = 'armed') {
  let state = armed();
  const record = createRecord(state, { bootId: boot, realtimeMs: 10000, monotonicMs: 500000 });
  const actions = ['switch', 'pending'];
  if (['rolling_back', 'rolled_back'].includes(phase)) actions.push('rollback', 'restored');
  else actions.push('confirm', 'commit');
  for (const action of actions) {
    if (state.phase === phase) break;
    state = transition(state, event(state, action, state.lastNowMs + 1000));
  }
  assert.equal(state.phase, phase);
  return { state, record };
}
test('same boot and agreeing clocks may continue only before both deadlines', () => {
  const { state, record } = setup();
  assert.equal(decide(state, record, { bootId: boot, realtimeMs: 20000, monotonicMs: 510000 }), 'continue');
});
test('a boot change, backwards realtime or backwards monotonic clock selects rollback', () => {
  const { state, record } = setup();
  for (const observer of [
    { bootId: nextBoot, realtimeMs: 20000, monotonicMs: 100 },
    { bootId: boot, realtimeMs: 9999, monotonicMs: 500001 },
    { bootId: boot, realtimeMs: 10001, monotonicMs: 499999 }
  ]) assert.equal(decide(state, record, observer), 'rollback');
});
test('either deadline is sufficient, including its exact boundary', () => {
  const { state, record } = setup();
  assert.equal(decide(state, record, { bootId: boot, realtimeMs: state.deadlineMs - 1,
    monotonicMs: record.deadlineMonotonicMs - 1 }), 'continue');
  for (const observer of [
    { bootId: boot, realtimeMs: state.deadlineMs, monotonicMs: record.deadlineMonotonicMs - 1 },
    { bootId: boot, realtimeMs: state.deadlineMs - 1, monotonicMs: record.deadlineMonotonicMs },
    { bootId: boot, realtimeMs: state.deadlineMs + 1, monotonicMs: record.deadlineMonotonicMs + 1 }
  ]) assert.equal(decide(state, record, observer), 'rollback');
});
test('clock skew in both directions reaches the skew gate, not an earlier time guard', () => {
  const { state, record } = setup();
  for (const [monotonicMs, expected] of [[515000, 'continue'], [525000, 'continue'],
    [514999, 'rollback'], [525001, 'rollback']]) {
    assert.ok(monotonicMs > record.armedMonotonicMs && monotonicMs < record.deadlineMonotonicMs);
    assert.equal(decide(state, record, { bootId: boot, realtimeMs: 30000, monotonicMs }), expected);
  }
});
test('clock reversal recovers every nonterminal phase through rollback, restore and cleanup', () => {
  for (const phase of ['armed', 'switching', 'pending', 'confirming', 'rolling_back']) {
    const { state: initial, record } = setup(phase);
    let state = initial;
    const observer = { bootId: boot, realtimeMs: 9999, monotonicMs: 510000 };
    assert.equal(decide(state, record, observer), 'rollback');
    // Reproduce the original integration failure with the strict forward API.
    assert.throws(() => transition(state, event(state, 'rollback', observer.realtimeMs)), /CLOCK_MOVED_BACKWARDS/);
    for (const [index, action] of ['rollback', 'restored', 'cleanup'].entries()) {
      const before = JSON.stringify(state);
      const next = recoveryTransition(state, event(state, action, observer.realtimeMs - index));
      assert.equal(JSON.stringify(state), before, 'inputs remain immutable');
      assert.equal(next.lastNowMs, initial.lastNowMs);
      assert.equal(next.deadlineMs, initial.deadlineMs, 'recovery must not extend the deadline');
      state = JSON.parse(JSON.stringify(next)); // simulated persisted/reloaded value, not fsync evidence
    }
    assert.equal(state.phase, 'rolled_back');
    assert.equal(state.cleanupComplete, true);
    assert.equal(decide(state, record, observer), 'idle');
  }
});
test('a new boot with a reset clock recovers through the actual protocol transitions', () => {
  let { state, record } = setup('pending');
  const observer = { bootId: nextBoot, realtimeMs: 1, monotonicMs: 1 };
  assert.equal(decide(state, record, observer), 'rollback');
  for (const action of ['rollback', 'restored', 'cleanup']) {
    state = recoveryTransition(state, event(state, action, observer.realtimeMs));
  }
  assert.equal(state.phase, 'rolled_back');
  assert.equal(state.cleanupComplete, true);
});
test('an interrupted rollback resumes immediately even with healthy clocks before deadline', () => {
  const { state, record } = setup('rolling_back');
  assert.equal(decide(state, record, { bootId: boot, realtimeMs: 20000, monotonicMs: 510000 }), 'rollback');
  const retried = recoveryTransition(state, event(state, 'rollback', 20000));
  assert.equal(retried.phase, 'rolling_back');
  assert.equal(retried.cleanupComplete, false);
  assert.equal(retried.revision, state.revision + 1);
});
test('both terminal decisions survive backward clocks and repeated rollback/cleanup', () => {
  for (const phase of ['confirmed', 'rolled_back']) {
    const { state, record } = setup(phase);
    const observer = { bootId: nextBoot, realtimeMs: 0, monotonicMs: 0 };
    assert.equal(decide(state, record, observer), 'cleanup');
    assert.deepEqual(recoveryTransition(state, event(state, 'rollback', 0)), state);
    const clean = recoveryTransition(state, event(state, 'cleanup', 0));
    assert.equal(clean.phase, phase);
    assert.equal(clean.cleanupComplete, true);
    assert.equal(decide(clean, record, observer), 'idle');
    assert.deepEqual(recoveryTransition(clean, event(clean, 'cleanup', 0)), clean);
    assert.deepEqual(recoveryTransition(clean, event(clean, 'rollback', 0)), clean);
    // Old clock metadata is not needed after a validated durable decision.
    assert.equal(decide(state, null, null), 'cleanup');
    assert.equal(decide(clean, null, null), 'idle');
  }
});
test('recovery normalization cannot be used for any forward action', () => {
  const { state } = setup('pending');
  for (const action of ['arm', 'switch', 'pending', 'confirm', 'commit', 'unknown']) {
    assert.throws(() => recoveryTransition(state, event(state, action, 0)), /RECOVERY_ACTION/);
  }
  assert.throws(() => transition(state, event(state, 'confirm', 0)), /CLOCK_MOVED_BACKWARDS/);
  assert.throws(() => transition(state, event(state, 'confirm', state.deadlineMs - 120000)), /DEADLINE/);
  const { state: confirming } = setup('confirming');
  assert.throws(() => transition(confirming, event(confirming, 'commit', 0)), /CLOCK_MOVED_BACKWARDS/);
  assert.throws(() => transition(confirming, event(confirming, 'commit', confirming.deadlineMs - 120000)), /DEADLINE/);
});
test('normalization preserves identity, revision, evidence and phase checks', () => {
  const { state } = setup('rolling_back');
  const base = event(state, 'restored', 0);
  assert.throws(() => recoveryTransition(state, { ...base, expectedRevision: state.revision - 1 }), /STALE_REVISION/);
  assert.throws(() => recoveryTransition(state, { ...base, manifestSha256: 'f'.repeat(64) }), /WRONG_MANIFEST/);
  for (const key of CHECKS.restored) {
    assert.throws(() => recoveryTransition(state, { ...base, evidence: { ...base.evidence, [key]: false } }), /EVIDENCE_FAILED/);
  }
  const { state: terminal } = setup('confirmed');
  const cleanup = event(terminal, 'cleanup', 0);
  for (const key of CHECKS.cleanup) {
    assert.throws(() => recoveryTransition(terminal, { ...cleanup, evidence: { ...cleanup.evidence, [key]: false } }), /EVIDENCE_FAILED/);
  }
  assert.throws(() => recoveryTransition(state, event(state, 'cleanup', 0)), /INVALID_TRANSITION/);
  const { state: pending } = setup('pending');
  assert.throws(() => recoveryTransition(pending, event(pending, 'restored', 0)), /INVALID_TRANSITION/);
});
test('bad event timestamps are refused before normalization, not coerced into valid time', () => {
  const { state } = setup('pending');
  for (const nowMs of [-1, NaN, Infinity, 1.5, '1000', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => recoveryTransition(state, event(state, 'rollback', nowMs)), /RECOVERY_REALTIME/);
  }
  const base = event(state, 'rollback', 0);
  assert.throws(() => recoveryTransition(state, { ...base, extra: true }), /EVENT_FIELDS/);
  const incomplete = { ...base }; delete incomplete.expectedRevision;
  assert.throws(() => recoveryTransition(state, incomplete), /EVENT_FIELDS/);
});
test('record binding rejects another release or manifest even with the same deadline', () => {
  const { state, record } = setup();
  assert.deepEqual(validateRecord(record, state), record);
  for (const changed of [{ ...state, releaseId: 'another-release' },
    { ...state, manifestSha256: 'f'.repeat(64) }, { ...state, deadlineMs: state.deadlineMs + 1 }]) {
    assert.throws(() => validateRecord(record, changed), /RECOVERY_PROTOCOL_BINDING/);
  }
});
test('both recorded windows must equal the protocol ten-minute interval', () => {
  const { state, record } = setup();
  for (const changed of [{ ...record, deadlineMonotonicMs: record.deadlineMonotonicMs + 1 },
    { ...record, armedMonotonicMs: record.armedMonotonicMs + 1 },
    { ...record, armedRealtimeMs: record.armedRealtimeMs - 1 },
    { ...record, armedRealtimeMs: record.armedRealtimeMs - 1, armedMonotonicMs: record.armedMonotonicMs - 1 }]) {
    assert.throws(() => validateRecord(changed, state), /RECOVERY_WINDOW/);
  }
});
test('record creation uses the arm sample and validates the complete output including overflow', () => {
  const { state, record } = setup();
  assert.equal(record.schemaVersion, RECORD_VERSION);
  assert.ok(Object.isFrozen(record));
  for (const realtimeMs of [9999, 10001]) {
    assert.throws(() => createRecord(state, { bootId: boot, realtimeMs, monotonicMs: 500000 }), /RECOVERY_ARMED_STATE/);
  }
  const largestStart = Number.MAX_SAFE_INTEGER - ROLLBACK_WINDOW_MS;
  const edge = createRecord(state, { bootId: boot, realtimeMs: 10000, monotonicMs: largestStart });
  assert.equal(edge.deadlineMonotonicMs, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(validateRecord(edge, state), edge);
  assert.throws(() => createRecord(state, { bootId: boot, realtimeMs: 10000, monotonicMs: largestStart + 1 }), /RECOVERY_RECORD_TIME/);
  assert.throws(() => createRecord({ ...state, revision: 2 }, { bootId: boot, realtimeMs: 10000, monotonicMs: 500000 }), /RECOVERY_ARMED_STATE/);
});
test('malformed, old, missing or inconsistent metadata blocks nonterminal progress', () => {
  const { state, record } = setup();
  const observer = { bootId: boot, realtimeMs: 20000, monotonicMs: 510000 };
  for (const value of [null, {}, { ...record, schemaVersion: 1 }, { ...record, extra: true },
    { ...record, bootId: 'invalid' }, { ...record, armedMonotonicMs: -1 },
    { ...record, deadlineMonotonicMs: record.armedMonotonicMs }]) {
    assert.throws(() => decide(state, value, observer), /RECOVERY_RECORD/);
  }
  for (const value of [null, {}, { ...observer, extra: true }, { ...observer, bootId: 'invalid' },
    { ...observer, realtimeMs: -1 }, { ...observer, monotonicMs: NaN }]) {
    assert.throws(() => decide(state, record, value), /RECOVERY_/);
  }
  assert.throws(() => decide(createState(manifest()), null, observer), /RECOVERY_NOT_ARMED/);
  assert.throws(() => createRecord({ ...state, cleanupComplete: true }, observer), /STATE_CLEANUP/);
});
test('corrupt terminal state is rejected instead of being treated as safely cleaned up', () => {
  const { state, record } = setup();
  assert.throws(() => decide({ ...state, phase: 'confirmed', cleanupComplete: true, deadlineMs: null }, record,
    { bootId: boot, realtimeMs: 20000, monotonicMs: 510000 }), /STATE_INCONSISTENT/);
});
