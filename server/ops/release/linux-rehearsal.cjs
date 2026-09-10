#!/usr/bin/env node
'use strict';

// FIXTURE ONLY. Never deploys SmartPlate; the only production operations are reads.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { check, beneath, protectedPath, syncDir, atomicWrite, atomicJson,
  inventory, verifyTree, copyVerified } = require('./linux-storage.cjs');
const { sha256 } = require('./protocol.cjs');
const BASE = '/var/lib/smartplate-release-rehearsals';
const HELPERS = ['linux-rehearsal.cjs', 'linux-storage.cjs', 'protocol.cjs', 'fixture-worker.cjs'];
const ENV = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C', HOME: '/root' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const boot = () => fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
const now = () => Math.floor(Number(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]) * 1000);
function command(file, args, allowFailure = false) {
  const result = cp.spawnSync(file, args, { env: ENV, encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024 });
  if (!allowFailure) check(!result.error && result.status === 0, 'COMMAND_FAILED_' + path.basename(file));
  return result;
}
function rootFor(id) {
  check(/^run-[a-f0-9]{16}$/.test(id), 'RUN_ID');
  return protectedPath(beneath(BASE, id), true);
}
function caseFor(root, name) {
  check(/^case-[0-9]{2}$/.test(name), 'CASE_ID');
  return protectedPath(beneath(root, name), true);
}
function json(file) { protectedPath(file); return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeState(dir, state, phase) {
  const next = { ...state, phase, revision: state.revision + 1 };
  atomicJson(dir + '/control/state.json', next);
  return next;
}
function fault(point, selected) { if (point === selected) process.kill(process.pid, 'SIGKILL'); }
function readState(dir) {
  const state = json(dir + '/control/state.json');
  check(state.fixture === true && ['prepared', 'armed', 'switching', 'pending', 'confirming',
    'confirmed', 'rolling_back', 'rolled_back'].includes(state.phase) &&
    Number.isSafeInteger(state.revision) && state.revision >= 0, 'CORRUPT_STATE');
  return state;
}
function verifyHelpers(root) {
  const hashes = json(root + '/control/helpers.json');
  for (const file of HELPERS) {
    protectedPath(root + '/code/' + file);
    check(sha256(fs.readFileSync(root + '/code/' + file)) === hashes[file], 'HELPER_HASH');
  }
}
function names(root, name) {
  const tag = path.basename(root).slice(4);
  return { worker: `sp-rh-${tag}-${name}-worker`, rollback: `sp-rh-${tag}-${name}-rollback` };
}
function active(unit) {
  return command('/usr/bin/systemctl', ['is-active', '--quiet', unit], true).status === 0;
}
function stop(unit) {
  command('/usr/bin/systemctl', ['stop', unit], true);
  const state = command('/usr/bin/systemctl', ['show', unit, '--property=ActiveState', '--value'], true).stdout.trim();
  check(['inactive', 'failed', ''].includes(state), 'UNIT_STILL_ACTIVE');
}
function stopTimer(root, name) { stop(names(root, name).rollback + '.timer'); }
function prepareUnit(root, name) {
  const filename = root + '/control/units.json';
  const units = json(filename);
  if (!units.includes(name)) { units.push(name); atomicJson(filename, units); }
}
async function workerHealth(root, name, expectedVersion) {
  const dir = caseFor(root, name), n = names(root, name);
  check(active(n.worker + '.service'), 'WORKER_INACTIVE');
  const pid = Number(command('/usr/bin/systemctl', ['show', n.worker + '.service', '--property=MainPID', '--value']).stdout.trim());
  check(Number.isSafeInteger(pid) && pid > 1, 'WORKER_PID');
  const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
  for (const key of ['Uid', 'Gid']) check(new RegExp('^' + key + ':\\s+997\\s+997\\s+997\\s+997$', 'm').test(status), 'WORKER_IDS');
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) check(new RegExp('^' + key + ':\\s+0+$', 'm').test(status), 'WORKER_CAPABILITIES');
  const token = json(dir + '/control/config.json').token;
  const ready = JSON.parse(fs.readFileSync(dir + '/runtime/ready.json', 'utf8'));
  check(ready.token === token && Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536, 'WORKER_READY');
  const response = await fetch('http://127.0.0.1:' + ready.port + '/health', { signal: AbortSignal.timeout(1500) });
  const health = await response.json();
  check(response.ok && health.fixture === true && health.token === token && health.version === expectedVersion &&
    health.pid === pid && health.uid === 997 && health.gid === 997, 'WORKER_HEALTH');
  return pid;
}
async function startWorker(root, name, version) {
  const dir = caseFor(root, name), n = names(root, name);
  // A previous instance may have crashed; stop only this registered fixture unit.
  stop(n.worker + '.service');
  command('/usr/bin/systemctl', ['reset-failed', n.worker + '.service'], true);
  for (let i = 0; i < 20; i++) {
    const load = command('/usr/bin/systemctl', ['show', n.worker + '.service', '--property=LoadState', '--value'], true);
    if (load.stdout.trim() === 'not-found') break;
    await sleep(100);
  }
  command('/usr/bin/systemd-run', ['--quiet', '--collect', '--unit=' + n.worker,
    '--property=Type=exec', '--property=User=smartplate-api', '--property=Group=smartplate-api',
    '--property=NoNewPrivileges=yes', '--property=CapabilityBoundingSet=', '--property=ProtectHome=yes',
    '--property=ProtectSystem=strict', '--property=ReadWritePaths=' + dir + '/runtime',
    '--property=PrivateTmp=yes', '--property=TimeoutStopSec=5s', '--property=MemoryMax=96M',
    '--property=TasksMax=24', '--property=RuntimeMaxSec=180s',
    '/usr/bin/node', root + '/code/fixture-worker.cjs', dir, json(dir + '/control/config.json').token]);
  for (let i = 0; i < 30; i++) {
    try { return await workerHealth(root, name, version); } catch { await sleep(150); }
  }
  throw new Error('WORKER_START_FAILED');
}
function registerTimer(root, name, seconds) {
  const n = names(root, name);
  command('/usr/bin/systemd-run', ['--quiet', '--unit=' + n.rollback, '--on-active=' + seconds + 's',
    '--timer-property=AccuracySec=100ms', '--property=Type=oneshot', '--property=TimeoutStartSec=45s',
    '--property=Restart=on-failure', '--property=RestartSec=3s',
    '/usr/bin/node', root + '/code/linux-rehearsal.cjs', '--action', path.basename(root), name, 'rollback']);
  check(active(n.rollback + '.timer'), 'TIMER_NOT_ACTIVE');
}
function movedir(source, destination, parent) { fs.renameSync(source, destination); syncDir(parent); }
function temporary(dir, prefix) { return path.join(dir, prefix + '-' + crypto.randomBytes(6).toString('hex')); }
async function action(root, name, operation, crash = '') {
  verifyHelpers(root);
  const dir = caseFor(root, name), stateFile = dir + '/control/state.json';
  let state = readState(dir);
  const config = json(dir + '/control/config.json');
  const n = names(root, name);
  const oldTree = json(dir + '/control/old-tree.json'), newTree = json(dir + '/control/new-tree.json');
  if (operation === 'arm') {
    check(state.phase === 'prepared', 'ALREADY_ARMED');
    verifyTree(dir + '/live', oldTree); verifyTree(dir + '/backup', oldTree); verifyTree(dir + '/candidate', newTree);
    await workerHealth(root, name, 'old');
    // Persist intent BEFORE systemd may dispatch a rollback; prepared+timer is recoverable.
    state = { ...state, boot: boot(), deadlineMs: now() + config.seconds * 1000 };
    atomicJson(stateFile, state);
    registerTimer(root, name, config.seconds);
    writeState(dir, state, 'armed');
    return;
  }
  if (operation === 'apply') {
    check(state.phase === 'armed' && state.boot === boot() && now() < state.deadlineMs, 'NOT_ARMED');
    check(active(n.rollback + '.timer'), 'TIMER_MISSING');
    verifyTree(dir + '/live', oldTree); verifyTree(dir + '/backup', oldTree); verifyTree(dir + '/candidate', newTree);
    state = writeState(dir, state, 'switching'); fault('switching', crash);
    stop(n.worker + '.service'); fault('worker-stopped', crash);
    movedir(dir + '/live', temporary(dir, 'displaced'), dir); fault('old-moved', crash);
    movedir(dir + '/candidate', dir + '/live', dir); fault('new-moved', crash);
    verifyTree(dir + '/live', newTree);
    await startWorker(root, name, 'new');
    check(now() < state.deadlineMs, 'APPLY_DEADLINE');
    writeState(dir, state, 'pending');
    return;
  }
  if (operation === 'confirm') {
    check(state.phase === 'pending' && state.boot === boot() && now() + 3000 < state.deadlineMs, 'CONFIRM_DEADLINE_OR_STATE');
    verifyTree(dir + '/live', newTree); await workerHealth(root, name, 'new');
    check(active(n.rollback + '.timer') && now() + 3000 < state.deadlineMs, 'CONFIRM_TIMER_OR_DEADLINE');
    state = writeState(dir, state, 'confirming'); fault('confirming', crash);
    // Durable terminal decision under flock. A queued timer reads confirmed and does nothing.
    writeState(dir, state, 'confirmed'); fault('confirmed', crash);
    stopTimer(root, name); return;
  }
  check(operation === 'rollback', 'ACTION');
  if (['confirmed', 'rolled_back'].includes(state.phase)) { stopTimer(root, name); return; }
  // Verify backup BEFORE stopping the healthy fixture. A failed restore remains retryable.
  verifyTree(dir + '/backup', oldTree);
  state = writeState(dir, state, 'rolling_back');
  const restore = temporary(dir, 'restore');
  copyVerified(dir + '/backup', restore, oldTree); fault('restore-prepared', crash);
  stop(n.worker + '.service');
  if (fs.existsSync(dir + '/live')) movedir(dir + '/live', temporary(dir, 'failed'), dir);
  fault('rollback-old-moved', crash);
  movedir(restore, dir + '/live', dir); fault('rollback-new-moved', crash);
  verifyTree(dir + '/live', oldTree);
  await startWorker(root, name, 'old');
  writeState(dir, state, 'rolled_back');
  stopTimer(root, name);
}
function lockedArgs(root, name, operation, crash = '') {
  return ['--exclusive', '--wait', '30', '--close', root + '/control/transition.lock', '/usr/bin/node',
    root + '/code/linux-rehearsal.cjs', '--locked', path.basename(root), name, operation, crash];
}
function callAction(root, name, operation, crash = '', allowFailure = false) {
  return command('/usr/bin/flock', lockedArgs(root, name, operation, crash), allowFailure);
}
function parallelAction(root, name, operation) {
  return new Promise(resolve => {
    const child = cp.spawn('/usr/bin/flock', lockedArgs(root, name, operation), { env: ENV, stdio: 'ignore' });
    // All descendants are also bounded by the fixture suite's systemd cgroup.
    const deadline = setTimeout(() => { child.kill('SIGTERM'); resolve(-1); }, 35000);
    child.once('error', () => { clearTimeout(deadline); resolve(-1); });
    child.once('exit', code => { clearTimeout(deadline); resolve(code); });
  });
}
function makeTree(dir, version) {
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.mkdirSync(dir + '/node_modules', { mode: 0o755 });
  fs.mkdirSync(dir + '/node_modules/release-fixture', { mode: 0o755 });
  atomicWrite(dir + '/package.json', JSON.stringify({ name: 'release-fixture', version }), 0o644);
  atomicWrite(dir + '/package-lock.json', JSON.stringify({ fixtureVersion: version }), 0o644);
  atomicWrite(dir + '/node_modules/release-fixture/index.cjs', `module.exports = {version: '${version}'};\n`, 0o644);
}
async function newCase(root, index, seconds = 90) {
  const name = 'case-' + String(index).padStart(2, '0'), dir = beneath(root, name);
  fs.mkdirSync(dir, { mode: 0o755 }); fs.mkdirSync(dir + '/control', { mode: 0o700 });
  fs.mkdirSync(dir + '/runtime', { mode: 0o700 }); fs.chownSync(dir + '/runtime', 997, 997);
  prepareUnit(root, name);
  atomicJson(dir + '/control/config.json', { fixture: true, seconds, token: crypto.randomBytes(16).toString('hex') });
  atomicJson(dir + '/control/state.json', { fixture: true, phase: 'prepared', revision: 0, boot: null, deadlineMs: null });
  makeTree(dir + '/live', 'old'); makeTree(dir + '/candidate', 'new');
  const oldTree = inventory(dir + '/live');
  copyVerified(dir + '/live', dir + '/backup', oldTree);
  atomicJson(dir + '/control/old-tree.json', oldTree);
  atomicJson(dir + '/control/new-tree.json', inventory(dir + '/candidate'));
  await startWorker(root, name, 'old');
  callAction(root, name, 'arm');
  return name;
}
async function waitTerminal(root, name, phase, seconds = 35) {
  for (let i = 0; i < seconds * 5; i++) {
    if (readState(caseFor(root, name)).phase === phase) {
      await workerHealth(root, name, phase === 'confirmed' ? 'new' : 'old'); return;
    }
    await sleep(200);
  }
  throw new Error('TERMINAL_TIMEOUT');
}
function cleanup(root) {
  verifyHelpers(root);
  for (const name of json(root + '/control/units.json')) {
    const n = names(root, name); caseFor(root, name);
    // Stop dispatch and retry before the worker; all names belong to this fixture run.
    stop(n.rollback + '.timer'); stop(n.rollback + '.service'); stop(n.worker + '.service');
  }
  atomicJson(root + '/control/cleanup.json', { complete: true });
}
async function productionSnapshot() {
  const response = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(5000) });
  const h = await response.json(); check(response.ok && h.status === 'ok' && h.db === 'ok', 'PRODUCTION_HEALTH');
  const processes = [];
  for (const pid of fs.readdirSync('/proc').filter(x => /^[0-9]+$/.test(x))) {
    try {
      const args = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0');
      if (args.includes('/var/www/smartplate-api/index.js') || args[0] === 'node /var/www/smartplate-api/index.js') {
        const st = fs.statSync('/proc/' + pid); processes.push({ pid, uid: st.uid, gid: st.gid });
      }
    } catch (e) { if (!['ENOENT', 'ESRCH', 'EACCES'].includes(e.code)) throw e; }
  }
  check(processes.length === 1 && processes[0].uid === 997 && processes[0].gid === 997, 'PRODUCTION_PROCESS');
  const hashes = {};
  for (const name of ['package.json', 'package-lock.json', 'index.js']) {
    hashes[name] = sha256(fs.readFileSync('/var/www/smartplate-api/' + name));
  }
  return { processes, hashes, pm2Pid: command('/usr/bin/systemctl', ['show', 'pm2-root', '--property=MainPID', '--value']).stdout.trim() };
}
async function suite(root) {
  const baseline = await productionSnapshot(); atomicJson(root + '/control/production-before.json', baseline);
  let index = 0;
  const progress = [];
  const report = msg => { progress.push(msg); atomicJson(root + '/control/progress.json', progress); };
  let name = await newCase(root, ++index);
  callAction(root, name, 'apply'); callAction(root, name, 'confirm');
  check(callAction(root, name, 'apply', '', true).status !== 0, 'REPEATED_APPLY_ACCEPTED');
  callAction(root, name, 'rollback'); await waitTerminal(root, name, 'confirmed');
  report('FIXTURE_CONFIRM_AND_LATE_ROLLBACK_OK');
  stop(names(root, name).worker + '.service');
  name = await newCase(root, ++index, 15);
  callAction(root, name, 'apply'); await waitTerminal(root, name, 'rolled_back');
  report('REAL_SYSTEMD_TIMER_OFFLINE_RESTORE_OK'); stop(names(root, name).worker + '.service');
  for (const point of ['switching', 'worker-stopped', 'old-moved', 'new-moved']) {
    name = await newCase(root, ++index, point === 'old-moved' ? 15 : 90);
    check(callAction(root, name, 'apply', point, true).status === 137, 'EXPECTED_SIGKILL');
    if (point !== 'old-moved') callAction(root, name, 'rollback');
    await waitTerminal(root, name, 'rolled_back');
    report('KILLED_SWITCH_RECOVERED ' + point); stop(names(root, name).worker + '.service');
  }
  for (const point of ['restore-prepared', 'rollback-old-moved', 'rollback-new-moved']) {
    name = await newCase(root, ++index); callAction(root, name, 'apply');
    check(callAction(root, name, 'rollback', point, true).status === 137, 'EXPECTED_SIGKILL');
    check(active(names(root, name).rollback + '.timer'), 'RECOVERY_TIMER_LOST');
    callAction(root, name, 'rollback'); await waitTerminal(root, name, 'rolled_back');
    report('KILLED_ROLLBACK_RETRIED ' + point); stop(names(root, name).worker + '.service');
  }
  for (const point of ['confirming', 'confirmed']) {
    name = await newCase(root, ++index); callAction(root, name, 'apply');
    check(callAction(root, name, 'confirm', point, true).status === 137, 'EXPECTED_SIGKILL');
    callAction(root, name, 'rollback');
    await waitTerminal(root, name, point === 'confirmed' ? 'confirmed' : 'rolled_back');
    report('KILLED_CONFIRM_RESOLVED ' + point); stop(names(root, name).worker + '.service');
  }
  name = await newCase(root, ++index); callAction(root, name, 'apply');
  const badFile = caseFor(root, name) + '/backup/package.json', saved = fs.readFileSync(badFile);
  atomicWrite(badFile, 'damaged fixture backup', 0o644);
  check(callAction(root, name, 'rollback', '', true).status !== 0, 'CORRUPT_BACKUP_ACCEPTED');
  check(active(names(root, name).rollback + '.timer'), 'RECOVERY_TIMER_LOST');
  await workerHealth(root, name, 'new');
  atomicWrite(badFile, saved, 0o644); callAction(root, name, 'rollback');
  await waitTerminal(root, name, 'rolled_back'); report('CORRUPT_BACKUP_REFUSED_RETRY_OK');
  stop(names(root, name).worker + '.service');
  name = await newCase(root, ++index); callAction(root, name, 'apply');
  const results = await Promise.all([parallelAction(root, name, 'confirm'), parallelAction(root, name, 'rollback')]);
  check(results.includes(0), 'RACE_NO_SUCCESS');
  const terminal = readState(caseFor(root, name)).phase;
  check(['confirmed', 'rolled_back'].includes(terminal), 'RACE_NOT_TERMINAL');
  await waitTerminal(root, name, terminal); report('REAL_FLOCK_CONFIRM_ROLLBACK_RACE_OK');
  cleanup(root);
  const after = await productionSnapshot();
  check(JSON.stringify(after) === JSON.stringify(baseline), 'PRODUCTION_BASELINE_CHANGED');
  atomicJson(root + '/control/result.json', { passed: true, cases: index, productionUnchanged: true, at: new Date().toISOString() });
  report('PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED'); report('LINUX_RELEASE_REHEARSAL_OK cases=' + index);
}
async function run() {
  check(command('/usr/bin/id', ['-u', 'smartplate-api']).stdout.trim() === '997' &&
    command('/usr/bin/id', ['-g', 'smartplate-api']).stdout.trim() === '997', 'SERVICE_ACCOUNT');
  protectedPath('/var/lib', true);
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { mode: 0o755 });
  protectedPath(BASE, true);
  const id = 'run-' + crypto.randomBytes(8).toString('hex'), root = beneath(BASE, id);
  fs.mkdirSync(root, { mode: 0o755 }); fs.mkdirSync(root + '/control', { mode: 0o700 }); fs.mkdirSync(root + '/code', { mode: 0o755 });
  const hashes = {};
  for (const file of HELPERS) {
    const original = path.join(__dirname, file), st = fs.lstatSync(original);
    check(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size < 128 * 1024, 'HELPER_SOURCE');
    const bytes = fs.readFileSync(original); hashes[file] = sha256(bytes);
    atomicWrite(root + '/code/' + file, bytes, 0o644);
  }
  atomicJson(root + '/control/helpers.json', hashes); atomicJson(root + '/control/units.json', []);
  atomicJson(root + '/control/progress.json', []);
  atomicWrite(root + '/control/transition.lock', '', 0o600);
  const watchdog = 'sp-rh-' + id.slice(4) + '-cleanup';
  process.stdout.write('REHEARSAL_DIRECTORY ' + root + '\n');
  command('/usr/bin/systemd-run', ['--quiet', '--unit=' + watchdog, '--on-active=10min',
    '--property=Type=oneshot', '--property=TimeoutStartSec=120s',
    '/usr/bin/node', root + '/code/linux-rehearsal.cjs', '--cleanup', id]);
  check(active(watchdog + '.timer'), 'CLEANUP_TIMER_MISSING');
  const suiteUnit = 'sp-rh-' + id.slice(4) + '-suite.service';
  try {
    // Independent cgroup lets the watchdog stop the controller AND its flock children
    // before cleaning up other fixture units, even if the user's console disconnects.
    command('/usr/bin/systemd-run', ['--quiet', '--unit=' + suiteUnit,
      '--property=Type=exec', '--property=RuntimeMaxSec=4min', '--property=TimeoutStopSec=5s',
      '--property=KillMode=control-group', '--property=MemoryMax=256M', '--property=TasksMax=64',
      '/usr/bin/node', root + '/code/linux-rehearsal.cjs', '--suite', id]);
    let printed = 0;
    const printProgress = () => {
      const lines = json(root + '/control/progress.json');
      for (; printed < lines.length; printed++) process.stdout.write(lines[printed] + '\n');
    };
    for (let i = 0; i < 540; i++) {
      printProgress();
      if (!active(suiteUnit)) {
        printProgress();
        const result = json(root + '/control/result.json');
        check(result.passed === true, result.error || 'SUITE_FAILED');
        return;
      }
      await sleep(500);
    }
    throw new Error('SUITE_TIMEOUT');
  }
  finally {
    // Keep watchdog armed if cleanup itself fails. Retain files/logs for inspection.
    stop(suiteUnit);
    cleanup(root); stop(watchdog + '.timer'); stop(watchdog + '.service');
  }
}
async function main(args) {
  check(process.platform === 'linux' && process.getuid() === 0, 'LINUX_ROOT_REQUIRED');
  process.umask(0o022);
  if (args.length === 1 && args[0] === '--run') return run();
  const [mode, id, name, operation, crash = ''] = args;
  check(['--action', '--locked', '--cleanup', '--suite'].includes(mode), 'USAGE');
  const root = rootFor(id); verifyHelpers(root);
  check(fs.realpathSync(__filename) === root + '/code/linux-rehearsal.cjs', 'PROTECTED_COPY_REQUIRED');
  if (mode === '--cleanup') {
    check(args.length === 2, 'USAGE');
    stop('sp-rh-' + id.slice(4) + '-suite.service');
    cleanup(root); return;
  }
  if (mode === '--suite') {
    check(args.length === 2, 'USAGE');
    const pid = command('/usr/bin/systemctl', ['show', 'sp-rh-' + id.slice(4) + '-suite.service', '--property=MainPID', '--value']).stdout.trim();
    check(pid === String(process.pid), 'SUITE_UNIT_REQUIRED');
    try { await suite(root); }
    catch (e) { atomicJson(root + '/control/result.json', { passed: false, error: e.code || e.message }); throw e; }
    return;
  }
  check(['arm', 'apply', 'confirm', 'rollback'].includes(operation), 'ACTION');
  caseFor(root, name);
  if (mode === '--action') { check(args.length === 4, 'USAGE'); callAction(root, name, operation); return; }
  check(args.length === 5, 'USAGE');
  check(fs.realpathSync('/proc/' + process.ppid + '/exe') === '/usr/bin/flock', 'LOCK_PARENT_REQUIRED');
  const parentArgs = fs.readFileSync('/proc/' + process.ppid + '/cmdline', 'utf8').split('\0');
  check(parentArgs.includes(root + '/control/transition.lock'), 'WRONG_LOCK');
  await action(root, name, operation, crash);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => {
  process.stderr.write('LINUX_RELEASE_REHEARSAL_FAILED ' + (e.code || e.message) + '\n'); process.exitCode = 1;
});
module.exports = { main };
