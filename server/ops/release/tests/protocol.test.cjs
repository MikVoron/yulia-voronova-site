'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CHECKS, sha256, validateManifest, validateCandidate, manifestDigest,
  createState, transition } = require('../protocol.cjs');
const { main } = require('../plan.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
function fixture() {
  const pkg = { name: 'smartplate-api', dependencies: { fastify: '^5.12.3' } };
  const lock = { name: pkg.name, lockfileVersion: 3, packages: {
    '': { dependencies: pkg.dependencies }, 'node_modules/fastify': { version: '5.12.3' } } };
  const bytes = { 'package.json': Buffer.from(JSON.stringify(pkg)),
    'package-lock.json': Buffer.from(JSON.stringify(lock)) };
  const manifest = { schemaVersion: 1, releaseId: 'test-release', commit: 'a'.repeat(40), kind: 'dependencies',
    files: Object.entries(bytes).map(([p, b]) => ({ path: p, beforeSha256: sha256('previous:' + p), afterSha256: sha256(b) })),
    probes: [{ module: 'fastify', version: '5.12.3' }] };
  return { manifest, bytes };
}
const evidence = action => Object.fromEntries((CHECKS[action] || []).map(k => [k, true]));
function command(state, action, nowMs = 1000) {
  return { action, expectedRevision: state.revision, manifestSha256: state.manifestSha256,
    nowMs, evidence: evidence(action) };
}
function toPhase(phase) {
  let s = createState(fixture().manifest);
  for (const action of ['arm', 'switch', 'pending', 'confirm', 'commit']) {
    if (s.phase === phase) break;
    s = transition(s, command(s, action));
  }
  return s;
}
test('candidate bytes and root dependencies must match reviewed manifest and lock', () => {
  const { manifest, bytes } = fixture();
  assert.deepEqual(validateCandidate(manifest, bytes), manifest);
  assert.throws(() => validateCandidate(manifest, { ...bytes, 'package.json': Buffer.from('{}') }), /CANDIDATE_HASH/);
  const changed = clone(manifest);
  const lock = JSON.parse(bytes['package-lock.json']);
  lock.packages[''].dependencies.fastify = '^4.0.0';
  bytes['package-lock.json'] = Buffer.from(JSON.stringify(lock));
  changed.files[1].afterSha256 = sha256(bytes['package-lock.json']);
  assert.throws(() => validateCandidate(changed, bytes), /LOCK_ROOT_MISMATCH/);
});
test('only two allowed package files, never secrets, shell commands or configurable targets', () => {
  for (const p of ['../package.json', '/etc/shadow', '.env', 'src/index.js', 'package.json:stream', 'PACKAGE.JSON', 'a\\..\\package.json']) {
    const { manifest } = fixture(); manifest.files[0].path = p;
    assert.throws(() => validateManifest(manifest), /FILE_NOT_ALLOWED/);
  }
  for (const key of ['command', 'target', 'pm2Home', '__proto__']) {
    const manifest = JSON.parse(JSON.stringify(fixture().manifest).replace(/}$/, ',"' + key + '":"id"}'));
    assert.throws(() => validateManifest(manifest), /MANIFEST_FIELDS/);
  }
  const { manifest } = fixture(); manifest.files[1] = manifest.files[0];
  assert.throws(() => validateManifest(manifest), /DUPLICATE_FILE/);
});
test('release identity, probes and hashes reject malformed inputs', () => {
  for (const value of ['../release', 'release;id', 'release\n', 'A', '', 'a'.repeat(49)]) {
    const { manifest } = fixture(); manifest.releaseId = value;
    assert.throws(() => validateManifest(manifest), /RELEASE_ID/);
  }
  const { manifest } = fixture();
  manifest.probes[0].module = './index.js';
  assert.throws(() => validateManifest(manifest), /PROBE_MODULE/);
  manifest.probes[0].module = 'fastify'; manifest.probes[0].version = '^5.12.3';
  assert.throws(() => validateManifest(manifest), /PROBE_VERSION/);
  manifest.probes[0].version = '5.12.3'; manifest.files[0].afterSha256 = '0';
  assert.throws(() => validateManifest(manifest), /AFTER_HASH/);
});
test('manifest digest ignores list ordering and changes on changed content', () => {
  const { manifest } = fixture(), reordered = clone(manifest);
  reordered.files.reverse();
  assert.equal(manifestDigest(manifest), manifestDigest(reordered));
  const keyOrder = Object.fromEntries(Object.entries(manifest).reverse());
  keyOrder.files = manifest.files.map(f => Object.fromEntries(Object.entries(f).reverse()));
  assert.equal(manifestDigest(manifest), manifestDigest(keyOrder));
  reordered.commit = 'b'.repeat(40);
  assert.notEqual(manifestDigest(manifest), manifestDigest(reordered));
});
test('incomplete checkpoints, failed UID probe, absent timer or failed tests prohibit arming', () => {
  const s = createState(fixture().manifest);
  for (const key of CHECKS.arm) {
    for (const value of [false, 'true', null]) {
      const event = command(s, 'arm'); event.evidence[key] = value;
      assert.throws(() => transition(s, event), /EVIDENCE_FAILED/);
      assert.equal(s.phase, 'prepared');
    }
  }
});
test('ordinary successful lifecycle includes all health gates and persists terminal state', () => {
  let state = createState(fixture().manifest);
  for (const action of ['arm', 'switch', 'pending', 'confirm', 'commit']) {
    for (const key of CHECKS[action]) {
      const bad = command(state, action); bad.evidence[key] = false;
      assert.throws(() => transition(state, bad), /EVIDENCE_FAILED/);
    }
    state = transition(state, command(state, action));
  }
  assert.equal(state.phase, 'confirmed'); assert.equal(state.revision, 5);
  for (const action of ['arm', 'switch', 'confirm', 'rollback', 'commit']) {
    assert.throws(() => transition(state, command(state, action)), /INVALID_TRANSITION/);
  }
});
test('stale commands after another serialized actor are rejected in either race order', () => {
  const s = toPhase('pending');
  const confirm = command(s, 'confirm'), rollback = command(s, 'rollback');
  const rolling = transition(s, rollback);
  assert.throws(() => transition(rolling, confirm), /STALE_REVISION/);
  const confirming = transition(s, confirm);
  assert.throws(() => transition(confirming, rollback), /STALE_REVISION/);
  // A fresh rollback may still recover a crash DURING confirmation.
  assert.equal(transition(confirming, command(confirming, 'rollback')).phase, 'rolling_back');
});
test('confirmation requires two minutes of margin and rejects expired or backwards time', () => {
  const pending = toPhase('pending');
  assert.throws(() => transition(pending, command(pending, 'confirm', pending.deadlineMs - 120000)), /DEADLINE/);
  assert.throws(() => transition(pending, command(pending, 'confirm', pending.deadlineMs)), /DEADLINE/);
  assert.throws(() => transition(pending, command(pending, 'confirm', 999)), /CLOCK_MOVED_BACKWARDS/);
  assert.equal(transition(pending, command(pending, 'rollback', pending.deadlineMs)).phase, 'rolling_back');
});
test('failure or interruption after arming remains recoverable without new installation', () => {
  for (const phase of ['armed', 'switching', 'pending', 'confirming']) {
    let state = transition(toPhase(phase), command(toPhase(phase), 'rollback'));
    const restored = command(state, 'restored'); restored.evidence.oldModulesVerified = false;
    assert.throws(() => transition(state, restored), /EVIDENCE_FAILED/);
    assert.equal(state.phase, 'rolling_back');
    state = transition(state, command(state, 'rollback')); // retry after interrupted restore
    state = transition(state, command(state, 'restored'));
    assert.equal(state.phase, 'rolled_back');
    assert.throws(() => transition(state, command(state, 'confirm')), /INVALID_TRANSITION/);
  }
});
test('corrupt persisted state and wrong release evidence are rejected', () => {
  const s = toPhase('pending');
  assert.throws(() => transition({ ...s, deadlineMs: null }, command(s, 'confirm')), /STATE_INCONSISTENT/);
  assert.throws(() => transition(s, { ...command(s, 'confirm'), manifestSha256: 'e'.repeat(64) }), /WRONG_MANIFEST/);
  assert.throws(() => transition({ ...s, revision: -1 }, command(s, 'confirm')), /STATE_PHASE/);
});
test('read-only CLI verifies an actual bundle and refuses every execution command', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartplate-release-plan-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const { manifest, bytes } = fixture();
  for (const [name, content] of Object.entries(bytes)) fs.writeFileSync(path.join(dir, name), content);
  const manifestPath = path.join(dir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const before = fs.readdirSync(dir);
  const plan = main(['--plan', manifestPath, dir]);
  assert.equal(plan.productionExecutionEnabled, false);
  assert.equal(plan.releaseId, manifest.releaseId);
  assert.deepEqual(fs.readdirSync(dir), before);
  for (const [name, content] of Object.entries(bytes)) assert.deepEqual(fs.readFileSync(path.join(dir, name)), content);
  for (const action of ['--apply', '--confirm', '--rollback', '--recover-current', '--rollback-locked']) {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../plan.cjs'), action], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.match(result.stderr, /production execution unavailable/);
  }
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  assert.throws(() => main(['--plan', manifestPath, dir]), /CANDIDATE_HASH/);
});
test('planner rejects linked bundle directories before reading candidate bytes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartplate-release-link-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const { manifest, bytes } = fixture();
  const bundle = path.join(dir, 'bundle'); fs.mkdirSync(bundle);
  for (const [name, content] of Object.entries(bytes)) fs.writeFileSync(path.join(bundle, name), content);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.symlinkSync(bundle, path.join(dir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => main(['--plan', path.join(dir, 'manifest.json'), path.join(dir, 'linked')]), /SYMLINK_REJECTED/);
});
