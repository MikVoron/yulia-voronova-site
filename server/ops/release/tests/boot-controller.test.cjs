'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../boot-controller.cjs');
const gate = require('../boot-state.cjs');
const control = require('../control-envelope.cjs');
const { manifest, clock, request } = require('./fixtures/control-values.cjs');
const { units } = require('../boot-fixture-units.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function journal(phase) {
  let value = control.create(manifest());
  if (phase === 'prepared') return value;
  value = control.update(value, request(value, 'intend-arm'));
  if (phase === 'arming') return value;
  if (phase === 'cancelled') return control.update(value, request(value, 'cancel-arm'));
  for (const action of ['arm', 'switch', 'pending', 'confirm', 'commit']) {
    value = control.update(value, request(value, action));
    if (value.state.phase === phase) return value;
    if (value.state.phase === 'pending' && ['rolling_back', 'rolled_back'].includes(phase)) {
      value = control.update(value, request(value, 'rollback'));
      return phase === 'rolled_back' ? control.update(value, request(value, 'restored')) : value;
    }
  }
  throw new Error('TEST_PHASE');
}
const proofs = {
  old: { treeSha256: '1'.repeat(64), dumpSha256: '2'.repeat(64) },
  new: { treeSha256: '3'.repeat(64), dumpSha256: '4'.repeat(64) },
  baseline: { treeSha256: '5'.repeat(64), dumpSha256: '6'.repeat(64) }
};
function fixture(phase = 'pending', idle = false) {
  const data = { control: idle ? null : journal(phase), slot: null, manager: false,
    observed: { bootId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', realtimeMs: 10, monotonicMs: 1 },
    fail: null, drift: false, processSha256: '7'.repeat(64), calls: [], artifactVersion: null, writes: 0 };
  data.slot = idle ? gate.createIdle(proofs.baseline) : gate.createActive(manifest(), data.control);
  const mark = name => { data.calls.push(name); if (data.fail === name) throw new Error('KILL_' + name); };
  const io = {
    assertLocked: () => mark('lock'), nonce: () => 'a'.repeat(32), clock: () => clone(data.observed),
    readSlot: () => { mark('read-slot'); return clone(data.slot); },
    writeSlot: value => { data.slot = clone(value); data.writes++; mark('write-' + value.status); },
    readControl: () => clone(data.control), readManifest: manifest,
    writeControl: value => { data.control = clone(value); data.writes++; mark('write-control'); },
    assertNoActiveRelease: () => { assert.equal(data.control, null); mark('idle'); },
    assertQuiescent: () => { mark('quiescent'); if (data.manager) throw new Error('MANAGER_ALIVE'); },
    checkpoint: mark,
    prepareArtifacts(version, restore) {
      mark('artifacts-' + version); data.artifactVersion = version; data.restore = restore; return clone(proofs[version]);
    },
    verifyArtifacts(version) { mark('verify-artifacts'); return clone(proofs[data.drift ? 'new' : version]); },
    async observe(version) {
      mark('observe'); if (!data.manager) throw new Error('NO_MANAGER');
      return { evidence: Object.fromEntries(controller.checks(version).map(key => [key, true])),
        processSha256: data.processSha256 };
    },
    assertProcessIdentity: sha => { mark('identity'); assert.equal(sha, data.processSha256); }
  };
  return { data, io, prepare: () => controller.prepare(io), post: () => controller.postStart(io) };
}

test('all durable phases select the safe version offline, and finalize only after live evidence', async () => {
  for (const phase of ['prepared', 'arming', 'cancelled', 'armed', 'switching', 'pending', 'confirming', 'rolling_back', 'rolled_back', 'confirmed']) {
    const f = fixture(phase), before = clone(f.data.control), receipt = f.prepare();
    assert.equal(receipt.receipt.version, phase === 'confirmed' ? 'new' : 'old', phase);
    assert.ok(!f.data.calls.includes('observe')); assert.equal(f.data.manager, false);
    if (['armed', 'switching', 'pending', 'confirming', 'rolling_back'].includes(phase)) {
      assert.equal(f.data.control.state.phase, 'rolling_back'); assert.equal(f.data.restore, true);
      assert.equal(f.data.control.state.lastNowMs, before.state.lastNowMs); // RTC moved backwards
      assert.equal(f.data.control.lastSample.realtimeMs, 10);
    }
    assert.throws(() => gate.assertOpen(f.data.slot, f.data.control), /BOOT_RELEASE_BLOCKED/);
    f.data.manager = true; const result = await f.post();
    assert.equal(result.status, 'verified'); gate.assertOpen(result, f.data.control);
    if (phase === 'prepared') assert.deepEqual(f.data.control, before);
    else if (['arming', 'cancelled'].includes(phase)) assert.equal(f.data.control.cancelCleanupComplete, true);
    else {
      assert.equal(f.data.control.state.phase, phase === 'confirmed' ? 'confirmed' : 'rolled_back');
      assert.equal(f.data.control.state.cleanupComplete, true);
    }
    const writes = f.data.writes; await f.post(); assert.equal(f.data.writes, writes);
  }
});

test('durable gate precedes journal decisions and every artifact mutation', () => {
  const f = fixture(); f.prepare();
  assert.ok(f.data.calls.indexOf('write-preparing') < f.data.calls.indexOf('write-control'));
  assert.ok(f.data.calls.indexOf('write-control') < f.data.calls.indexOf('artifacts-old'));
  assert.ok(f.data.calls.indexOf('artifacts-old') < f.data.calls.indexOf('write-prepared'));
  for (const point of ['gate-written', 'decision-written', 'receipt-written']) {
    const killed = fixture(); killed.data.fail = point; assert.throws(killed.prepare, /KILL_/);
    assert.throws(() => gate.assertOpen(killed.data.slot, killed.data.control), /BOOT_RELEASE_BLOCKED/);
    assert.notEqual(killed.data.control.state.phase, 'rolled_back');
    killed.data.fail = null; killed.prepare(); killed.data.manager = true;
    assert.equal(killed.data.slot.status, 'prepared');
  }
});

test('SIGKILL after each post-start durable boundary is replayable with fresh checks and the same process', async () => {
  for (const point of ['verification-written', 'restored-written', 'cleanup-written', 'verified-written']) {
    const f = fixture(); f.prepare(); f.data.manager = true; f.data.fail = point;
    await assert.rejects(f.post(), /KILL_/);
    if (point !== 'verified-written') assert.throws(() => gate.assertOpen(f.data.slot, f.data.control), /BLOCKED/);
    f.data.fail = null; f.data.observed.monotonicMs++; f.data.observed.realtimeMs--;
    await f.post(); assert.equal(f.data.slot.status, 'verified');
    assert.equal(f.data.control.state.phase, 'rolled_back'); assert.equal(f.data.control.state.cleanupComplete, true);
    assert.equal(f.data.calls.filter(x => x === 'observe').length, 2);
  }
});

test('missing or corrupt active pointer is never automatically created as idle', () => {
  for (const value of [null, {}, { schemaVersion: 1 }, { ...fixture().data.slot, unknown: true }]) {
    const f = fixture(); f.data.slot = value; const before = clone(f.data.control);
    assert.throws(f.prepare); assert.equal(f.data.writes, 0); assert.deepEqual(f.data.control, before);
  }
});

test('active manager and lock failures refuse preparation before any durable write', () => {
  for (const reason of ['lock', 'manager']) {
    const f = fixture(); if (reason === 'lock') f.data.fail = 'lock'; else f.data.manager = true;
    assert.throws(f.prepare); assert.equal(f.data.writes, 0);
  }
});

test('explicit idle baseline is bound to verified artifacts; absent active journal is not assumed', async () => {
  const f = fixture('prepared', true); f.prepare(); f.data.manager = true; await f.post();
  assert.equal(f.data.slot.receipt.version, 'baseline'); assert.equal(f.data.control, null);
  const broken = fixture('prepared', true); broken.io.prepareArtifacts = () => proofs.old;
  assert.throws(broken.prepare, /BOOT_IDLE_BASELINE/); assert.equal(broken.data.slot.status, 'preparing');
  const hidden = fixture('prepared', true); hidden.data.control = journal('pending'); assert.throws(hidden.prepare);
});

test('healthy HTTP cannot override an incomplete old-module, dump or stopped-resource check', async () => {
  for (const failed of controller.checks('old')) {
    const f = fixture(); f.prepare(); f.data.manager = true;
    const original = f.io.observe; f.io.observe = async version => {
      const result = await original(version); result.evidence[failed] = false; return result;
    };
    await assert.rejects(f.post(), /BOOT_EVIDENCE_FAILED/);
    assert.equal(f.data.control.state.phase, 'rolling_back'); assert.equal(f.data.slot.status, 'prepared');
  }
});

test('post-start timeout keeps receipt and recovery open; a later successful check can finish', async () => {
  const f = fixture(); f.prepare(); f.data.manager = true; f.data.fail = 'observe';
  const receipt = clone(f.data.slot); await assert.rejects(f.post());
  assert.deepEqual(f.data.slot, receipt); assert.equal(f.data.control.state.phase, 'rolling_back');
  f.data.fail = null; await f.post(); assert.equal(f.data.slot.status, 'verified');
});

test('changed boot, monotonic regression, foreign release and journal revision reject stale receipt', async () => {
  for (const edit of [f => { f.data.observed.bootId = clock().bootId; },
    f => { f.data.observed.monotonicMs = 0; }, f => { f.data.control.generation++; },
    f => { f.data.slot.identity.releaseId = 'another-release'; },
    f => { f.data.control = control.update(f.data.control, request(f.data.control, 'rollback', f.data.observed)); }]) {
    const f = fixture(); f.prepare(); f.data.manager = true; edit(f);
    const writes = f.data.writes; await assert.rejects(f.post()); assert.equal(f.data.writes, writes);
  }
});

test('dump/tree drift before or during probes and a process change cannot record restored', async () => {
  for (const failure of ['before', 'during', 'process']) {
    const f = fixture(); f.prepare(); f.data.manager = true;
    if (failure === 'before') f.data.drift = true;
    if (failure === 'during') {
      const original = f.io.observe; f.io.observe = async version => { const result = await original(version); f.data.drift = true; return result; };
    }
    if (failure === 'process') f.io.assertProcessIdentity = () => { throw new Error('PROCESS_CHANGED'); };
    await assert.rejects(f.post()); assert.equal(f.data.control.state.phase, 'rolling_back');
    assert.equal(f.data.slot.status, 'prepared');
  }
});

test('a different process cannot finish a previous finalization; stopped-manager prepare can retry', async () => {
  const f = fixture(); f.prepare(); f.data.manager = true; f.data.fail = 'verification-written';
  await assert.rejects(f.post()); f.data.fail = null; f.data.processSha256 = '8'.repeat(64);
  await assert.rejects(f.post(), /BOOT_PROCESS_CHANGED/); assert.equal(f.data.control.state.phase, 'rolling_back');
  f.data.manager = false; f.io.nonce = () => 'b'.repeat(32); f.prepare(); f.data.manager = true;
  await f.post(); assert.equal(f.data.slot.attempt.id, 'b'.repeat(32));
});

test('bad confirmed artifacts never substitute old code or rewrite the terminal journal', () => {
  const f = fixture('confirmed'), original = clone(f.data.control);
  f.io.prepareArtifacts = version => { assert.equal(version, 'new'); throw new Error('BAD_DUMP'); };
  assert.throws(f.prepare, /BAD_DUMP/); assert.deepEqual(f.data.control, original);
  assert.equal(f.data.slot.status, 'preparing');
});

test('unprepared post-start, contradictory version and incomplete receipt fields fail closed', async () => {
  const f = fixture(); await assert.rejects(f.post(), /BOOT_POST_WITHOUT_PREPARE/);
  f.prepare();
  for (const edit of [x => { x.receipt.version = 'new'; }, x => { delete x.receipt.artifacts; },
    x => { x.receipt.control.state.manifestSha256 = 'f'.repeat(64); }, x => { x.attempt.id = '../x'; }]) {
    const value = clone(f.data.slot); edit(value); assert.throws(() => gate.validate(value));
  }
});

test('fixture unit templates cover dependency failure, every restart and bounded post-start checks', () => {
  const generated = units('run-0123456789abcdef', 'case-01');
  const prepare = generated['sp-ir-0123456789abcdef-case-01-prepare.service'];
  const manager = generated['sp-ir-0123456789abcdef-case-01-manager.service'];
  assert.match(prepare, /Type=oneshot\nRemainAfterExit=no/);
  assert.match(manager, /Requires=sp-ir-0123456789abcdef-case-01-prepare.service\nAfter=/);
  assert.match(manager, /ExecStartPre=.*boot-prepare none/);
  assert.match(manager, /ExecStartPost=.*boot-post none/);
  assert.match(manager, /Restart=on-failure/); assert.match(manager, /KillMode=control-group/);
  assert.doesNotMatch(manager + prepare, /ConditionPathExists|pm2-root|\/root\/\.pm2|\/var\/www/);
  assert.throws(() => units('run-0123456789abcdef', 'case-11'));
  assert.throws(() => units('run-0123456789abcdef;bad', 'case-01'));
});
