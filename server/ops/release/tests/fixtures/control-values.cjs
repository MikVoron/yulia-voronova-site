'use strict';
// Model evidence ONLY. Never import this fixture into a real release adapter.
const { CHECKS } = require('../../protocol.cjs');
const { PREFLIGHT } = require('../../control-envelope.cjs');
const bootId = '11111111-2222-3333-4444-555555555555';
function manifest() {
  return { schemaVersion: 1, releaseId: 'control-test', commit: 'a'.repeat(40), kind: 'dependencies',
    files: [{ path: 'package.json', beforeSha256: '1'.repeat(64), afterSha256: '2'.repeat(64) },
      { path: 'package-lock.json', beforeSha256: '3'.repeat(64), afterSha256: '4'.repeat(64) }],
    probes: [{ module: 'release-fixture', version: '1.0.0' }] };
}
function clock(elapsed = 0) { return { bootId, realtimeMs: 1000000 + elapsed, monotonicMs: 500000 + elapsed }; }
function request(control, action, observed = clock()) {
  const keys = action === 'intend-arm' ? PREFLIGHT : action === 'cancel-cleanup' ? CHECKS.cleanup : CHECKS[action] || [];
  return { action, expectedGeneration: control.generation, manifestSha256: control.state.manifestSha256,
    sample: observed, evidence: Object.fromEntries(keys.map(key => [key, true])) };
}
module.exports = { manifest, clock, request };
