'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { layout } = require('../integrated-contract.cjs');
const filename = path.join(__dirname, '../boot-rehearsal.cjs');
const actualRequire = createRequire(filename), source = fs.readFileSync(filename, 'utf8');
const p = layout('run-0123456789abcdef'); p.manager = p.bootManager;

function commandError(unit, stderr, status = 1, error = null) {
  return Object.assign(new Error('COMMAND_FAILED_systemctl'), { commandFailure: {
    file: '/usr/bin/systemctl', args: ['reset-failed', unit], status, error, stderr } });
}
const collected = unit => commandError(unit,
  'Failed to reset failed state of unit ' + unit + ': Unit ' + unit + ' not loaded.\n');
function harness(f, storage = {}, fakeFs = {}) {
  const sandbox = { module: { exports: {} }, __filename: p.code + '/boot-rehearsal.cjs',
    Buffer, process: { platform: 'linux', getuid: () => 0, pid: 123 },
    require(name) {
      if (name === './integrated-rehearsal.cjs') return { fixture: f };
      if (name === './linux-storage.cjs') return storage;
      if (name === 'node:fs') return fakeFs;
      return actualRequire(name);
    }, testSetup: async () => p
  };
  vm.runInNewContext(source + '\nsetup = testSetup; module.exports.boundary = { reset, suite, healthFailureRetry };', sandbox, { filename });
  return sandbox.module.exports;
}

test('reset tolerates only the exact inactive collected-unit refusal and still resets failed preparation', () => {
  const calls = [], f = {
    property: unit => unit === p.manager ? 'inactive' : 'failed',
    command(file, args) { calls.push(Array.from(args)); if (args[1] === p.manager) throw collected(p.manager); }
  };
  harness(f).boundary.reset(p);
  assert.deepEqual(calls, [['reset-failed', p.manager], ['reset-failed', p.prepare]]);
});

test('inactive loaded units still get reset to clear start-limit counters', () => {
  const calls = [], f = { property: () => 'inactive', command: (file, args) => calls.push(Array.from(args)) };
  harness(f).boundary.reset(p);
  assert.deepEqual(calls, [['reset-failed', p.manager], ['reset-failed', p.prepare]]);
});

test('reset propagates authorization, timeout, failed-unit disappearance and unrelated failures', () => {
  for (const [state, error] of [
    ['failed', collected(p.manager)], ['inactive', commandError(p.manager, 'Access denied')],
    ['inactive', commandError(p.manager, collected(p.manager).commandFailure.stderr, null, 'ETIMEDOUT')],
    ['inactive', commandError(p.manager, 'Unit different.service not loaded.')]
  ]) {
    const f = { property: () => state, command: () => { throw error; } };
    assert.throws(() => harness(f).boundary.reset(p), e => e === error);
  }
  for (const state of ['active', 'activating', 'deactivating', 'unknown']) {
    const f = { property: () => state, command: () => assert.fail('must not reset running units') };
    assert.throws(() => harness(f).boundary.reset(p), /BOOT_REHEARSAL_RESET_RUNNING/);
  }
});

test('real first-case loop passes both pointer refusals and reaches healthy launch despite manager collection', async () => {
  const activePath = p.control + '/active.json', journalPath = p.control + '/control.json';
  const active = Buffer.from('{"status":"open"}'), journal = Buffer.from('unchanged journal');
  const files = new Map([[activePath, active], [journalPath, journal]]), refused = [], resets = [];
  const f = {
    productionSnapshot: async () => ({}), clock: () => ({ bootId: 'fixture-boot' }), installBootUnits() {},
    readBytes: file => { assert.ok(files.has(file)); return files.get(file); },
    property: (unit, key) => key === 'MainPID' ? '0' : unit === p.manager ? 'inactive' : 'failed',
    command(file, args) {
      if (args[0] === 'reset-failed') {
        resets.push(args[1]); if (args[1] === p.manager) throw collected(p.manager); return;
      }
      assert.equal(args[0], 'start');
      if (!files.has(activePath)) refused.push('missing');
      else if (files.get(activePath).toString() === '{') refused.push('corrupt');
      else throw new Error('REACHED_HEALTHY_LAUNCH');
      return { status: 1, error: null };
    }
  };
  const h = harness(f, { atomicWrite: (file, value) => files.set(file, Buffer.from(value)), atomicJson() {} },
    { unlinkSync: file => files.delete(file) });
  await assert.rejects(h.boundary.suite(p.id), /REACHED_HEALTHY_LAUNCH/);
  assert.deepEqual(refused, ['missing', 'corrupt']);
  assert.deepEqual(resets, [p.manager, p.prepare, p.manager, p.prepare]);
  assert.ok(files.get(activePath).equals(active)); assert.ok(files.get(journalPath).equals(journal));
});

