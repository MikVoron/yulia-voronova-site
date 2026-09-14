'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const control = require('../control-envelope.cjs');
const startup = require('../startup-recovery.cjs');
const { layout } = require('../integrated-contract.cjs');
const { manifest, clock, request } = require('./fixtures/control-values.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
function step(entry, action) { return control.update(entry, request(entry, action)); }
function setup(name) {
  let entry = control.create(manifest());
  if (name === 'prepared') return entry;
  entry = step(entry, 'intend-arm');
  if (name === 'arming') return entry;
  if (name === 'cancelled') return step(entry, 'cancel-arm');
  for (const action of ['arm', 'switch', 'pending', 'confirm', 'commit']) {
    entry = step(entry, action);
    if (entry.state.phase === name) return entry;
    if (entry.state.phase === 'pending' && ['rolling_back', 'rolled_back'].includes(name)) {
      entry = step(entry, 'rollback');
      return name === 'rolled_back' ? step(entry, 'restored') : entry;
    }
  }
  throw new Error('invalid test phase');
}
const reset = { bootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', realtimeMs: 10, monotonicMs: 1 };

test('cold start never selects unconfirmed new code, even with healthy clocks and time remaining', () => {
  for (const phase of ['armed', 'switching', 'pending', 'confirming', 'rolling_back']) {
    for (const observed of [clock(1000), reset]) {
      const entry = setup(phase), original = clone(entry), result = startup.plan(entry, observed);
      assert.equal(result.action, 'rollback', phase); assert.equal(result.version, 'old');
      assert.deepEqual(entry, original);
    }
  }
});
test('durable confirmed choice survives changed boot and cleanup state', () => {
  for (const phase of ['confirmed', 'rolled_back']) {
    for (let entry of [setup(phase), step(setup(phase), 'cleanup')]) {
      const result = startup.plan(entry, reset);
      assert.equal(result.version, phase === 'confirmed' ? 'new' : 'old');
      assert.equal(result.action, phase === 'confirmed' ? 'start-confirmed' : 'start-old');
    }
  }
});
test('prepared and interrupted arming recover old, without completing arming', () => {
  for (const phase of ['prepared', 'arming', 'cancelled']) {
    const result = startup.plan(setup(phase), reset);
    assert.equal(result.version, 'old');
    assert.equal(result.action, phase === 'arming' ? 'cancel-start-old' : 'start-old');
  }
});
test('corrupt journal blocks even a claimed confirmed release', () => {
  for (const edit of [x => { x.state = null; }, x => { x.recovery.releaseId = 'other'; },
    x => { x.generation++; }, x => { x.recovery.deadlineMonotonicMs++; }]) {
    const entry = setup('confirmed'); edit(entry);
    assert.throws(() => startup.plan(entry, reset));
  }
});
test('boot emulation changes only the two boot IDs and preserves all deadlines and generations', () => {
  for (const phase of ['prepared', 'arming', 'armed', 'switching', 'pending', 'confirming', 'confirmed']) {
    const original = setup(phase), modeled = startup.modelPreviousBoot(original, clock().bootId);
    control.validate(modeled);
    if (phase !== 'prepared') {
      assert.notEqual(modeled.recovery.bootId, clock().bootId);
      assert.equal(modeled.lastSample.bootId, modeled.recovery.bootId);
      modeled.recovery.bootId = clock().bootId; modeled.lastSample.bootId = clock().bootId;
      assert.throws(() => startup.modelPreviousBoot(original, reset.bootId), /BOOT_BINDING/);
    }
    assert.deepEqual(modeled, original);
  }
});

// Execute the actual fixture startup adapter with only OS/storage boundaries
// replaced. Test ordering and refusal before PM2, not a copy of its decisions.
function adapter(phase, failAt) {
  const filename = path.join(__dirname, '../integrated-rehearsal.cjs');
  const calls = [], p = layout('run-0123456789abcdef');
  let entry = setup(phase);
  function boundary(name) {
    calls.push(name); if (failAt === name) throw new Error('TEST_' + name);
  }
  const actualRequire = createRequire(filename);
  const sandbox = { module: { exports: {} }, __filename: filename,
    __dirname: path.dirname(filename), Buffer, setTimeout, Date: { now: () => clock().realtimeMs },
    process: { hrtime: { bigint: () => BigInt(clock().monotonicMs) * 1000000n } },
    hooks: {
      state() { boundary('read'); return entry; }, clock,
      stopped(unit) { boundary('stopped'); return failAt !== 'active'; },
      json() { boundary('record'); }, tree: (p, version) => version,
      verifyTree() { boundary('tree'); }, saved() { boundary('saved'); return Buffer.from('dump'); },
      backup() { boundary('backup'); return Buffer.from('dump'); },
      write() { boundary('write'); }, start() { boundary('start'); }, health() { boundary('health'); },
      transition(p, action) { boundary(action); entry = step(entry, action); },
      action(p, action) { boundary(action); entry = step(step(entry, 'rollback'), 'restored'); }
    }
  };
  sandbox.require = name => {
    if (name === 'node:fs') return { ...fs, readFileSync: file => {
      assert.equal(file, '/proc/sys/kernel/random/boot_id'); return clock().bootId;
    } };
    if (name === './linux-storage.cjs') return { ...actualRequire(name),
      atomicJson: sandbox.hooks.json, atomicWrite: sandbox.hooks.write, verifyTree: sandbox.hooks.verifyTree };
    return actualRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + `
    state = hooks.state; stopped = hooks.stopped; tree = hooks.tree;
    saved = hooks.saved; backup = hooks.backup; startManager = hooks.start;
    waitHealth = hooks.health; transition = hooks.transition; action = hooks.action;
    module.exports.recover = startupRecovery;
  `, sandbox, { filename });
  return { run: () => sandbox.module.exports.recover(p, 'none'), calls };
}

test('confirmed adapter validates live tree and dump before writes/start, then checks health', async () => {
  const f = adapter('confirmed'); await f.run();
  assert.deepEqual(f.calls, ['stopped', 'stopped', 'stopped', 'read', 'record', 'tree', 'saved',
    'write', 'write', 'start', 'health', 'saved']);
});
test('bad confirmed tree or dump cannot start PM2 or silently roll back', async () => {
  for (const failure of ['tree', 'saved']) {
    const f = adapter('confirmed', failure); await assert.rejects(f.run());
    assert.ok(!f.calls.includes('start')); assert.ok(!f.calls.includes('write'));
    assert.ok(!f.calls.includes('rollback'));
  }
});
test('active resources and unreadable journal block PM2 startup', async () => {
  for (const failure of ['active', 'read']) {
    const f = adapter('pending', failure); await assert.rejects(f.run());
    assert.ok(!f.calls.includes('start')); assert.ok(!f.calls.includes('rollback'));
  }
});
test('interrupted arming is cancelled durably before verified old dump is started', async () => {
  const f = adapter('arming'); await f.run();
  assert.ok(f.calls.indexOf('cancel-arm') < f.calls.indexOf('backup'));
  assert.ok(f.calls.indexOf('backup') < f.calls.indexOf('start'));
  assert.ok(!f.calls.includes('rollback'));
});
test('pending adapter delegates to existing durable rollback and requires rolled_back', async () => {
  const f = adapter('pending'); await f.run();
  assert.deepEqual(f.calls, ['stopped', 'stopped', 'stopped', 'read', 'record', 'rollback', 'read']);
});
