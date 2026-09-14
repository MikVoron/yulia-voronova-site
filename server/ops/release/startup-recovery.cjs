'use strict';
// Cold-start choice only. The caller must hold the journal lock and prove the
// selected manager and rollback resources are stopped before applying this plan.
const control = require('./control-envelope.cjs');

function plan(entry, observed) {
  const value = control.validate(entry);
  const decision = control.decision(value, observed);
  if (value.stage === 'prepared') return { action: 'start-old', version: 'old', decision };
  if (value.stage === 'arming') return { action: 'cancel-start-old', version: 'old', decision };
  if (value.stage === 'cancelled') return { action: 'start-old', version: 'old', decision };
  if (value.state.phase === 'confirmed') return { action: 'start-confirmed', version: 'new', decision };
  if (value.state.phase === 'rolled_back') return { action: 'start-old', version: 'old', decision };
  // Even on the same boot, a stopped manager must not resurrect an unconfirmed
  // candidate just because the old timer's deadline has not elapsed yet.
  return { action: 'rollback', version: 'old', decision };
}

function modelPreviousBoot(entry, hostBootId) {
  const value = control.validate(entry);
  if (value.stage === 'prepared') return value;
  if (value.recovery.bootId !== hostBootId || value.lastSample.bootId !== hostBootId)
    throw new Error('STARTUP_FIXTURE_BOOT_BINDING');
  const previous = hostBootId === '00000000-0000-0000-0000-000000000001'
    ? '00000000-0000-0000-0000-000000000002' : '00000000-0000-0000-0000-000000000001';
  value.recovery.bootId = previous;
  value.lastSample.bootId = previous;
  return control.validate(value);
}

module.exports = { plan, modelPreviousBoot };
