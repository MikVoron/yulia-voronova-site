'use strict';
// Split startup controller. No production paths, PM2 CLI, network or OS writes here.
// The supplied adapter holds the same OS flock as every normal release operation.
const crypto = require('node:crypto');
const state = require('./boot-state.cjs');
const control = require('./control-envelope.cjs');
const protocol = require('./protocol.cjs');
const startup = require('./startup-recovery.cjs');
const COMMON = Object.freeze(['uidGid997', 'capabilitiesZero', 'localHealth', 'publicHealth',
  'catalogAccess', 'sitemap', 'privateRoutes', 'stableProcess', 'savedPm2997', 'timerStopped', 'rollbackServiceInactive']);
const check = state.check;
function load(io, slot) {
  const journal = slot.identity.mode === 'idle' ? null : control.validate(io.readControl());
  state.binding(slot, journal);
  if (journal) {
    const manifest = protocol.validateManifest(io.readManifest());
    check(protocol.manifestDigest(manifest) === slot.identity.manifestSha256 &&
      manifest.releaseId === slot.identity.releaseId, 'BOOT_MANIFEST_BINDING');
  } else io.assertNoActiveRelease();
  return journal;
}
function update(journal, action, observed) {
  return control.update(journal, { action, expectedGeneration: journal.generation,
    manifestSha256: journal.state.manifestSha256, sample: observed, evidence: {} });
}
function prepare(io) {
  io.assertLocked();
  const before = state.validate(io.readSlot()), original = load(io, before), observed = io.clock();
  state.sample(observed); io.assertQuiescent();
  // Gate FIRST: a killed helper cannot leave release actions enabled between steps.
  const gate = state.begin(before, (io.nonce || (() => crypto.randomBytes(16).toString('hex')))(), observed);
  io.writeSlot(gate); io.checkpoint('gate-written');
  const choice = original ? startup.plan(original, observed) : { action: 'baseline', version: 'baseline' };
  let journal = original;
  if (choice.action === 'cancel-start-old' || choice.action === 'rollback') {
    journal = update(original, choice.action === 'rollback' ? 'rollback' : 'cancel-arm', observed);
    io.writeControl(journal); io.checkpoint('decision-written');
  }
  // Filesystem-only operation: no manager start, HTTP or database readiness wait.
  const proof = io.prepareArtifacts(choice.version, choice.action === 'rollback');
  state.artifacts(proof); io.assertQuiescent();
  check(state.equal(load(io, gate), journal), 'BOOT_JOURNAL_CHANGED');
  const receipt = state.prepared(gate, journal, choice.version, proof, io.clock());
  io.writeSlot(receipt); io.checkpoint('receipt-written');
  return receipt;
}
function checks(version) {
  return [...COMMON, ...(version === 'new' ? ['newHashesMatch'] :
    version === 'old' ? ['oldHashesMatch', 'oldModulesVerified'] : ['baselineHashesMatch'])];
}
function receiptClock(slot, observed) {
  state.sample(observed);
  check(observed.bootId === slot.attempt.sample.bootId &&
    observed.monotonicMs >= slot.receipt.sample.monotonicMs, 'BOOT_RECEIPT_EXPIRED');
}
async function postStart(io) {
  io.assertLocked();
  let gate = state.validate(io.readSlot());
  check(['prepared', 'finalizing', 'verified'].includes(gate.status), 'BOOT_POST_WITHOUT_PREPARE');
  receiptClock(gate, io.clock());
  const journal = load(io, gate), lineage = state.chain(gate);
  const position = lineage.findIndex(value => state.equal(value, journal));
  check(position >= 0 && (gate.status !== 'verified' || position === lineage.length - 1), 'BOOT_STALE_RECEIPT');
  check(state.equal(io.verifyArtifacts(gate.receipt.version), gate.receipt.artifacts), 'BOOT_ARTIFACT_DRIFT');
  const observation = await io.observe(gate.receipt.version);
  state.exact(observation, ['evidence', 'processSha256'], 'BOOT_OBSERVATION');
  const required = checks(gate.receipt.version);
  state.exact(observation.evidence, required, 'BOOT_EVIDENCE_FIELDS');
  check(required.every(key => observation.evidence[key] === true), 'BOOT_EVIDENCE_FAILED');
  check(typeof observation.processSha256 === 'string' && /^[a-f0-9]{64}$/.test(observation.processSha256), 'BOOT_PROCESS_HASH');
  // Recheck after asynchronous probes, before recording any restored/cleanup decision.
  check(state.equal(io.verifyArtifacts(gate.receipt.version), gate.receipt.artifacts), 'BOOT_ARTIFACT_DRIFT');
  check(state.equal(load(io, gate), journal), 'BOOT_JOURNAL_CHANGED');
  const observed = io.clock(); receiptClock(gate, observed);
  io.assertProcessIdentity(observation.processSha256);
  if (gate.status === 'prepared') {
    gate = state.finalizing(gate, { sample: observed, processSha256: observation.processSha256 });
    io.writeSlot(gate); io.checkpoint('verification-written');
  } else check(observation.processSha256 === gate.verification.processSha256, 'BOOT_PROCESS_CHANGED');
  if (gate.status === 'verified') return gate;
  // Persisted deterministic lineage makes a crash after restored or cleanup retryable.
  const targets = state.chain(gate), current = targets.findIndex(value => state.equal(value, journal));
  check(current >= 0, 'BOOT_STALE_RECEIPT');
  for (const target of targets.slice(current + 1)) {
    io.writeControl(target); io.checkpoint(target.state.phase === 'rolled_back' && !target.state.cleanupComplete
      ? 'restored-written' : 'cleanup-written');
  }
  gate = state.verified(gate); io.writeSlot(gate); io.checkpoint('verified-written');
  return gate;
}
module.exports = { COMMON, checks, prepare, postStart };
