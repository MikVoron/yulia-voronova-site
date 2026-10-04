#!/usr/bin/env node
'use strict';
// ROOT FIXTURE ONLY. Real systemd transactions; synthetic API and module trees.
const fs = require('node:fs');
const { layout, ENV, check } = require('./integrated-contract.cjs');
const { atomicJson, atomicWrite } = require('./linux-storage.cjs');
const boot = require('./boot-state.cjs');
const { fixture: f } = require('./integrated-rehearsal.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function recoveryStopped(p) { f.stop(p.rollback + '.timer'); f.stop(p.rollback + '.service'); f.stop(p.manager); }
function reset(p) {
  f.command('/usr/bin/systemctl', ['reset-failed', p.manager, p.manager.replace('-manager.service', '-prepare.service')]);
}
async function ready(p, version, previousAttempt = null) {
  for (let n = 0; n < 120; n++) {
    const gate = f.bootSlot(p);
    if (gate.status === 'verified' && gate.attempt.id !== previousAttempt && f.property(p.manager, 'ActiveState') === 'active') {
      await f.health(p, version); f.bootVerify(p, version); return gate;
    }
    await sleep(250);
  }
  throw new Error('BOOT_REHEARSAL_READY_TIMEOUT');
}
async function launch(p, version, expectFailure = false) {
  const result = f.command('/usr/bin/systemctl', ['start', p.manager], { allowFailure: expectFailure, timeout: 100000 });
  if (expectFailure) check(result.status !== 0 && !result.error, 'BOOT_REHEARSAL_EXPECTED_START_FAILURE');
  return ready(p, version);
}
async function setup(id, index, phase) {
  const p = await f.newCase(id, index);
  if (phase !== 'prepared') {
    if (phase === 'arming') check(f.call(p, 'arm', 'intent', true).status === 137, 'BOOT_REHEARSAL_EXPECTED_KILL');
    else {
      f.call(p, 'arm');
      if (!['armed'].includes(phase)) {
        if (phase === 'switching') check(f.call(p, 'apply', 'switching', true).status === 137, 'BOOT_REHEARSAL_EXPECTED_KILL');
        else {
          f.call(p, 'apply');
          if (phase === 'confirming') check(f.call(p, 'confirm', 'confirming', true).status === 137, 'BOOT_REHEARSAL_EXPECTED_KILL');
          if (phase === 'confirmed') f.call(p, 'confirm');
          if (phase === 'rolling_back') check(f.call(p, 'rollback', 'rollback-recorded', true).status === 137, 'BOOT_REHEARSAL_EXPECTED_KILL');
          if (phase === 'rolled_back') f.call(p, 'rollback');
        }
      }
    }
  }
  recoveryStopped(p); return p;
}
async function suite(id) {
  const root = layout(id).root, baseline = await f.productionSnapshot(), hostBoot = f.clock().bootId;
  const progress = [];
  const emit = text => { progress.push(text); atomicJson(root + '/control/progress.json', progress); };
  let p = await setup(id, 1, 'prepared');
  f.installBootUnits(p);
  const active = f.readBytes(p.control + '/active.json'), journal = f.readBytes(p.control + '/control.json');
  // Mandatory pointer loss/corruption cannot be mistaken for an idle installation.
  for (const missing of [true, false]) {
    if (missing) fs.unlinkSync(p.control + '/active.json'); else atomicWrite(p.control + '/active.json', '{');
    const result = f.command('/usr/bin/systemctl', ['start', p.manager], { allowFailure: true });
    check(result.status !== 0 && f.property(p.manager, 'MainPID') === '0' &&
      f.readBytes(p.control + '/control.json').equals(journal), 'BOOT_REHEARSAL_BAD_POINTER_STARTED');
    atomicWrite(p.control + '/active.json', active); reset(p);
  }
  let gate = await launch(p, 'old');
  const attempt = gate.attempt.id;
  f.command('/usr/bin/systemctl', ['restart', p.manager], { timeout: 100000 });
  gate = await ready(p, 'old', attempt);
  const automaticAttempt = gate.attempt.id;
  f.command('/usr/bin/systemctl', ['kill', '--kill-who=all', '--signal=KILL', p.manager]);
  gate = await ready(p, 'old', automaticAttempt);
  check(f.state(p).stage === 'prepared', 'BOOT_REHEARSAL_PREPARED_MUTATED');
  recoveryStopped(p); f.removeBootUnits(p);
  emit('SPLIT_START_POINTER_REFUSAL_AND_BOTH_RESTARTS_OK');

  for (const [index, phase] of [[2, 'arming'], [3, 'armed'], [4, 'switching']]) {
    p = await setup(id, index, phase); f.installBootUnits(p); await launch(p, 'old');
    check(f.bootSlot(p).status === 'verified' && (phase === 'arming' ? f.state(p).cancelCleanupComplete :
      f.state(p).state.phase === 'rolled_back' && f.state(p).state.cleanupComplete), 'BOOT_REHEARSAL_STATE');
    recoveryStopped(p); f.removeBootUnits(p); emit('SPLIT_START_PHASE_OK ' + phase);
  }

  p = await setup(id, 5, 'pending');
  for (const point of ['gate-written', 'decision-written', 'tree-ready', 'live-displaced', 'live-installed',
    'primary-written', 'fallback-written', 'receipt-written']) {
    check(f.call(p, 'boot-prepare', point, true).status === 137, 'BOOT_REHEARSAL_EXPECTED_KILL');
    const denied = f.call(p, 'arm', 'none', true);
    check(denied.status !== 0 && denied.stderr.includes('BOOT_RELEASE_BLOCKED'), 'BOOT_REHEARSAL_GATE_OPEN');
    check(f.state(p).state.phase !== 'rolled_back', 'BOOT_REHEARSAL_PREMATURE_RESTORED');
  }
  f.installBootUnits(p); atomicJson(p.control + '/boot-fault.json', { point: 'restored-written' });
  await launch(p, 'old', true);
  check(f.state(p).state.phase === 'rolled_back' && f.state(p).state.cleanupComplete, 'BOOT_REHEARSAL_RESTORED');
  recoveryStopped(p); f.removeBootUnits(p); emit('SPLIT_START_ALL_OFFLINE_CRASH_BOUNDARIES_OK');

  p = await setup(id, 6, 'confirming'); f.call(p, 'model-previous-boot'); f.installBootUnits(p);
  atomicWrite(p.runtime + '/health-unavailable', 'fixture-only', 0o644);
  const failed = f.command('/usr/bin/systemctl', ['start', p.manager], { allowFailure: true, timeout: 100000 });
  check(failed.status !== 0 && !failed.error, 'BOOT_REHEARSAL_UNHEALTHY_ACCEPTED');
  recoveryStopped(p);
  check(f.bootSlot(p).status === 'prepared' && f.state(p).state.phase === 'rolling_back' &&
    !f.state(p).state.cleanupComplete, 'BOOT_REHEARSAL_UNHEALTHY_FINALIZED');
  check(f.readBytes(p.runtime + '/health-unavailable').toString() === 'fixture-only', 'BOOT_REHEARSAL_FLAG');
  fs.unlinkSync(p.runtime + '/health-unavailable'); reset(p); await launch(p, 'old');
  recoveryStopped(p); f.removeBootUnits(p); emit('SPLIT_START_HEALTH_FAILURE_AND_RETRY_OK');

  p = await setup(id, 7, 'confirmed'); f.installBootUnits(p);
  const dump = f.readBytes(p.pm2 + '/dump.pm2'), confirmed = f.readBytes(p.control + '/control.json');
  atomicWrite(p.pm2 + '/dump.pm2', '{}');
  const refused = f.command('/usr/bin/systemctl', ['start', p.manager], { allowFailure: true });
  check(refused.status !== 0 && f.property(p.manager, 'MainPID') === '0' &&
    f.readBytes(p.control + '/control.json').equals(confirmed), 'BOOT_REHEARSAL_CONFIRMED_SUBSTITUTED');
  atomicWrite(p.pm2 + '/dump.pm2', dump); reset(p); await launch(p, 'new');
  check(f.state(p).state.phase === 'confirmed' && f.state(p).state.cleanupComplete, 'BOOT_REHEARSAL_CONFIRMED');
  recoveryStopped(p); f.removeBootUnits(p); emit('SPLIT_START_CONFIRMED_REFUSAL_AND_NEW_OK');

  for (const [index, phase, point] of [[8, 'rolling_back', 'verification-written'],
    [9, 'rolled_back', 'cleanup-written'], [10, 'pending', 'verified-written']]) {
    p = await setup(id, index, phase); f.installBootUnits(p);
    atomicJson(p.control + '/boot-fault.json', { point }); await launch(p, 'old', true);
    check(f.state(p).state.phase === 'rolled_back' && f.state(p).state.cleanupComplete &&
      f.json(p.control + '/boot-fault.json').point === null, 'BOOT_REHEARSAL_POST_CRASH');
    recoveryStopped(p); f.removeBootUnits(p); emit('SPLIT_START_POST_CRASH_RESUMED ' + point);
  }
  check(f.clock().bootId === hostBoot && boot.equal(await f.productionSnapshot(), baseline), 'BOOT_REHEARSAL_PRODUCTION_CHANGED');
  emit('PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED');
  atomicJson(root + '/control/result.json', { passed: true, cases: 10, splitStartupTested: true,
    unitOrderingTested: true, manualRestartTested: true, automaticRestartTested: true,
    offlineCrashBoundaries: 8, postStartCrashBoundaries: 4, fixtureUid997Tested: true,
    modeledEvidence: ['publicHealth', 'bootIdChange'], productionExecutionEnabled: false,
    productionUnchanged: true, osBootTested: false, cleanupComplete: true });
  emit('SPLIT_START_REHEARSAL_OK cases=10');
}
async function main(args) {
  check(process.platform === 'linux' && process.getuid() === 0, 'BOOT_REHEARSAL_ROOT_REQUIRED');
  check(args.length === 2 && args[0] === '--suite', 'BOOT_REHEARSAL_USAGE');
  const p = layout(args[1]); f.verifyBundle(p);
  check(fs.realpathSync(__filename) === p.code + '/boot-rehearsal.cjs' &&
    f.property(p.suite, 'MainPID') === String(process.pid), 'BOOT_REHEARSAL_PROTECTED_SUITE');
  try { await suite(p.id); }
  catch (e) { atomicJson(p.root + '/control/result.json', { passed: false, error: e.code || e.message }); throw e; }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => {
  process.stderr.write('SPLIT_START_REHEARSAL_FAILED ' + (e.code || e.message) + '\n'); process.exitCode = 1;
});
module.exports = { main };
