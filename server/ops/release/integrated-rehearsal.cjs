#!/usr/bin/env node
'use strict';
// ROOT FIXTURE ONLY. Targets are fixed beneath BASE; production access is read-only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const contract = require('./integrated-contract.cjs');
const { BASE, PM2, HELPERS, ENV, check, layout, environment, definition, verifyDefinitions,
  pm2Command, unitPath, timerMatches } = contract;
const { protectedPath, atomicJson, atomicWrite, inventory, verifyTree, copyVerified, syncDir } = require('./linux-storage.cjs');
const protocol = require('./protocol.cjs');
const control = require('./control-envelope.cjs');
let diagnosticsRoot;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clock = () => ({ bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(),
  realtimeMs: Date.now(), monotonicMs: Number(process.hrtime.bigint() / 1000000n) });
function command(file, args, options = {}) {
  const { allowFailure = false, ...rest } = options;
  const result = cp.spawnSync(file, args, { env: ENV, encoding: 'utf8', timeout: 30000,
    maxBuffer: 2 * 1024 * 1024, ...rest });
  if (result.error || result.status !== 0) {
    if (diagnosticsRoot) atomicJson(diagnosticsRoot + '/control/last-command-error.json',
      { file, args, status: result.status, error: result.error?.code || null, stderr: (result.stderr || '').slice(0, 8192) });
    if (!allowFailure) throw new Error('COMMAND_FAILED_' + path.basename(file));
  }
  return result;
}
function readBytes(filename, uid = 0) {
  if (uid === 0) protectedPath(filename);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    check(st.isFile() && st.nlink === 1 && st.uid === uid && st.size <= 128 * 1024 &&
      (st.mode & 0o022) === 0, 'INTEGRATED_READ_FILE');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
const json = filename => JSON.parse(readBytes(filename));
function verifyBundle(p) {
  protectedPath(p.root, true); protectedPath(p.lock);
  check(fs.realpathSync(__filename) === p.code + '/integrated-rehearsal.cjs', 'INTEGRATED_PROTECTED_COPY');
  const hashes = json(p.root + '/control/helpers.json');
  for (const file of HELPERS) check(protocol.sha256(readBytes(p.code + '/' + file)) === hashes[file], 'INTEGRATED_HELPER_HASH');
}
function verify(p) {
  verifyBundle(p); protectedPath(p.control, true);
  const config = json(p.control + '/config.json');
  check(config.fixture === true && config.id === p.id && config.name === p.name &&
    /^[a-f0-9]{32}$/.test(config.token) && [20000, 600000].includes(config.timerMs), 'INTEGRATED_CONFIG');
  return config;
}
function state(p) {
  const value = control.validate(json(p.control + '/control.json'));
  check(value.state.manifestSha256 === protocol.manifestDigest(json(p.control + '/manifest.json')), 'INTEGRATED_MANIFEST_BINDING');
  return value;
}
function transition(p, action, evidence = {}, observed = clock()) {
  const previous = state(p);
  const next = control.update(previous, { action, expectedGeneration: previous.generation,
    manifestSha256: previous.state.manifestSha256, sample: observed, evidence });
  atomicJson(p.control + '/control.json', next);
  return next;
}
function property(unit, key) {
  return command('/usr/bin/systemctl', ['show', unit, '--property=' + key, '--value']).stdout.trim();
}
function stopped(unit) { return ['inactive', 'failed'].includes(property(unit, 'ActiveState')); }
function stop(unit) {
  const result = command('/usr/bin/systemctl', ['stop', unit], { allowFailure: true });
  check(!result.error && stopped(unit), 'INTEGRATED_UNIT_NOT_STOPPED');
}
function pm2(p, action) {
  check(property(p.manager, 'ActiveState') === 'active', 'INTEGRATED_PM2_UNIT_INACTIVE');
  // Reject absent managers before invoking a CLI that can otherwise autostart.
  const pid = Number(readBytes(p.pm2 + '/pm2.pid').toString().trim());
  check(Number.isSafeInteger(pid) && pid > 1 && fs.statSync('/proc/' + pid).uid === 0 &&
    fs.readFileSync('/proc/' + pid + '/cgroup', 'utf8').includes('/' + p.manager), 'INTEGRATED_PM2_MANAGER_ID');
  check(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').includes('PM2_HOME=' + p.pm2),
    'INTEGRATED_PM2_MANAGER_ENV');
  for (const socket of ['rpc.sock', 'pub.sock']) {
    const st = fs.lstatSync(p.pm2 + '/' + socket);
    check(st.isSocket() && st.uid === 0, 'INTEGRATED_PM2_SOCKET');
  }
  const spec = pm2Command(p.id, p.name, action);
  const output = command(spec.file, spec.args, { env: spec.env, cwd: spec.cwd }).stdout;
  check(Number(readBytes(p.pm2 + '/pm2.pid').toString().trim()) === pid &&
    fs.readFileSync('/proc/' + pid + '/cgroup', 'utf8').includes('/' + p.manager), 'INTEGRATED_PM2_MANAGER_CHANGED');
  return output;
}
function processIdentity(pid) {
  check(Number.isSafeInteger(pid) && pid > 1, 'INTEGRATED_PROCESS_PID');
  const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
  for (const field of ['Uid', 'Gid']) check(new RegExp('^' + field + ':\\s+997\\s+997\\s+997\\s+997$', 'm').test(status), 'INTEGRATED_PROCESS_IDS');
  for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) check(new RegExp('^' + field + ':\\s+0+$', 'm').test(status), 'INTEGRATED_PROCESS_CAPS');
  return { pid, start: fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(') ')[1].split(' ')[19] };
}
async function health(p, version) {
  const cfg = verify(p), list = JSON.parse(pm2(p, 'list'));
  verifyDefinitions(list, p.id, p.name, cfg.token, version, true);
  const identities = [];
  for (const role of ['app', 'sentinel']) {
    const wanted = definition(p.id, p.name, cfg.token, role, role === 'app' ? version : 'stable');
    const entry = list.find(x => x.name === wanted.name);
    check(entry.pm2_env.status === 'online', 'INTEGRATED_PROCESS_NOT_ONLINE');
    const identity = processIdentity(entry.pid); identities.push(identity);
    check(fs.readFileSync('/proc/' + entry.pid + '/cgroup', 'utf8').includes('/' + p.manager), 'INTEGRATED_PROCESS_CGROUP');
    const ready = JSON.parse(readBytes(p.runtime + '/' + role + '.json', 997));
    check(ready.pid === entry.pid && ready.token === cfg.token && Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536,
      'INTEGRATED_PROCESS_READY');
    const base = 'http://127.0.0.1:' + ready.port;
    const response = await fetch(base + '/health', { signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    check(response.ok && body.fixture === true && body.token === cfg.token && body.version === wanted.env.SP_IR_VERSION &&
      body.role === role && body.pid === entry.pid && body.uid === 997 && body.gid === 997, 'INTEGRATED_HEALTH');
    if (role === 'app') {
      const catalog = await fetch(base + '/catalog', { signal: AbortSignal.timeout(2000) });
      const content = await catalog.json();
      check(catalog.ok && content.fixture === true && content.privateDetails === null &&
        JSON.stringify(content.public) === '["sample"]', 'INTEGRATED_CATALOG');
      const denied = await fetch(base + '/private', { signal: AbortSignal.timeout(2000) });
      check(denied.status === 401, 'INTEGRATED_PRIVATE'); await denied.text();
      const sitemap = await fetch(base + '/sitemap.xml', { signal: AbortSignal.timeout(2000) });
      check(sitemap.ok && await sitemap.text() === '<urlset/>', 'INTEGRATED_SITEMAP');
    }
    check(JSON.stringify(processIdentity(entry.pid)) === JSON.stringify(identity), 'INTEGRATED_PROCESS_CHANGED');
  }
  return identities;
}
async function waitHealth(p, version) {
  let last;
  for (let i = 0; i < 20; i++) { try { return await health(p, version); } catch (e) { last = e; } await sleep(200); }
  throw last;
}
function saved(p, version) {
  const cfg = verify(p), bytes = readBytes(p.pm2 + '/dump.pm2');
  verifyDefinitions(JSON.parse(bytes), p.id, p.name, cfg.token, version);
  return bytes;
}
function startManager(p, version, resurrect = false) {
  const cfg = verify(p);
  check(stopped(p.manager), 'INTEGRATED_MANAGER_ALREADY_RUNNING');
  if (!resurrect) {
    const expected = { apps: [definition(p.id, p.name, cfg.token, 'app', version),
      definition(p.id, p.name, cfg.token, 'sentinel', 'stable')] };
    check(JSON.stringify(json(p.control + '/' + version + '.config.json')) === JSON.stringify(expected), 'INTEGRATED_START_CONFIG');
  }
  const args = resurrect ? ['resurrect', '--no-daemon'] : ['start', p.control + '/' + version + '.config.json', '--no-daemon'];
  // PM2 and all its children are confined to one bounded fixture cgroup.
  command('/usr/bin/systemd-run', ['--quiet', '--collect', '--unit=' + p.manager, '--property=Type=exec',
    '--property=RuntimeMaxSec=150s', '--property=TimeoutStopSec=5s', '--property=KillMode=control-group',
    '--property=MemoryMax=256M', '--property=TasksMax=64', '--property=CPUQuota=50%',
    '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict', '--property=ReadWritePaths=' + p.dir,
    '/usr/bin/env', '-i', ...Object.entries(environment(p.id, p.name)).map(([k, v]) => k + '=' + v),
    '/usr/bin/node', PM2, ...args]);
}
function lockedArgs(p, action, crash = 'none') {
  return ['--exclusive', '--wait', '40', '--close', p.lock, '/usr/bin/node', p.code + '/integrated-rehearsal.cjs',
    '--locked', p.id, p.name, action, crash];
}
function call(p, action, crash = 'none', allowFailure = false) {
  return command('/usr/bin/flock', lockedArgs(p, action, crash), { allowFailure, timeout: 50000 });
}
function fault(point, selected) { if (point === selected) process.kill(process.pid, 'SIGKILL'); }
function timerEvidence(p, margin = 0) {
  const entry = state(p), cfg = json(p.control + '/timer.json'), observed = clock();
  check(cfg.bootId === observed.bootId && cfg.dueMs <= entry.recovery.deadlineMonotonicMs &&
    cfg.dueMs > observed.monotonicMs + margin && property(p.rollback + '.timer', 'ActiveState') === 'active' &&
    property(p.rollback + '.timer', 'SubState') === 'waiting' &&
    property(p.rollback + '.timer', 'Unit') === p.rollback + '.service' &&
    property(p.rollback + '.timer', 'WakeSystem') === 'no', 'INTEGRATED_TIMER_STATE');
  const raw = command('/usr/bin/busctl', ['--json=short', 'get-property', 'org.freedesktop.systemd1',
    unitPath(p.rollback + '.timer'), 'org.freedesktop.systemd1.Timer', 'NextElapseUSecMonotonic']).stdout;
  return timerMatches(JSON.parse(raw), cfg.dueMs);
}
function armTimer(p) {
  const cfg = verify(p), entry = state(p), sample = clock();
  check(entry.stage === 'arming' && sample.bootId === entry.recovery.bootId, 'INTEGRATED_TIMER_INTENT');
  const dueMs = Math.min(entry.recovery.deadlineMonotonicMs, entry.recovery.armedMonotonicMs + cfg.timerMs);
  check(dueMs > sample.monotonicMs, 'INTEGRATED_TIMER_EXPIRED');
  atomicJson(p.control + '/timer.json', { bootId: sample.bootId, dueMs });
  command('/usr/bin/systemd-run', ['--quiet', '--unit=' + p.rollback,
    '--on-boot=' + dueMs + 'ms', '--timer-property=AccuracySec=1ms', '--timer-property=RandomizedDelaySec=0',
    '--timer-property=WakeSystem=no', '--property=Type=oneshot', '--property=TimeoutStartSec=60s',
    '--property=Restart=on-failure', '--property=RestartSec=3s',
    '--property=MemoryMax=128M', '--property=TasksMax=32',
    '/usr/bin/env', '-i', 'PATH=' + ENV.PATH, 'LANG=C', '/usr/bin/flock', ...lockedArgs(p, 'rollback')]);
  timerEvidence(p);
}
function tree(p, which) { return json(p.control + '/' + which + '-tree.json'); }
function backup(p) {
  verifyTree(p.backup, tree(p, 'old'));
  const bytes = readBytes(p.control + '/old.dump.json');
  check(protocol.sha256(bytes) === json(p.control + '/old-dump-hash.json').sha256, 'INTEGRATED_DUMP_HASH');
  verifyDefinitions(JSON.parse(bytes), p.id, p.name, verify(p).token, 'old');
  return bytes;
}
function move(source, target) { check(!fs.existsSync(target), 'INTEGRATED_MOVE_TARGET'); fs.renameSync(source, target); syncDir(path.dirname(source)); }
function unique(p, prefix) { return p.dir + '/' + prefix + '-' + crypto.randomBytes(8).toString('hex'); }
async function evidence(p, action, version) {
  // EXPLICIT MODEL GATES: auditZero (generated dependency, not an npm audit),
  // publicHealth (no public fixture URL). All other checks below use fixture OS/data.
  const checks = protocol.CHECKS[action] || control.PREFLIGHT;
  if (checks.some(x => ['checkpointVerified', 'offlineModulesVerified', 'oldModulesVerified'].includes(x))) backup(p);
  if (checks.includes('newHashesMatch')) verifyTree(p.live, tree(p, 'new'));
  if (checks.includes('oldHashesMatch') || checks.includes('baselineUnchanged')) verifyTree(p.live, tree(p, 'old'));
  if (checks.includes('candidateLoadedAs997') || checks.includes('candidateTestsPassed')) {
    verifyTree(p.candidate, tree(p, 'new'));
    protocol.validateCandidate(json(p.control + '/manifest.json'), {
      'package.json': readBytes(p.candidate + '/package.json'),
      'package-lock.json': readBytes(p.candidate + '/package-lock.json') });
    const probe = command('/usr/bin/setpriv', ['--reuid=997', '--regid=997', '--clear-groups', '--no-new-privs',
      '/usr/bin/node', p.code + '/integrated-worker.cjs', p.id, p.name, verify(p).token, 'probe', 'new'], { cwd: p.candidate });
    check(probe.stdout.trim() === 'INTEGRATED_CANDIDATE_UID997_OK', 'INTEGRATED_CANDIDATE_PROBE');
  }
  await health(p, version);
  if (checks.includes('savedPm2997')) saved(p, version);
  if (checks.includes('timerVerified')) timerEvidence(p, ['confirm', 'commit'].includes(action) ? 120000 : 0);
  // Explicit coverage: a new protocol gate must fail until implemented here.
  const verified = { checkpointVerified: true, offlineModulesVerified: true, candidateLoadedAs997: true,
    candidateTestsPassed: true, baselineUnchanged: true, timerVerified: true, newHashesMatch: true,
    oldHashesMatch: true, oldModulesVerified: true, uidGid997: true, capabilitiesZero: true,
    localHealth: true, catalogAccess: true, sitemap: true, privateRoutes: true, stableProcess: true,
    savedPm2997: true, auditZero: true, publicHealth: true };
  check(checks.every(key => Object.hasOwn(verified, key)), 'INTEGRATED_UNIMPLEMENTED_EVIDENCE');
  return Object.fromEntries(checks.map(key => [key, verified[key]]));
}
async function action(p, operation, crash) {
  verify(p);
  atomicJson(p.control + '/last-action.json', { operation, crash, at: clock() });
  if (operation === 'init') {
    check(!fs.existsSync(p.control + '/control.json'), 'INTEGRATED_STATE_EXISTS');
    atomicJson(p.control + '/control.json', control.create(json(p.control + '/manifest.json'))); return;
  }
  const before = state(p);
  if (operation === 'arm') {
    check(before.stage === 'prepared', 'INTEGRATED_NOT_PREPARED');
    transition(p, 'intend-arm', await evidence(p, 'intend-arm', 'old'));
    fault('intent', crash); armTimer(p); fault('timer', crash);
    transition(p, 'arm', await evidence(p, 'arm', 'old')); return;
  }
  if (operation === 'apply') {
    transition(p, 'switch', await evidence(p, 'switch', 'old')); fault('switching', crash);
    stop(p.manager); fault('stopped', crash);
    move(p.live, unique(p, 'displaced')); fault('old-moved', crash);
    copyVerified(p.candidate, p.live, tree(p, 'new')); fault('new-copied', crash);
    startManager(p, 'new'); await waitHealth(p, 'new'); pm2(p, 'save');
    transition(p, 'pending', await evidence(p, 'pending', 'new')); return;
  }
  if (operation === 'confirm') {
    transition(p, 'confirm', await evidence(p, 'confirm', 'new')); fault('confirming', crash);
    pm2(p, 'save');
    transition(p, 'commit', await evidence(p, 'commit', 'new')); fault('confirmed', crash); return;
  }
  if (operation === 'cleanup-record') {
    const decision = control.decision(before, clock());
    check(['cleanup', 'cancel-cleanup', 'idle'].includes(decision), 'INTEGRATED_CLEANUP_NONTERMINAL');
    check(stopped(p.rollback + '.timer') && stopped(p.rollback + '.service'), 'INTEGRATED_CLEANUP_UNITS');
    transition(p, before.stage === 'cancelled' ? 'cancel-cleanup' : 'cleanup',
      { timerStopped: true, rollbackServiceInactive: true }); return;
  }
  check(operation === 'rollback', 'INTEGRATED_ACTION');
  const decision = control.decision(before, clock());
  if (decision === 'cancel-arm') { transition(p, 'cancel-arm'); return; }
  if (['cleanup', 'cancel-cleanup', 'idle', 'idle-prepared'].includes(decision)) return;
  transition(p, 'rollback'); // Durable decision even if backup verification subsequently fails.
  const dump = backup(p); fault('rollback-recorded', crash);
  const restored = unique(p, 'restore'); copyVerified(p.backup, restored, tree(p, 'old'));
  stop(p.manager); fault('rollback-stopped', crash);
  if (fs.existsSync(p.live)) move(p.live, unique(p, 'failed'));
  move(restored, p.live); fault('rollback-copied', crash);
  for (const file of ['dump.pm2', 'dump.pm2.bak']) atomicWrite(p.pm2 + '/' + file, dump);
  startManager(p, 'old', true); await waitHealth(p, 'old');
  check(saved(p, 'old').equals(dump), 'INTEGRATED_RESTORED_DUMP_BYTES');
  transition(p, 'restored', await evidence(p, 'restored', 'old'));
}
async function cleanupCase(p) {
  // Called by the suite, never by the rollback service itself. No lock while waiting.
  const choice = control.decision(state(p), clock());
  check(['cleanup', 'cancel-cleanup', 'idle'].includes(choice), 'INTEGRATED_CLEANUP_NONTERMINAL');
  stop(p.rollback + '.timer');
  for (let i = 0; i < 200; i++) {
    if (stopped(p.rollback + '.service')) { call(p, 'cleanup-record'); return; }
    await sleep(200);
  }
  throw new Error('INTEGRATED_CLEANUP_TIMEOUT');
}
function makeTree(dir, version) {
  fs.mkdirSync(dir, { mode: 0o755 }); fs.mkdirSync(dir + '/node_modules', { mode: 0o755 });
  fs.mkdirSync(dir + '/node_modules/release-fixture', { mode: 0o755 });
  const v = version === 'new' ? '2.0.0' : '1.0.0';
  const pkg = { name: 'smartplate-api', dependencies: { 'release-fixture': v } };
  atomicWrite(dir + '/package.json', JSON.stringify(pkg), 0o644);
  atomicWrite(dir + '/package-lock.json', JSON.stringify({ name: pkg.name, lockfileVersion: 3,
    packages: { '': pkg, 'node_modules/release-fixture': { version: v } } }), 0o644);
  atomicWrite(dir + '/node_modules/release-fixture/index.cjs', 'module.exports = ' + JSON.stringify({ version }) + ';\n', 0o644);
}
async function newCase(id, index, timerMs = 600000) {
  const p = layout(id, 'case-' + String(index).padStart(2, '0'));
  fs.mkdirSync(p.dir, { mode: 0o755 });
  for (const dir of [p.control, p.pm2, p.home, p.runtime]) fs.mkdirSync(dir, { mode: 0o700 });
  fs.chownSync(p.runtime, 997, 997);
  const token = crypto.randomBytes(16).toString('hex');
  atomicJson(p.control + '/config.json', { fixture: true, id, name: p.name, token, timerMs });
  const cases = json(p.root + '/control/cases.json'); cases.push(p.name); atomicJson(p.root + '/control/cases.json', cases);
  makeTree(p.live, 'old'); makeTree(p.candidate, 'new'); makeTree(p.stable, 'stable');
  const oldTree = inventory(p.live); copyVerified(p.live, p.backup, oldTree);
  atomicJson(p.control + '/old-tree.json', oldTree); atomicJson(p.control + '/new-tree.json', inventory(p.candidate));
  const manifest = { schemaVersion: 1, releaseId: 'pm2-fixture-' + id.slice(4) + '-' + p.name, commit: 'a'.repeat(40), kind: 'dependencies',
    files: protocol.FILES.map(file => ({ path: file, beforeSha256: protocol.sha256(readBytes(p.live + '/' + file)),
      afterSha256: protocol.sha256(readBytes(p.candidate + '/' + file)) })),
    probes: [{ module: 'release-fixture', version: '2.0.0' }] };
  atomicJson(p.control + '/manifest.json', manifest); call(p, 'init');
  for (const version of ['old', 'new']) atomicJson(p.control + '/' + version + '.config.json',
    { apps: [definition(id, p.name, token, 'app', version), definition(id, p.name, token, 'sentinel', 'stable')] });
  startManager(p, 'old'); await waitHealth(p, 'old'); pm2(p, 'save');
  const dump = saved(p, 'old'); atomicWrite(p.control + '/old.dump.json', dump);
  atomicJson(p.control + '/old-dump-hash.json', { sha256: protocol.sha256(dump) });
  return p;
}
async function productionSnapshot() {
  const rows = command('/usr/bin/ps', ['-eo', 'pid=,uid=,gid=,args=']).stdout.trim().split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .filter(row => row[4] === 'node /var/www/smartplate-api/index.js').map(row => row.slice(1, 4));
  check(rows.length === 1 && rows[0][1] === '997' && rows[0][2] === '997', 'INTEGRATED_PRODUCTION_PROCESS');
  for (const url of ['http://127.0.0.1:3000/health', 'https://api.voronova.online/health']) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) }), value = await response.json();
    check(response.ok && value.status === 'ok' && value.db === 'ok', 'INTEGRATED_PRODUCTION_HEALTH');
  }
  const hashes = {};
  for (const file of ['index.js', 'package.json', 'package-lock.json']) hashes[file] = protocol.sha256(fs.readFileSync('/var/www/smartplate-api/' + file));
  return { rows, hashes, pm2Pid: property('pm2-root', 'MainPID') };
}
async function parallel(p, operation) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('/usr/bin/flock', lockedArgs(p, operation), { env: ENV, stdio: 'ignore' });
    child.on('error', reject); child.on('exit', code => resolve(code));
  });
}
async function suite(id) {
  const root = layout(id).root, baseline = await productionSnapshot();
  atomicJson(root + '/control/production-before.json', baseline);
  const progress = [];
  function report(value) { progress.push(value); atomicJson(root + '/control/progress.json', progress); }
  let p = await newCase(id, 1); call(p, 'arm'); call(p, 'apply'); call(p, 'confirm');
  await cleanupCase(p); call(p, 'rollback'); await health(p, 'new'); stop(p.manager);
  report('INTEGRATED_CONFIRM_AND_LATE_ROLLBACK_OK');
  p = await newCase(id, 2, 20000); call(p, 'arm'); call(p, 'apply');
  for (let i = 0; i < 250 && state(p).state.phase !== 'rolled_back'; i++) await sleep(200);
  check(state(p).state.phase === 'rolled_back', 'INTEGRATED_REAL_TIMER_TIMEOUT');
  await cleanupCase(p); await health(p, 'old'); stop(p.manager); report('INTEGRATED_REAL_TIMER_ROLLBACK_OK');
  for (const [index, point] of [[3, 'intent'], [4, 'timer']]) {
    p = await newCase(id, index);
    check(call(p, 'arm', point, true).status === 137, 'INTEGRATED_EXPECTED_KILL');
    call(p, 'rollback'); await cleanupCase(p); await health(p, 'old'); stop(p.manager);
    report('INTEGRATED_INTERRUPTED_ARM_CANCELLED ' + point);
  }
  for (const [index, point] of [[5, 'switching'], [6, 'old-moved']]) {
    p = await newCase(id, index); call(p, 'arm');
    check(call(p, 'apply', point, true).status === 137, 'INTEGRATED_EXPECTED_KILL');
    call(p, 'rollback'); await cleanupCase(p); await health(p, 'old'); stop(p.manager);
    report('INTEGRATED_INTERRUPTED_APPLY_RESTORED ' + point);
  }
  p = await newCase(id, 7); call(p, 'arm'); call(p, 'apply');
  check(call(p, 'confirm', 'confirmed', true).status === 137, 'INTEGRATED_EXPECTED_KILL');
  call(p, 'rollback'); await cleanupCase(p); await cleanupCase(p); await health(p, 'new'); stop(p.manager);
  report('INTEGRATED_CONFIRMED_CRASH_CLEANUP_OK');
  p = await newCase(id, 8); call(p, 'arm'); call(p, 'apply');
  check(call(p, 'rollback', 'rollback-stopped', true).status === 137, 'INTEGRATED_EXPECTED_KILL');
  call(p, 'rollback'); await cleanupCase(p); await health(p, 'old'); stop(p.manager);
  report('INTEGRATED_INTERRUPTED_ROLLBACK_RESUMED');
  p = await newCase(id, 9); call(p, 'arm'); call(p, 'apply');
  const original = readBytes(p.control + '/old.dump.json'), running = await health(p, 'new');
  atomicWrite(p.control + '/old.dump.json', '{}');
  check(call(p, 'rollback', 'none', true).status !== 0, 'INTEGRATED_CORRUPTION_ACCEPTED');
  check(JSON.stringify(await health(p, 'new')) === JSON.stringify(running), 'INTEGRATED_CORRUPTION_STOPPED_PROCESS');
  timerEvidence(p); atomicWrite(p.control + '/old.dump.json', original); call(p, 'rollback');
  await cleanupCase(p); await health(p, 'old'); stop(p.manager); report('INTEGRATED_CORRUPT_DUMP_REFUSED_RETRY_OK');
  p = await newCase(id, 10); call(p, 'arm'); call(p, 'apply');
  const outcomes = await Promise.all([parallel(p, 'confirm'), parallel(p, 'rollback')]);
  check(outcomes.includes(0), 'INTEGRATED_RACE_NO_WINNER');
  check(['confirmed', 'rolled_back'].includes(state(p).state.phase), 'INTEGRATED_RACE_NOT_TERMINAL');
  await cleanupCase(p); await health(p, state(p).state.phase === 'confirmed' ? 'new' : 'old'); stop(p.manager);
  report('INTEGRATED_FLOCK_RACE_OK');
  const after = await productionSnapshot(); atomicJson(root + '/control/production-after.json', after);
  check(JSON.stringify(baseline) === JSON.stringify(after), 'INTEGRATED_PRODUCTION_CHANGED');
  atomicJson(root + '/control/result.json', { passed: true, cases: 10, fixtureProtocolIntegrated: true,
    fixtureUid997Tested: true, modeledEvidence: ['auditZero', 'publicHealth'], productionExecutionEnabled: false,
    productionUnchanged: true, osBootTested: false, cleanupComplete: true });
  report('PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED'); report('INTEGRATED_PM2_REHEARSAL_OK cases=10');
}
function stopAll(id) {
  const p = layout(id);
  verifyBundle(p);
  stop(p.suite); // Prevent any controller/child from starting new fixture resources.
  for (const name of json(p.root + '/control/cases.json')) {
    const item = layout(id, name);
    stop(item.rollback + '.timer'); stop(item.rollback + '.service'); stop(item.manager);
  }
  atomicJson(p.root + '/control/resources-stopped.json', { complete: true });
}
function preflight() {
  check(process.platform === 'linux', 'INTEGRATED_LINUX_REQUIRED');
  check(fs.realpathSync('/usr/bin/pm2') === PM2, 'INTEGRATED_PM2_PATH');
  for (const file of ['/usr/bin/node', '/usr/bin/flock', '/usr/bin/systemd-run', '/usr/bin/systemctl', '/usr/bin/busctl', '/usr/bin/setpriv']) protectedPath(fs.realpathSync(file));
  protectedPath(PM2);
  check(JSON.parse(readBytes('/usr/lib/node_modules/pm2/package.json')).version === '6.0.14', 'INTEGRATED_PM2_VERSION');
  check(command('/usr/bin/id', ['-u', 'smartplate-api']).stdout.trim() === '997' &&
    command('/usr/bin/id', ['-g', 'smartplate-api']).stdout.trim() === '997', 'INTEGRATED_ACCOUNT');
  const manager = JSON.parse(command('/usr/bin/busctl', ['--json=short', 'get-property', 'org.freedesktop.systemd1',
    '/org/freedesktop/systemd1', 'org.freedesktop.systemd1.Manager', 'Version']).stdout);
  check(manager.type === 's' && /^249(?:\.|$)/.test(manager.data), 'INTEGRATED_SYSTEMD_VERSION');
  const available = fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB$/m);
  check(available && Number(available[1]) >= 512 * 1024, 'INTEGRATED_MEMORY_HEADROOM');
}
function readBundle() {
  const sources = {}, hashes = {};
  for (const name of HELPERS) {
    const source = path.join(__dirname, name), fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = fs.fstatSync(fd); check(st.isFile() && st.nlink === 1 && st.size < 128 * 1024, 'INTEGRATED_SOURCE');
      sources[name] = fs.readFileSync(fd); hashes[name] = protocol.sha256(sources[name]);
    } finally { fs.closeSync(fd); }
  }
  return { sources, hashes, sha256: protocol.sha256(JSON.stringify(hashes)) };
}
async function run(expectedHash) {
  preflight();
  check(/^[a-f0-9]{64}$/.test(expectedHash), 'INTEGRATED_BUNDLE_HASH');
  const { sources, hashes, sha256 } = readBundle();
  check(sha256 === expectedHash, 'INTEGRATED_BUNDLE_CHANGED');
  protectedPath('/var/lib', true);
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { mode: 0o755 }); protectedPath(BASE, true);
  const id = 'run-' + crypto.randomBytes(8).toString('hex'), p = layout(id);
  fs.mkdirSync(p.root, { mode: 0o755 }); fs.mkdirSync(p.code, { mode: 0o755 });
  fs.mkdirSync(p.root + '/control', { mode: 0o700 });
  diagnosticsRoot = p.root;
  for (const name of HELPERS) atomicWrite(p.code + '/' + name, sources[name], 0o644);
  atomicJson(p.root + '/control/helpers.json', hashes); atomicJson(p.root + '/control/cases.json', []);
  atomicJson(p.root + '/control/progress.json', []); atomicWrite(p.lock, '');
  process.stdout.write('INTEGRATED_REHEARSAL_DIRECTORY ' + p.root + '\n');
  command('/usr/bin/systemd-run', ['--quiet', '--unit=' + p.watchdog, '--on-active=12min',
    '--property=Type=oneshot', '--property=TimeoutStartSec=120s',
    '/usr/bin/env', '-i', 'PATH=' + ENV.PATH, 'LANG=C', '/usr/bin/node', p.code + '/integrated-rehearsal.cjs', '--cleanup', id]);
  check(property(p.watchdog + '.timer', 'ActiveState') === 'active', 'INTEGRATED_WATCHDOG');
  try {
    command('/usr/bin/systemd-run', ['--quiet', '--unit=' + p.suite, '--property=Type=exec',
      '--property=RuntimeMaxSec=8min', '--property=TimeoutStopSec=5s', '--property=KillMode=control-group',
      '--property=MemoryMax=256M', '--property=TasksMax=64',
      '/usr/bin/env', '-i', 'PATH=' + ENV.PATH, 'LANG=C', '/usr/bin/node', p.code + '/integrated-rehearsal.cjs', '--suite', id]);
    let printed = 0;
    for (let i = 0; i < 1020; i++) {
      const progress = json(p.root + '/control/progress.json');
      for (; printed < progress.length; printed++) process.stdout.write(progress[printed] + '\n');
      if (stopped(p.suite)) {
        const result = json(p.root + '/control/result.json');
        check(result.passed === true && result.cases === 10, result.error || 'INTEGRATED_SUITE_FAILED');
        return;
      }
      await sleep(500);
    }
    throw new Error('INTEGRATED_SUITE_TIMEOUT');
  } finally {
    stopAll(id); stop(p.watchdog + '.timer'); stop(p.watchdog + '.service');
    process.stdout.write('INTEGRATED_FIXTURE_RESOURCES_STOPPED\n');
  }
}
async function main(args) {
  if (args.length === 1 && args[0] === '--bundle-hash') { process.stdout.write(readBundle().sha256 + '\n'); return; }
  if (args.length === 1 && args[0] === '--preflight') { preflight(); process.stdout.write('INTEGRATED_PREFLIGHT_OK\n'); return; }
  check(process.platform === 'linux' && process.getuid() === 0, 'INTEGRATED_ROOT_REQUIRED');
  process.umask(0o022);
  if (args.length === 2 && args[0] === '--run') return run(args[1]);
  const [mode, id, name, operation, crash] = args, p = layout(id, name || 'case-01');
  verifyBundle(p);
  diagnosticsRoot = p.root;
  if (mode === '--cleanup' && args.length === 2) { stopAll(id); stop(p.watchdog + '.timer'); return; }
  if (mode === '--suite' && args.length === 2) {
    check(property(p.suite, 'MainPID') === String(process.pid), 'INTEGRATED_SUITE_UNIT');
    try { await suite(id); }
    catch (e) { atomicJson(p.root + '/control/result.json', { passed: false, error: e.code || e.message }); throw e; }
    return;
  }
  check(mode === '--locked' && args.length === 5, 'INTEGRATED_USAGE');
  check(['init', 'arm', 'apply', 'confirm', 'rollback', 'cleanup-record'].includes(operation), 'INTEGRATED_ACTION');
  check(['none', 'intent', 'timer', 'switching', 'stopped', 'old-moved', 'new-copied', 'confirming', 'confirmed',
    'rollback-recorded', 'rollback-stopped', 'rollback-copied'].includes(crash), 'INTEGRATED_CRASH');
  check(fs.realpathSync('/proc/' + process.ppid + '/exe') === '/usr/bin/flock', 'INTEGRATED_LOCK_PARENT');
  const actual = fs.readFileSync('/proc/' + process.ppid + '/cmdline', 'utf8').split('\0').filter(Boolean);
  const expected = ['/usr/bin/flock', ...lockedArgs(p, operation, crash)].filter(Boolean);
  check(JSON.stringify(actual) === JSON.stringify(expected), 'INTEGRATED_LOCK_COMMAND');
  await action(p, operation, crash);
}
if (require.main === module) main(process.argv.slice(2)).catch(e => {
  process.stderr.write('INTEGRATED_PM2_REHEARSAL_FAILED ' + (e.code || e.message) + '\n'); process.exitCode = 1;
});
module.exports = { main };
