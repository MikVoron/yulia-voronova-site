'use strict';

// Pure protocol prototype. No subprocesses, filesystem mutations or production adapter.
const crypto = require('node:crypto');
const VERSION = '0.2.0';
const FILES = Object.freeze(['package.json', 'package-lock.json']);
const STATES = Object.freeze(['prepared', 'armed', 'switching', 'pending',
  'confirming', 'confirmed', 'rolling_back', 'rolled_back']);
const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const MODULE = /^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/;
const CHECKS = Object.freeze({
  arm: ['checkpointVerified', 'offlineModulesVerified', 'candidateLoadedAs997',
    'candidateTestsPassed', 'auditZero', 'baselineUnchanged', 'timerVerified'],
  switch: ['baselineUnchanged', 'timerVerified'],
  pending: ['newHashesMatch', 'uidGid997', 'capabilitiesZero', 'localHealth',
    'publicHealth', 'catalogAccess', 'sitemap', 'privateRoutes', 'stableProcess'],
  confirm: ['newHashesMatch', 'uidGid997', 'capabilitiesZero', 'localHealth',
    'publicHealth', 'catalogAccess', 'sitemap', 'privateRoutes', 'stableProcess', 'timerVerified'],
  // Recheck evidence immediately before the durable terminal decision. The timer
  // MUST remain armed until that decision has been atomically persisted + fsynced.
  commit: ['savedPm2997', 'newHashesMatch', 'uidGid997', 'capabilitiesZero',
    'localHealth', 'publicHealth', 'catalogAccess', 'sitemap', 'privateRoutes',
    'stableProcess', 'timerVerified'],
  restored: ['oldHashesMatch', 'oldModulesVerified', 'uidGid997', 'capabilitiesZero',
    'localHealth', 'publicHealth', 'catalogAccess', 'sitemap', 'privateRoutes',
    'stableProcess', 'savedPm2997'],
  cleanup: ['timerStopped', 'rollbackServiceInactive']
});
function ensure(ok, code) { if (!ok) throw new Error(code); }
function exact(object, keys, code) {
  ensure(object && typeof object === 'object' && !Array.isArray(object), code);
  ensure(Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k)), code);
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function validateManifest(input) {
  exact(input, ['schemaVersion', 'releaseId', 'commit', 'kind', 'files', 'probes'], 'MANIFEST_FIELDS');
  ensure(input.schemaVersion === 1 && input.kind === 'dependencies', 'UNSUPPORTED_MANIFEST');
  ensure(typeof input.releaseId === 'string' && ID.test(input.releaseId), 'RELEASE_ID');
  ensure(typeof input.commit === 'string' && /^[a-f0-9]{40}$/.test(input.commit), 'COMMIT');
  ensure(Array.isArray(input.files) && input.files.length === 2, 'FILE_COUNT');
  for (const file of input.files) {
    exact(file, ['path', 'beforeSha256', 'afterSha256'], 'FILE_FIELDS');
    ensure(FILES.includes(file.path), 'FILE_NOT_ALLOWED');
    ensure(typeof file.beforeSha256 === 'string' && SHA.test(file.beforeSha256), 'BEFORE_HASH');
    ensure(typeof file.afterSha256 === 'string' && SHA.test(file.afterSha256), 'AFTER_HASH');
  }
  ensure(new Set(input.files.map(f => f.path)).size === 2, 'DUPLICATE_FILE');
  ensure(input.files.some(f => f.beforeSha256 !== f.afterSha256), 'NO_CHANGE');
  ensure(Array.isArray(input.probes) && input.probes.length > 0 && input.probes.length <= 100, 'PROBES');
  for (const probe of input.probes) {
    exact(probe, ['module', 'version'], 'PROBE_FIELDS');
    ensure(typeof probe.module === 'string' && MODULE.test(probe.module), 'PROBE_MODULE');
    ensure(typeof probe.version === 'string' && /^\d+\.\d+\.\d+$/.test(probe.version), 'PROBE_VERSION');
  }
  ensure(new Set(input.probes.map(p => p.module)).size === input.probes.length, 'DUPLICATE_PROBE');
  // Produce a canonical value; a caller cannot change validated data afterwards.
  return JSON.parse(JSON.stringify(input));
}
function manifestDigest(input) {
  const m = validateManifest(input);
  return sha256(JSON.stringify({ schemaVersion: m.schemaVersion, releaseId: m.releaseId,
    commit: m.commit, kind: m.kind,
    files: m.files.map(f => ({ path: f.path, beforeSha256: f.beforeSha256, afterSha256: f.afterSha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    probes: m.probes.map(p => ({ module: p.module, version: p.version }))
      .sort((a, b) => a.module.localeCompare(b.module)) }));
}
function validateCandidate(input, bytes) {
  const m = validateManifest(input);
  for (const file of m.files) {
    ensure(Buffer.isBuffer(bytes[file.path]), 'FILE_BYTES');
    ensure(sha256(bytes[file.path]) === file.afterSha256, 'CANDIDATE_HASH');
  }
  let pkg, lock;
  try {
    pkg = JSON.parse(bytes['package.json'].toString('utf8'));
    lock = JSON.parse(bytes['package-lock.json'].toString('utf8'));
  } catch { throw new Error('PACKAGE_JSON'); }
  ensure(pkg && lock && lock.packages && lock.packages[''] && lock.lockfileVersion === 3, 'LOCK_FORMAT');
  ensure(pkg.name === 'smartplate-api' && lock.name === pkg.name, 'PACKAGE_NAME');
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const actual = pkg[key] || {}, saved = lock.packages[''][key] || {};
    ensure(Object.keys(actual).length === Object.keys(saved).length &&
      Object.keys(actual).every(k => actual[k] === saved[k]), 'LOCK_ROOT_MISMATCH');
  }
  for (const probe of m.probes) {
    ensure(lock.packages['node_modules/' + probe.module]?.version === probe.version, 'PROBE_LOCK_VERSION');
  }
  return m;
}
function createState(input) {
  const m = validateManifest(input);
  return { schemaVersion: 2, releaseId: m.releaseId, manifestSha256: manifestDigest(m),
    phase: 'prepared', revision: 0, deadlineMs: null, lastNowMs: null, cleanupComplete: false };
}
function validateState(state) {
  exact(state, ['schemaVersion', 'releaseId', 'manifestSha256', 'phase', 'revision',
    'deadlineMs', 'lastNowMs', 'cleanupComplete'], 'STATE_FIELDS');
  ensure(state.schemaVersion === 2 && typeof state.releaseId === 'string' && ID.test(state.releaseId) &&
    typeof state.manifestSha256 === 'string' && SHA.test(state.manifestSha256), 'STATE_ID');
  ensure(typeof state.cleanupComplete === 'boolean' &&
    (!state.cleanupComplete || ['confirmed', 'rolled_back'].includes(state.phase)), 'STATE_CLEANUP');
  ensure(STATES.includes(state.phase) && Number.isSafeInteger(state.revision) && state.revision >= 0, 'STATE_PHASE');
  ensure(state.deadlineMs === null || (Number.isSafeInteger(state.deadlineMs) && state.deadlineMs > 0), 'STATE_DEADLINE');
  ensure(state.lastNowMs === null || (Number.isSafeInteger(state.lastNowMs) && state.lastNowMs >= 0), 'STATE_CLOCK');
  ensure(state.phase === 'prepared' ? state.deadlineMs === null && state.revision === 0 && state.lastNowMs === null
    : state.deadlineMs !== null && state.revision > 0 && state.lastNowMs !== null, 'STATE_INCONSISTENT');
}
// MUST be called inside the future OS lock, with state read there. Revision checks
// are not a substitute for flock + atomic write/fsync. This function performs no I/O.
function transition(state, event) {
  validateState(state);
  exact(event, ['action', 'expectedRevision', 'manifestSha256', 'nowMs', 'evidence'], 'EVENT_FIELDS');
  ensure(event.manifestSha256 === state.manifestSha256, 'WRONG_MANIFEST');
  ensure(event.expectedRevision === state.revision, 'STALE_REVISION');
  ensure(Number.isSafeInteger(event.nowMs) && event.nowMs >= 0 &&
    (state.lastNowMs === null || event.nowMs >= state.lastNowMs), 'CLOCK_MOVED_BACKWARDS');
  const { action, nowMs } = event;
  const routes = {
    arm: ['prepared', 'armed'], switch: ['armed', 'switching'],
    pending: ['switching', 'pending'], confirm: ['pending', 'confirming'],
    commit: ['confirming', 'confirmed'], restored: ['rolling_back', 'rolled_back']
  };
  let phase;
  const terminal = ['confirmed', 'rolled_back'].includes(state.phase);
  if (action === 'rollback') {
    exact(event.evidence, [], 'EVIDENCE_FIELDS');
    // A timer already queued before commit must not reverse a durable decision.
    // The adapter still checks cleanupComplete and arranges cleanup separately.
    if (terminal) return { ...state };
    ensure(['armed', 'switching', 'pending', 'confirming', 'rolling_back'].includes(state.phase), 'INVALID_TRANSITION');
    phase = 'rolling_back'; // Retry must keep backup and armed recovery available.
  } else {
    if (action === 'cleanup') {
      ensure(terminal, 'INVALID_TRANSITION');
      phase = state.phase;
    } else {
      ensure(Object.hasOwn(routes, action) && routes[action][0] === state.phase, 'INVALID_TRANSITION');
      phase = routes[action][1];
    }
    const checks = CHECKS[action];
    exact(event.evidence, checks, 'EVIDENCE_FIELDS');
    ensure(checks.every(k => event.evidence[k] === true), 'EVIDENCE_FAILED');
    if (['switch', 'pending', 'confirm', 'commit'].includes(action)) {
      const reserve = ['confirm', 'commit'].includes(action) ? 120000 : 0;
      ensure(nowMs < state.deadlineMs - reserve, 'DEADLINE');
    }
  }
  if (action === 'cleanup' && state.cleanupComplete) return { ...state };
  const next = { ...state, phase, revision: state.revision + 1, lastNowMs: nowMs,
    deadlineMs: action === 'arm' ? nowMs + 600000 : state.deadlineMs,
    cleanupComplete: action === 'cleanup' };
  validateState(next);
  return next;
}
function preview(input) {
  const m = validateManifest(input);
  return { helperVersion: VERSION, mode: 'plan-only', productionExecutionEnabled: false,
    releaseId: m.releaseId, manifestSha256: manifestDigest(m), files: m.files, probes: m.probes,
    steps: ['verify baseline and exclusive release lock',
      'build candidate outside live directory; test as UID/GID 997',
      'verify checkpoint and saved original modules for offline rollback',
      'arm independent timer using protected helper copy',
      'record switching before touching live files',
      'switch reviewed files; restart once; verify access and health',
      'recheck health and saved PM2; persist terminal decision under same OS lock as rollback',
      'after durable decision stop timer; outside lock wait for queued rollback to exit',
      'reacquire lock and record verified cleanup; only then report completion'] };
}
module.exports = { VERSION, FILES, CHECKS, sha256, validateManifest, validateCandidate,
  manifestDigest, createState, transition, preview };