test('protected suite result retains the exact fatal command details', async () => {
  const writes = [], failure = commandError(p.manager, 'Access denied');
  const f = { verifyBundle() {}, property: () => '123', productionSnapshot: async () => { throw failure; } };
  const h = harness(f, { atomicJson: (file, value) => writes.push({ file, value }) }, { realpathSync: file => file });
  await assert.rejects(h.main(['--suite', p.id]), e => e === failure);
  assert.equal(writes[0].file, p.root + '/control/result.json');
  assert.equal(writes[0].value.passed, false); assert.equal(writes[0].value.commandFailure, failure.commandFailure);
});

test('allowed cleanup cannot overwrite fatal command diagnostics; thrown error carries original stderr', () => {
  const commandFile = path.join(__dirname, '../integrated-rehearsal.cjs'), reads = createRequire(commandFile);
  const writes = new Map(), fakeResult = { status: 1, stdout: '', stderr: 'original reset error', error: null };
  const sandbox = { module: { exports: {} }, __filename: commandFile, Buffer,
    require(name) {
      if (name === 'node:child_process') return { spawnSync: () => fakeResult };
      if (name === './linux-storage.cjs') return { atomicJson: (file, value) => writes.set(file, value) };
      return reads(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(commandFile, 'utf8') +
    '\ndiagnosticsRoot = "/protected-fixture"; module.exports.boundary = command;', sandbox, { filename: commandFile });
  let failure;
  try { sandbox.module.exports.boundary('/usr/bin/systemctl', ['reset-failed', p.manager]); }
  catch (e) { failure = e; }
  assert.equal(failure.commandFailure.stderr, 'original reset error');
  fakeResult.stderr = 'cleanup unit not loaded';
  sandbox.module.exports.boundary('/usr/bin/systemctl', ['stop', p.watchdog + '.service'], { allowFailure: true });
  assert.equal(writes.get('/protected-fixture/control/last-command-error.json').stderr, 'original reset error');
  assert.equal(writes.get('/protected-fixture/control/last-allowed-command-error.json').stderr, 'cleanup unit not loaded');
});

function protectedFixture(files) {
  const storageFile = path.join(__dirname, '../linux-storage.cjs'), read = createRequire(storageFile);
  const owners = new Map([[p.runtime, 997]]), modes = new Map();
  const sandbox = { module: { exports: {} }, Buffer, require(name) {
    if (name === 'node:path') return path.posix;
    if (name === 'node:fs') return { lstatSync(file) {
      return { uid: owners.get(file) ?? 0, mode: modes.get(file) ?? (files.has(file) ? 0o644 : 0o755),
        nlink: 1, isSymbolicLink: () => false, isDirectory: () => !files.has(file), isFile: () => files.has(file) };
    } };
    return read(name);
  } };
  vm.runInNewContext(fs.readFileSync(storageFile, 'utf8'), sandbox, { filename: storageFile });
  return { protect: sandbox.module.exports.protectedPath, owners, modes };
}

test('health fault belongs to a root-owned path; UID997 runtime and writable/substituted parents stay rejected', () => {
  const oldFlag = p.runtime + '/health-unavailable', files = new Map([[p.healthFlag, 'fixture-only'], [oldFlag, 'fixture-only']]);
  const f = protectedFixture(files);
  assert.equal(f.protect(p.healthFlag), p.healthFlag);
  assert.throws(() => f.protect(oldFlag), /UNTRUSTED_PATH/);
  f.owners.set(p.dir, 997); assert.throws(() => f.protect(p.healthFlag), /UNTRUSTED_PATH/);
  f.owners.delete(p.dir); f.modes.set(p.dir, 0o777);
  assert.throws(() => f.protect(p.healthFlag), /UNTRUSTED_PATH/);
});

test('real health-failure scenario preserves closed recovery, reads protected flag and successfully retries after removal', async () => {
  const files = new Map(), trust = protectedFixture(files), checks = [];
  let active = false, starts = 0;
  const f = {
    command(file, args) {
      if (args[0] === 'reset-failed') return { status: 0 };
      assert.equal(args[0], 'start'); starts++;
      if (starts === 1) { assert.ok(files.has(p.healthFlag)); return { status: 1, error: null }; }
      assert.equal(files.has(p.healthFlag), false); active = true; return { status: 0 };
    },
    stop: unit => { if (unit === p.manager) active = false; },
    property: () => active ? 'active' : 'inactive',
    bootSlot: () => ({ status: active ? 'verified' : 'prepared', attempt: { id: 'fixture-attempt' } }),
    state: () => ({ state: { phase: 'rolling_back', cleanupComplete: false } }),
    readBytes(file) { trust.protect(file); checks.push(file); return Buffer.from(files.get(file)); },
    health: async (value, version) => { assert.equal(version, 'old'); assert.ok(active); },
    bootVerify() {}, removeBootUnits: () => checks.push('units-removed')
  };
  const h = harness(f, { atomicWrite(file, value, mode) {
    assert.equal(mode, 0o644); files.set(file, value); trust.protect(file);
  } }, { unlinkSync: file => { assert.equal(file, p.healthFlag); files.delete(file); } });
  await h.boundary.healthFailureRetry(p);
  assert.equal(starts, 2); assert.equal(active, false);
  assert.deepEqual(checks, [p.healthFlag, 'units-removed']);
});

test('actual UID997 worker health handler uses root-owned fault flag and recovers; runtime entries cannot inject it', () => {
  const workerFile = path.join(__dirname, '../integrated-worker.cjs'), read = createRequire(workerFile);
  const files = new Set(), token = 'a'.repeat(32); let handler;
  const sandbox = { __filename: p.code + '/integrated-worker.cjs', Buffer, setTimeout() {},
    process: { argv: ['node', 'worker', p.id, p.name, token, 'app', 'old'], platform: 'linux',
      getuid: () => 997, getgid: () => 997, cwd: () => p.live, pid: 123,
      env: { SP_IR_TOKEN: token, SP_IR_VERSION: 'old' }, on() {} },
    require(name) {
      if (name === 'node:fs') return { realpathSync: file => file, existsSync: file => files.has(file),
        readFileSync: () => ['CapInh', 'CapPrm', 'CapEff', 'CapAmb'].map(field => field + ':\t0000000000000000').join('\n') };
      if (name === './linux-storage.cjs') return { atomicJson() {} };
      if (name === p.live + '/node_modules/release-fixture/index.cjs') return { version: 'old' };
      if (name === 'node:http') return { createServer(callback) {
        handler = callback; return { listen(port, host, ready) { ready(); }, address: () => ({ port: 12345 }) };
      } };
      return read(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(workerFile, 'utf8'), sandbox, { filename: workerFile });
  const health = () => {
    const response = { statusCode: 200, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    handler({ url: '/health' }, response); return response;
  };
  assert.equal(health().statusCode, 200);
  files.add(p.runtime + '/health-unavailable'); assert.equal(health().statusCode, 200);
  files.add(p.healthFlag); assert.equal(health().statusCode, 503); assert.equal(health().body.unavailable, true);
  files.delete(p.healthFlag); assert.equal(health().statusCode, 200); assert.equal(health().body.uid, 997);
});
