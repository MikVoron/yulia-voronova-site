'use strict';

// Pure control journal for the future adapter. Persist the WHOLE returned value
// atomically + fsync under the same OS lock before executing the next side effect.
// Evidence is supplied by the caller; this module cannot certify PM2 or systemd.
const protocol = require('./protocol.cjs');
const recovery = require('./recovery-policy.cjs');
function check(ok, code) { if (!ok) throw new Error(code); }
const SCHEMA_VERSION = 1;
const PREFLIGHT = Object.freeze(protocol.CHECKS.arm.filter(key => key !== 'timerVerified'));
const copy = value => JSON.parse(JSON.stringify(value));
function exact(value, keys, code) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
}
function sample(value) {
  exact(value, ['bootId', 'realtimeMs', 'monotonicMs'], 'CONTROL_SAMPLE');
  check(typeof value.bootId === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.bootId), 'CONTROL_BOOT');
  check(['realtimeMs', 'monotonicMs'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0),
    'CONTROL_CLOCK');
}
function evidence(value, keys) {
  exact(value, keys, 'CONTROL_EVIDENCE');
  check(keys.every(key => value[key] === true), 'CONTROL_EVIDENCE_FAILED');
}
// Only describes the planned deadline for intent validation. This does NOT arm
// the protocol or assert timer evidence. Actual arming still calls transition().
function intendedState(state, record) {
  check(record && typeof record === 'object', 'CONTROL_INTENT_MISSING');
  return { ...state, phase: 'armed', revision: 1, lastNowMs: record.armedRealtimeMs,
    deadlineMs: record.deadlineRealtimeMs };
}
function validate(input) {
  exact(input, ['schemaVersion', 'protocolVersion', 'generation', 'stage', 'state',
    'recovery', 'lastSample', 'cancelCleanupComplete'], 'CONTROL_FIELDS');
  check(input.schemaVersion === SCHEMA_VERSION && input.protocolVersion === protocol.VERSION, 'CONTROL_VERSION');
  protocol.validateState(input.state);
  check(Number.isSafeInteger(input.generation) && input.generation >= 0, 'CONTROL_GENERATION');
  check(typeof input.cancelCleanupComplete === 'boolean', 'CONTROL_CLEANUP');
  const { stage, state, generation, cancelCleanupComplete } = input;
  if (stage === 'prepared') {
    check(state.phase === 'prepared' && generation === 0 && input.recovery === null &&
      input.lastSample === null && !cancelCleanupComplete, 'CONTROL_PREPARED');
  } else {
    sample(input.lastSample);
    if (stage === 'active') {
      check(state.phase !== 'prepared' && generation === state.revision + 1 && !cancelCleanupComplete,
        'CONTROL_ACTIVE');
      recovery.validateRecord(input.recovery, state);
    } else {
      check(['arming', 'cancelled'].includes(stage) && state.phase === 'prepared', 'CONTROL_STAGE');
      check(stage === 'arming' ? generation === 1 && !cancelCleanupComplete :
        generation === (cancelCleanupComplete ? 3 : 2), 'CONTROL_INTENT_GENERATION');
      recovery.validateRecord(input.recovery, intendedState(state, input.recovery));
      if (stage === 'arming') {
        check(input.lastSample.bootId === input.recovery.bootId &&
          input.lastSample.realtimeMs === input.recovery.armedRealtimeMs &&
          input.lastSample.monotonicMs === input.recovery.armedMonotonicMs, 'CONTROL_INTENT_SAMPLE');
      }
    }
  }
  return copy(input);
}
function create(manifest) {
  return validate({ schemaVersion: SCHEMA_VERSION, protocolVersion: protocol.VERSION,
    generation: 0, stage: 'prepared', state: protocol.createState(manifest), recovery: null,
    lastSample: null, cancelCleanupComplete: false });
}
function clockDecision(control, observed) {
  const state = control.stage === 'arming' ? intendedState(control.state, control.recovery) : control.state;
  const decision = recovery.decide(state, control.recovery, observed);
  if (decision !== 'continue') return decision;
  // The original recovery policy compares monotonic time to arming. Also reject
  // regression since the last durable operation, even if still after arming.
  if (observed.bootId !== control.lastSample.bootId ||
    observed.realtimeMs < control.lastSample.realtimeMs ||
    observed.monotonicMs < control.lastSample.monotonicMs) return 'rollback';
  return 'continue';
}
function decision(input, observed) {
  const control = validate(input);
  if (control.stage === 'prepared') return 'idle-prepared';
  // A restarted controller must cancel ambiguous arming, NEVER restart its timer
  // or finish arming from disk. Only the uninterrupted lock holder may call arm.
  if (control.stage === 'arming') return 'cancel-arm';
  if (control.stage === 'cancelled') return control.cancelCleanupComplete ? 'idle' : 'cancel-cleanup';
  return clockDecision(control, observed);
}
function update(input, request) {
  const control = validate(input);
  exact(request, ['action', 'expectedGeneration', 'manifestSha256', 'sample', 'evidence'], 'CONTROL_REQUEST');
  check(request.expectedGeneration === control.generation, 'CONTROL_STALE_GENERATION');
  check(request.manifestSha256 === control.state.manifestSha256, 'CONTROL_WRONG_MANIFEST');
  sample(request.sample);
  const { action, sample: observed } = request;
  let next = { ...control, generation: control.generation + 1, lastSample: copy(observed) };
  if (action === 'intend-arm') {
    check(control.stage === 'prepared', 'CONTROL_STAGE');
    evidence(request.evidence, PREFLIGHT);
    const future = intendedState(control.state, { armedRealtimeMs: observed.realtimeMs,
      deadlineRealtimeMs: observed.realtimeMs + protocol.ROLLBACK_WINDOW_MS });
    next.stage = 'arming';
    next.recovery = recovery.createRecord(future, observed);
  } else if (action === 'arm') {
    check(control.stage === 'arming', 'CONTROL_STAGE');
    check(clockDecision(control, observed) === 'continue', 'CONTROL_RECOVERY_REQUIRED');
    next.state = protocol.transition(control.state, { action, expectedRevision: control.state.revision,
      manifestSha256: request.manifestSha256, nowMs: control.recovery.armedRealtimeMs,
      evidence: request.evidence });
    next.stage = 'active';
  } else if (action === 'cancel-arm') {
    check(['arming', 'cancelled'].includes(control.stage), 'CONTROL_STAGE');
    evidence(request.evidence, []);
    if (control.stage === 'cancelled') return control;
    next.stage = 'cancelled'; // Persist BEFORE asking systemd to stop the timer.
  } else if (action === 'cancel-cleanup') {
    check(control.stage === 'cancelled', 'CONTROL_STAGE');
    evidence(request.evidence, protocol.CHECKS.cleanup);
    if (control.cancelCleanupComplete) return control;
    next.cancelCleanupComplete = true;
  } else {
    check(control.stage === 'active', 'CONTROL_STAGE');
    check(['switch', 'pending', 'confirm', 'commit', 'rollback', 'restored', 'cleanup'].includes(action),
      'CONTROL_ACTION');
    const recovering = ['rollback', 'restored', 'cleanup'].includes(action);
    if (!recovering) {
      check(clockDecision(control, observed) === 'continue', 'CONTROL_RECOVERY_REQUIRED');
      if (['confirm', 'commit'].includes(action)) {
        check(observed.monotonicMs < control.recovery.deadlineMonotonicMs - 120000, 'CONTROL_MONOTONIC_MARGIN');
      }
    }
    const event = { action, expectedRevision: control.state.revision,
      manifestSha256: request.manifestSha256, nowMs: observed.realtimeMs, evidence: request.evidence };
    next.state = recovering ? recovery.recoveryTransition(control.state, event) : protocol.transition(control.state, event);
    if (next.state.revision === control.state.revision) return control;
  }
  return validate(next);
}
module.exports = { SCHEMA_VERSION, PREFLIGHT, create, validate, decision, update };
