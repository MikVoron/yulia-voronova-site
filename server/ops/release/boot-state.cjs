'use strict';
// Durable startup gate. Pure values only; its OS adapter must use the release flock.
const protocol = require('./protocol.cjs');
const control = require('./control-envelope.cjs');
const SHA = /^[a-f0-9]{64}$/;
const clone = value => JSON.parse(JSON.stringify(value));
function check(ok, code) { if (!ok) throw new Error(code); }
function exact(value, keys, code) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), code);
}
function sample(value) {
  exact(value, ['bootId', 'realtimeMs', 'monotonicMs'], 'BOOT_SAMPLE');
  check(typeof value.bootId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.bootId) &&
    ['realtimeMs', 'monotonicMs'].every(k => Number.isSafeInteger(value[k]) && value[k] >= 0), 'BOOT_CLOCK');
}
function artifacts(value) {
  exact(value, ['treeSha256', 'dumpSha256'], 'BOOT_ARTIFACT_FIELDS');
  check(Object.values(value).every(v => typeof v === 'string' && SHA.test(v)), 'BOOT_ARTIFACT_HASH');
}
function binding(slot, journal) {
  if (slot.identity.mode === 'idle') check(journal === null, 'BOOT_IDLE_JOURNAL');
  else {
    control.validate(journal);
    check(journal.state.releaseId === slot.identity.releaseId &&
      journal.state.manifestSha256 === slot.identity.manifestSha256, 'BOOT_RELEASE_BINDING');
  }
}
function validate(input) {
  exact(input, ['schemaVersion', 'protocolVersion', 'identity', 'status', 'attempt', 'receipt', 'verification'], 'BOOT_FIELDS');
  check(input.schemaVersion === 1 && input.protocolVersion === protocol.VERSION, 'BOOT_VERSION');
  const { identity, status, attempt, receipt, verification } = input;
  if (identity?.mode === 'idle') {
    exact(identity, ['mode', 'baseline'], 'BOOT_IDLE_FIELDS'); artifacts(identity.baseline);
  } else {
    exact(identity, ['mode', 'releaseId', 'manifestSha256'], 'BOOT_IDENTITY');
    check(identity.mode === 'release' && typeof identity.releaseId === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(identity.releaseId) &&
      typeof identity.manifestSha256 === 'string' && SHA.test(identity.manifestSha256), 'BOOT_IDENTITY');
  }
  check(['open', 'preparing', 'prepared', 'finalizing', 'verified'].includes(status), 'BOOT_STATUS');
  if (status === 'open') {
    check(attempt === null && receipt === null && verification === null, 'BOOT_OPEN');
  } else {
    exact(attempt, ['id', 'sample'], 'BOOT_ATTEMPT'); sample(attempt.sample);
    check(typeof attempt.id === 'string' && /^[a-f0-9]{32}$/.test(attempt.id), 'BOOT_ATTEMPT_ID');
    if (status === 'preparing') check(receipt === null && verification === null, 'BOOT_PREPARING');
    else {
      exact(receipt, ['control', 'version', 'artifacts', 'sample'], 'BOOT_RECEIPT');
      sample(receipt.sample); artifacts(receipt.artifacts); binding(input, receipt.control);
      check(receipt.sample.bootId === attempt.sample.bootId &&
        receipt.sample.monotonicMs >= attempt.sample.monotonicMs, 'BOOT_RECEIPT_CLOCK');
      if (identity.mode === 'idle') {
        check(receipt.version === 'baseline' && equal(receipt.artifacts, identity.baseline), 'BOOT_IDLE_BASELINE');
      } else {
        const entry = receipt.control;
        const allowed = entry.stage === 'prepared' || entry.stage === 'cancelled' ||
          (entry.stage === 'active' && ['rolling_back', 'confirmed', 'rolled_back'].includes(entry.state.phase));
        check(allowed && receipt.version === (entry.state.phase === 'confirmed' ? 'new' : 'old'), 'BOOT_SELECTION');
      }
      if (status === 'prepared') check(verification === null, 'BOOT_PREPARED');
      else {
        exact(verification, ['sample', 'processSha256'], 'BOOT_VERIFICATION'); sample(verification.sample);
        check(typeof verification.processSha256 === 'string' && SHA.test(verification.processSha256), 'BOOT_PROCESS_HASH');
        check(verification.sample.bootId === receipt.sample.bootId &&
          verification.sample.monotonicMs >= receipt.sample.monotonicMs, 'BOOT_VERIFICATION_CLOCK');
      }
    }
  }
  return clone(input);
}
// Canonical digest for records with a fixed validated schema; no caller key order dependency.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function digest(value) { return protocol.sha256(JSON.stringify(canonical(value))); }
function equal(a, b) { return digest(a) === digest(b); }
function createActive(manifest, journal) {
  const m = protocol.validateManifest(manifest);
  const value = validate({ schemaVersion: 1, protocolVersion: protocol.VERSION,
    identity: { mode: 'release', releaseId: m.releaseId, manifestSha256: protocol.manifestDigest(m) },
    status: 'open', attempt: null, receipt: null, verification: null });
  binding(value, journal); return value;
}
function createIdle(baseline) {
  return validate({ schemaVersion: 1, protocolVersion: protocol.VERSION,
    identity: { mode: 'idle', baseline }, status: 'open', attempt: null, receipt: null, verification: null });
}
function begin(slot, id, observed) {
  return validate({ ...validate(slot), status: 'preparing', attempt: { id, sample: observed }, receipt: null, verification: null });
}
function prepared(slot, journal, version, proof, observed) {
  const value = validate(slot); check(value.status === 'preparing', 'BOOT_NOT_PREPARING');
  return validate({ ...value, status: 'prepared', receipt: { control: journal, version, artifacts: proof, sample: observed } });
}
function finalizing(slot, verification) {
  const value = validate(slot); check(value.status === 'prepared', 'BOOT_NOT_PREPARED');
  return validate({ ...value, status: 'finalizing', verification });
}
function verified(slot) {
  const value = validate(slot); check(value.status === 'finalizing', 'BOOT_NOT_FINALIZING');
  return validate({ ...value, status: 'verified' });
}
function chain(slot) {
  const value = validate(slot), result = [value.receipt?.control ?? null];
  if (!value.verification || value.identity.mode === 'idle') return result;
  let entry = value.receipt.control;
  const step = action => {
    const keys = action === 'cancel-cleanup' ? protocol.CHECKS.cleanup : protocol.CHECKS[action];
    entry = control.update(entry, { action, expectedGeneration: entry.generation,
      manifestSha256: entry.state.manifestSha256, sample: value.verification.sample,
      evidence: Object.fromEntries(keys.map(k => [k, true])) });
    result.push(entry);
  };
  if (entry.state.phase === 'rolling_back') step('restored');
  if (['confirmed', 'rolled_back'].includes(entry.state.phase) && !entry.state.cleanupComplete) step('cleanup');
  if (entry.stage === 'cancelled' && !entry.cancelCleanupComplete) step('cancel-cleanup');
  return result;
}
function assertOpen(slot, journal) {
  const value = validate(slot); binding(value, journal);
  check(['open', 'verified'].includes(value.status), 'BOOT_RELEASE_BLOCKED');
}
module.exports = { check, exact, sample, artifacts, validate, binding, digest, equal,
  createActive, createIdle, begin, prepared, finalizing, verified, chain, assertOpen };
