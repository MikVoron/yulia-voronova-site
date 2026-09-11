'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const control = require('../control-envelope.cjs');
const { CHECKS } = require('../protocol.cjs');
const { manifest, clock, request } = require('./fixtures/control-values.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function step(value, action, elapsed = 0) { return control.update(value, request(value, action, clock(elapsed))); }
function setup(phase = 'armed') {
  let value = control.create(manifest());
  for (const action of ['intend-arm', 'arm', 'switch', 'pending', 'confirm', 'commit']) {
    if (value.state.phase === phase && (phase !== 'prepared' || value.stage === 'prepared')) break;
    value = step(value, action);
  }
  return value;
}

test('arming intent is a distinct durable generation; arm keeps both original deadlines', () => {
  const before = control.create(manifest()), snapshot = clone(before);
  const intent = step(before, 'intend-arm');
  assert.deepEqual(before, snapshot);
  assert.equal(intent.state.phase, 'prepared');
  assert.equal(intent.state.revision, 0);
  assert.equal(intent.generation, 1);
  assert.equal(control.decision(clone(intent), clock()), 'cancel-arm');
  const armed = step(intent, 'arm', 2000);
  assert.equal(armed.generation, 2);
  assert.equal(armed.state.revision, 1);
  assert.equal(armed.state.deadlineMs, clock().realtimeMs + 600000);
  assert.equal(armed.recovery.deadlineMonotonicMs, clock().monotonicMs + 600000);
  assert.deepEqual(armed.recovery, intent.recovery);
  assert.deepEqual(armed.lastSample, clock(2000));
  assert.equal(control.decision(armed, clock(2001)), 'continue');
});

test('interrupted arming is cancelled durably before timer cleanup, including a changed boot', () => {
  const intent = step(control.create(manifest()), 'intend-arm');
  const reset = { bootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', realtimeMs: 0, monotonicMs: 0 };
  assert.equal(control.decision(intent, reset), 'cancel-arm');
  assert.throws(() => control.update(intent, request(intent, 'arm', reset)), /RECOVERY_REQUIRED/);
  const cancelled = control.update(intent, request(intent, 'cancel-arm', reset));
  assert.equal(cancelled.state.phase, 'prepared');
  assert.equal(cancelled.cancelCleanupComplete, false);
  assert.equal(control.decision(cancelled, null), 'cancel-cleanup');
  assert.deepEqual(step(cancelled, 'cancel-arm'), cancelled);
  assert.throws(() => step(cancelled, 'arm'), /CONTROL_STAGE/);
  assert.throws(() => step(cancelled, 'intend-arm'), /CONTROL_STAGE/);
  for (const key of CHECKS.cleanup) {
    const command = request(cancelled, 'cancel-cleanup', reset); command.evidence[key] = false;
    assert.throws(() => control.update(cancelled, command), /EVIDENCE_FAILED/);
  }
  const clean = control.update(cancelled, request(cancelled, 'cancel-cleanup', reset));
  assert.equal(control.decision(clean, null), 'idle');
  assert.deepEqual(step(clean, 'cancel-cleanup'), clean);
});

test('preflight and timer evidence cannot be skipped at either arming boundary', () => {
  const prepared = control.create(manifest()), intent = step(prepared, 'intend-arm');
  for (const [value, action, keys] of [[prepared, 'intend-arm', control.PREFLIGHT], [intent, 'arm', CHECKS.arm]]) {
    for (const key of keys) {
      const command = request(value, action); command.evidence[key] = false;
      assert.throws(() => control.update(value, command), /EVIDENCE_FAILED/);
    }
  }
  assert.throws(() => step(prepared, 'arm'), /CONTROL_STAGE/);
  assert.throws(() => step(intent, 'switch'), /CONTROL_STAGE/);
  assert.throws(() => step(intent, 'cancel-cleanup'), /CONTROL_STAGE/);
  assert.throws(() => step(intent, 'arm', 600000), /RECOVERY_REQUIRED/);
});

test('every state and record travels together; mixed release identity or deadlines are refused', () => {
  const armed = setup();
  for (const edit of [x => { x.recovery = null; }, x => { x.state.releaseId = 'other'; },
    x => { x.recovery.manifestSha256 = 'f'.repeat(64); }, x => { x.recovery.deadlineRealtimeMs++; },
    x => { x.recovery.deadlineMonotonicMs++; }, x => { x.protocolVersion = '0.1.0'; },
    x => { x.schemaVersion = 0; }, x => { x.extra = true; }, x => { x.generation++; },
    x => { x.stage = 'cancelled'; }, x => { x.lastSample = null; }, x => { x.cancelCleanupComplete = true; }]) {
    const damaged = clone(armed); edit(damaged);
    assert.throws(() => control.validate(damaged));
    assert.throws(() => control.decision(damaged, clock()));
  }
  const detached = control.validate(armed); detached.state.releaseId = 'mutated';
  assert.equal(armed.state.releaseId, 'control-test');
});

test('stale commands include intent and cancellation generations even while protocol revision stays zero', () => {
  const prepared = control.create(manifest());
  const command = request(prepared, 'intend-arm');
  const intent = control.update(prepared, command);
  assert.throws(() => control.update(intent, command), /STALE_GENERATION/);
  const cancel = request(intent, 'cancel-arm'), cancelled = control.update(intent, cancel);
  assert.throws(() => control.update(cancelled, cancel), /STALE_GENERATION/);
  const arm = request(intent, 'arm');
  assert.throws(() => control.update(cancelled, arm), /STALE_GENERATION/);
  assert.throws(() => control.update(intent, { ...arm, manifestSha256: 'f'.repeat(64) }), /WRONG_MANIFEST/);
});

test('confirmation needs the two-minute margin on BOTH clocks, including tolerated skew', () => {
  for (const [phase, action] of [['pending', 'confirm'], ['confirming', 'commit']]) {
    const value = setup(phase);
    const boundary = { ...clock(479000), monotonicMs: value.recovery.deadlineMonotonicMs - 120000 };
    assert.equal(control.decision(value, boundary), 'continue');
    assert.throws(() => control.update(value, request(value, action, boundary)), /MONOTONIC_MARGIN/);
    boundary.monotonicMs--;
    assert.doesNotThrow(() => control.update(value, request(value, action, boundary)));
    assert.throws(() => step(value, action, 480000), /MARGIN|DEADLINE/);
  }
});

test('clock regression since the last operation blocks progress even after the arm sample', () => {
  const pending = step(step(setup(), 'switch', 1000), 'pending', 2000);
  for (const observed of [{ ...clock(2001), monotonicMs: clock(1999).monotonicMs },
    { ...clock(2001), realtimeMs: clock(1999).realtimeMs }]) {
    assert.equal(control.decision(pending, observed), 'rollback');
    assert.throws(() => control.update(pending, request(pending, 'confirm', observed)), /RECOVERY_REQUIRED/);
  }
});

test('rollback after a reboot keeps the raw clock sample and preserves the durable logical time', () => {
  let value = step(step(setup(), 'switch', 1000), 'pending', 2000);
  const reset = { bootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', realtimeMs: 1, monotonicMs: 1 };
  assert.equal(control.decision(value, reset), 'rollback');
  for (const action of ['rollback', 'restored', 'cleanup']) {
    value = control.update(value, request(value, action, reset));
    assert.equal(value.state.lastNowMs, clock(2000).realtimeMs);
    assert.deepEqual(value.lastSample, reset);
  }
  assert.equal(value.state.phase, 'rolled_back');
  assert.equal(value.state.cleanupComplete, true);
  assert.equal(control.decision(value, null), 'idle');
});

test('durable terminal decisions survive late rollback and repeated cleanup without a new generation', () => {
  for (let value of [setup('confirmed'), step(step(setup(), 'rollback'), 'restored')]) {
    assert.equal(control.decision(value, null), 'cleanup');
    assert.deepEqual(step(value, 'rollback'), value);
    value = step(value, 'cleanup');
    assert.deepEqual(step(value, 'cleanup'), value);
    assert.deepEqual(step(value, 'rollback'), value);
    assert.equal(control.decision(value, null), 'idle');
  }
});

test('forward and recovery evidence retain the original protocol gates', () => {
  for (const [value, action] of [[setup(), 'switch'], [setup('switching'), 'pending'],
    [setup('pending'), 'confirm'], [setup('confirming'), 'commit'],
    [step(setup(), 'rollback'), 'restored'], [setup('confirmed'), 'cleanup']]) {
    for (const key of CHECKS[action]) {
      const command = request(value, action); command.evidence[key] = false;
      assert.throws(() => control.update(value, command), /EVIDENCE_FAILED/);
    }
  }
  assert.throws(() => step(setup(), 'cleanup'), /INVALID_TRANSITION/);
  assert.throws(() => step(setup('pending'), 'restored'), /INVALID_TRANSITION/);
  const rolling = step(setup('pending'), 'rollback');
  assert.equal(control.decision(rolling, clock()), 'rollback');
  assert.throws(() => step(rolling, 'confirm'), /RECOVERY_REQUIRED/);
});

test('invalid samples, requests, extra fields and clock overflow cannot enter the journal', () => {
  const prepared = control.create(manifest());
  assert.equal(control.decision(prepared, null), 'idle-prepared');
  for (const observed of [null, {}, { ...clock(), extra: 1 }, { ...clock(), bootId: 'invalid' },
    ...[-1, NaN, Infinity, 1.5, '1', null, Number.MAX_SAFE_INTEGER].map(realtimeMs => ({ ...clock(), realtimeMs })),
    { ...clock(), monotonicMs: Number.MAX_SAFE_INTEGER }]) {
    assert.throws(() => control.update(prepared, request(prepared, 'intend-arm', observed)));
  }
  const command = request(prepared, 'intend-arm');
  assert.throws(() => control.update(prepared, { ...command, extra: true }), /CONTROL_REQUEST/);
  assert.throws(() => control.update(prepared, { ...command, evidence: { ...command.evidence, timerVerified: true } }), /CONTROL_EVIDENCE/);
  assert.throws(() => step(setup(), 'deploy'), /CONTROL_ACTION/);
});
