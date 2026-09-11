#!/usr/bin/env node
'use strict';

// NON-ROOT CONFIGURATION DRILL ONLY. No deploy, no UID 997 evidence, no boot test.
const fs = require('node:fs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const path = require('node:path');
const { PM2_CLI, check, layout, context, childEnv, definition, pm2Invocation, verifyDefinitions } = require('./pm2-sandbox.cjs');
const { atomicWrite, atomicJson } = require('./linux-storage.cjs');
const { sha256, VERSION } = require('./protocol.cjs');
const HELPERS = ['pm2-rehearsal.cjs', 'pm2-sandbox.cjs', 'pm2-fixture-worker.cjs',
  'linux-storage.cjs', 'protocol.cjs'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const BASE_ENV = { PATH: '/usr/bin:/bin', LANG: 'C', XDG_RUNTIME_DIR: '/run/user/1000' };

function command(file, args, options = {}) {
  const result = cp.spawnSync(file, args, { env: BASE_ENV, encoding: 'utf8', timeout: 20000,
    maxBuffer: 2 * 1024 * 1024, ...options });
  check(!result.error && result.status === 0, 'COMMAND_FAILED_' + path.basename(file));
  return result.stdout;
}
function privatePath(root, file, directory = false) {
  layout(root);
  check(file === root || file.startsWith(root + '/'), 'PM2_FIXTURE_OUTSIDE_ROOT');
  check(path.resolve(file) === file, 'PM2_FIXTURE_NONCANONICAL_PATH');
  let cursor = root;
  for (const piece of ['', ...file.slice(root.length + 1).split('/').filter(Boolean)]) {
    if (piece) cursor += '/' + piece;
    const st = fs.lstatSync(cursor);
    check(!st.isSymbolicLink() && st.uid === 1000 && (st.mode & 0o077) === 0, 'PM2_FIXTURE_PRIVATE_PATH');
  }
  const st = fs.lstatSync(file);
  check(directory ? st.isDirectory() : st.isFile() && st.nlink === 1 && st.size <= 2 * 1024 * 1024,
    'PM2_FIXTURE_FILE_TYPE');
  return file;
}
function readJson(root, file) { return JSON.parse(fs.readFileSync(privatePath(root, file), 'utf8')); }
function verifyRoot(root, token) {
  const p = context(root, token);
  check(fs.realpathSync(root) === root, 'PM2_FIXTURE_ROOT_LINK');
  privatePath(root, root, true);
  const config = readJson(root, p.control + '/config.json');
  check(config.fixture === true && config.token === token && config.uid === 1000, 'PM2_FIXTURE_MARKER');
  const hashes = readJson(root, p.control + '/helpers.json');
  for (const name of HELPERS) {
    check(sha256(fs.readFileSync(privatePath(root, p.code + '/' + name))) === hashes[name], 'PM2_FIXTURE_HELPER_HASH');
  }
  return p;
}
function pm2(root, token, operation) {
  const p = verifyRoot(root, token), spec = pm2Invocation(root, operation);
  privatePath(root, p.pm2, true);
  // All sockets/configuration/logs are selected by this freshly built environment.
  return command(spec.file, spec.args, { env: spec.env, cwd: spec.cwd });
}
function processIdentity(pid) {
  check(Number.isSafeInteger(pid) && pid > 1, 'PM2_FIXTURE_PID');
  const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
  for (const key of ['Uid', 'Gid']) check(new RegExp('^' + key + ':\\s+1000\\s+1000\\s+1000\\s+1000$', 'm').test(status),
    'PM2_FIXTURE_PROCESS_IDS');
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) {
    check(new RegExp('^' + key + ':\\s+0+$', 'm').test(status), 'PM2_FIXTURE_CAPABILITIES');
  }
  return { pid, start: fs.readFileSync('/proc/' + pid + '/stat', 'utf8').split(') ')[1].split(' ')[19] };
}
function manager(root) {
  const p = layout(root);
  const pid = Number(fs.readFileSync(privatePath(root, p.pm2 + '/pm2.pid'), 'utf8').trim());
  const identity = processIdentity(pid);
  const title = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8');
  check(title.includes('God Daemon (' + p.pm2 + ')'), 'PM2_FIXTURE_MANAGER_HOME');
  const env = fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0');
  check(env.includes('PM2_HOME=' + p.pm2), 'PM2_FIXTURE_MANAGER_ENV');
  return identity;
}
function stillAlive(identity) {
  try { return processIdentity(identity.pid).start === identity.start; }
  catch (e) { if (['ENOENT', 'ESRCH'].includes(e.code)) return false; throw e; }
}
async function stopPm2(root, token) {
  const p = verifyRoot(root, token);
  if (!fs.existsSync(p.pm2 + '/pm2.pid')) return;
  const saved = manager(root);
  pm2(root, token, 'kill');
  for (let i = 0; i < 30; i++) {
    if (!stillAlive(saved)) return;
    await sleep(100);
  }
  throw new Error('PM2_FIXTURE_MANAGER_STILL_ALIVE');
}
async function healthy(root, token, version) {
  const p = verifyRoot(root, token), list = JSON.parse(pm2(root, token, 'list'));
  verifyDefinitions(list, root, token, version, true);
  const identities = {};
  for (const role of ['app', 'sentinel']) {
    const spec = definition(root, token, role, role === 'app' ? version : 'stable');
    const entry = list.find(x => x.name === spec.name);
    check(entry.pm2_env.status === 'online', 'PM2_FIXTURE_NOT_ONLINE');
    identities[role] = processIdentity(entry.pid);
    const ready = readJson(root, p.runtime + '/' + role + '.json');
    check(ready.token === token && ready.pid === entry.pid &&
      Number.isInteger(ready.port) && ready.port > 0 && ready.port < 65536, 'PM2_FIXTURE_READY');
    const response = await fetch('http://127.0.0.1:' + ready.port + '/health', { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    check(response.ok && body.fixture === true && body.token === token && body.pid === entry.pid &&
      body.role === role && body.version === spec.env.SP_PM2_VERSION &&
      body.setting === spec.env.SP_PM2_SETTING && body.uid === 1000 && body.gid === 1000, 'PM2_FIXTURE_HEALTH');
  }
  identities.manager = manager(root);
  return identities;
}
async function waitHealthy(root, token, version) {
  let error;
  for (let i = 0; i < 15; i++) {
    try { return await healthy(root, token, version); } catch (e) { error = e; }
    await sleep(150);
  }
  throw error;
}
function dump(root, token, version) {
  const p = verifyRoot(root, token), file = privatePath(root, p.pm2 + '/dump.pm2');
  const bytes = fs.readFileSync(file);
  verifyDefinitions(JSON.parse(bytes), root, token, version);
  return bytes;
}
function checkpoint(root, token) {
  const p = verifyRoot(root, token);
  const bytes = fs.readFileSync(privatePath(root, p.control + '/checkpoint.dump.json'));
  const expected = readJson(root, p.control + '/checkpoint.json');
  check(expected.sha256 === sha256(bytes), 'PM2_FIXTURE_CHECKPOINT_HASH');
  verifyDefinitions(JSON.parse(bytes), root, token, 'old');
  return bytes;
}
async function restore(root, token) {
  const p = verifyRoot(root, token);
  // Refuse a corrupt checkpoint BEFORE stopping any currently healthy process.
  const bytes = checkpoint(root, token);
  await stopPm2(root, token);
  // PM2 can fall back to dump.pm2.bak. Restore BOTH to the same reviewed bytes.
  for (const name of ['dump.pm2', 'dump.pm2.bak']) {
    atomicWrite(p.pm2 + '/' + name, bytes);
    check(sha256(fs.readFileSync(privatePath(root, p.pm2 + '/' + name))) === sha256(bytes), 'PM2_FIXTURE_RESTORE_HASH');
  }
  pm2(root, token, 'resurrect');
  return waitHealthy(root, token, 'old');
}
async function productionSnapshot() {
  // Read-only baseline. Never calls production PM2 or reads its environment.
  const processes = command('/usr/bin/ps', ['-eo', 'pid=,uid=,gid=,args=']).trim().split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .filter(m => m[4] === 'node /var/www/smartplate-api/index.js')
    .map(m => ({ pid: Number(m[1]), uid: Number(m[2]), gid: Number(m[3]) }));
  check(processes.length === 1 && processes[0].uid === 997 && processes[0].gid === 997, 'PRODUCTION_BASELINE_PROCESS');
  const managerPid = command('/usr/bin/systemctl', ['show', 'pm2-root', '--property=MainPID', '--value']).trim();
  check(/^[1-9][0-9]+$/.test(managerPid), 'PRODUCTION_BASELINE_MANAGER');
  for (const url of ['http://127.0.0.1:3000/health', 'https://api.voronova.online/health']) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) }), health = await response.json();
    check(response.ok && health.status === 'ok' && health.db === 'ok', 'PRODUCTION_BASELINE_HEALTH');
  }
  const hashes = {};
  for (const name of ['index.js', 'package.json', 'package-lock.json']) {
    hashes[name] = sha256(fs.readFileSync('/var/www/smartplate-api/' + name));
  }
  return { processes, managerPid, hashes };
}
async function suite(root, token) {
  const p = verifyRoot(root, token);
  check(fs.realpathSync(__filename) === p.code + '/pm2-rehearsal.cjs', 'PM2_FIXTURE_COPY_REQUIRED');
  const mainPid = command('/usr/bin/systemctl', ['--user', 'show', p.unit, '--property=MainPID', '--value']).trim();
  check(mainPid === String(process.pid), 'PM2_FIXTURE_USER_UNIT_REQUIRED');
  const before = await productionSnapshot();
  atomicJson(p.control + '/production-before.json', before);
  const progress = [];
  const report = value => { progress.push(value); atomicJson(p.control + '/progress.json', progress); process.stdout.write(value + '\n'); };
  let error, cleanupComplete = false;
  try {
    pm2(root, token, 'start-old');
    await waitHealthy(root, token, 'old');
    pm2(root, token, 'save');
    const saved = dump(root, token, 'old');
    atomicWrite(p.control + '/checkpoint.dump.json', saved);
    atomicJson(p.control + '/checkpoint.json', { sha256: sha256(saved) });
    report('ISOLATED_PM2_CONFIG_SAVED');
    const original = await healthy(root, token, 'old');
    await stopPm2(root, token);
    pm2(root, token, 'resurrect');
    const resurrected = await waitHealthy(root, token, 'old');
    check(!stillAlive(original.manager) && resurrected.manager.pid !== original.manager.pid, 'PM2_FIXTURE_DAEMON_NOT_REPLACED');
    report('SAVED_PM2_CONFIG_RESURRECTED');
    pm2(root, token, 'delete-app');
    pm2(root, token, 'start-new');
    const candidate = await waitHealthy(root, token, 'new');
    check(candidate.sentinel.pid === resurrected.sentinel.pid &&
      candidate.sentinel.start === resurrected.sentinel.start, 'PM2_FIXTURE_SENTINEL_RESTARTED');
    pm2(root, token, 'save'); dump(root, token, 'new');
    report('CANDIDATE_CONFIG_AND_SENTINEL_VERIFIED');
    atomicWrite(p.control + '/checkpoint.dump.json', '{"damaged":true}');
    let refused = false;
    try { await restore(root, token); } catch (e) { check(e.message === 'PM2_FIXTURE_CHECKPOINT_HASH', 'PM2_FIXTURE_WRONG_FAILURE'); refused = true; }
    check(refused, 'PM2_FIXTURE_CORRUPT_CHECKPOINT_ACCEPTED');
    check(JSON.stringify(await healthy(root, token, 'new')) === JSON.stringify(candidate), 'PM2_FIXTURE_CORRUPTION_STOPPED_PROCESS');
    report('CORRUPT_CHECKPOINT_REFUSED_WITH_PROCESS_UNCHANGED');
    atomicWrite(p.control + '/checkpoint.dump.json', saved);
    await restore(root, token);
    check(dump(root, token, 'old').equals(saved), 'PM2_FIXTURE_DUMP_BYTES_CHANGED');
    report('OFFLINE_PM2_CONFIG_RESTORE_VERIFIED');
  } catch (e) { error = e; }
  finally {
    try { await stopPm2(root, token); cleanupComplete = true; }
    catch (e) { error = error || e; }
  }
  const after = await productionSnapshot();
  atomicJson(p.control + '/production-after.json', after);
  check(JSON.stringify(before) === JSON.stringify(after), 'PRODUCTION_BASELINE_CHANGED');
  atomicJson(p.control + '/result.json', { passed: !error && cleanupComplete, cleanupComplete,
    cases: progress.length, protocolVersion: VERSION, protocolIntegrated: false, uid: 1000,
    uid997Tested: false, osBootTested: false, productionUnchanged: true,
    error: error ? error.message : null });
  if (error) throw error;
  report('PRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED');
  report('ISOLATED_PM2_CONFIG_REHEARSAL_OK cases=5');
}
async function run() {
  check(fs.realpathSync('/tmp') === '/tmp' && fs.statSync('/tmp').uid === 0 &&
    (fs.statSync('/tmp').mode & 0o1000) !== 0, 'PM2_FIXTURE_TMP_PARENT');
  check(fs.realpathSync('/usr/bin/pm2') === PM2_CLI, 'PM2_FIXTURE_INSTALLED_PATH');
  const packageFile = '/usr/lib/node_modules/pm2/package.json';
  check(fs.statSync(packageFile).uid === 0 && (fs.statSync(packageFile).mode & 0o022) === 0,
    'PM2_FIXTURE_INSTALLED_OWNER');
  check(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version === '6.0.14', 'PM2_FIXTURE_UNREVIEWED_VERSION');
  command('/usr/bin/systemctl', ['--user', 'is-system-running']);
  const root = fs.mkdtempSync('/tmp/sp-pm2-rh-'), token = crypto.randomBytes(16).toString('hex');
  fs.chmodSync(root, 0o700);
  const p = context(root, token);
  for (const name of ['pm2', 'home', 'work', 'runtime', 'control', 'code', 'logs', 'tmp']) fs.mkdirSync(p[name], { mode: 0o700 });
  const hashes = {};
  for (const name of HELPERS) {
    const source = path.join(__dirname, name), st = fs.lstatSync(source);
    check(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.size <= 128 * 1024, 'PM2_FIXTURE_SOURCE');
    const bytes = fs.readFileSync(source); hashes[name] = sha256(bytes);
    atomicWrite(p.code + '/' + name, bytes);
  }
  atomicJson(p.control + '/helpers.json', hashes);
  atomicJson(p.control + '/config.json', { fixture: true, token, uid: 1000 });
  atomicJson(p.control + '/old.config.json', { apps: [definition(root, token, 'app', 'old'),
    definition(root, token, 'sentinel', 'stable')] });
  atomicJson(p.control + '/new.config.json', { apps: [definition(root, token, 'app', 'new')] });
  process.stdout.write('PM2_REHEARSAL_DIRECTORY ' + root + '\n');
  // No sudo, startup hooks or system-level units. The user cgroup bounds ALL
  // descendants, including the detached PM2 daemon, after crash/disconnection.
  const args = ['--user', '--quiet', '--wait', '--pipe', '--collect', '--unit=' + p.unit,
    '--property=Type=exec', '--property=RuntimeMaxSec=180s', '--property=TimeoutStopSec=10s',
    '--property=KillMode=control-group', '--property=SendSIGKILL=yes',
    '--property=MemoryMax=256M', '--property=TasksMax=64', '--property=CPUQuota=50%',
    '--property=NoNewPrivileges=yes', '/usr/bin/env', '-i',
    'PATH=/usr/bin:/bin', 'LANG=C', 'XDG_RUNTIME_DIR=/run/user/1000',
    '/usr/bin/node', '--max-old-space-size=64', p.code + '/pm2-rehearsal.cjs', '--suite', root, token];
  const child = cp.spawn('/usr/bin/systemd-run', args, { env: BASE_ENV, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  check(code === 0, 'PM2_FIXTURE_USER_UNIT_FAILED');
  const result = readJson(root, p.control + '/result.json');
  check(result.passed && result.cleanupComplete, 'PM2_FIXTURE_RESULT_FAILED');
  const active = command('/usr/bin/systemctl', ['--user', 'show', p.unit, '--property=ActiveState', '--value']);
  check(active.trim() === 'inactive', 'PM2_FIXTURE_UNIT_NOT_INACTIVE');
  process.stdout.write('ISOLATED_PM2_USER_UNIT_INACTIVE\n');
}
async function main(args) {
  check(process.platform === 'linux' && process.getuid() === 1000 && process.getgid() === 1000,
    'PM2_FIXTURE_LINUX_ADMIN_REQUIRED');
  process.umask(0o077);
  if (args.length === 1 && args[0] === '--run') return run();
  if (args.length === 3 && args[0] === '--suite') return suite(args[1], args[2]);
  throw new Error('PM2_FIXTURE_USAGE');
}
if (require.main === module) main(process.argv.slice(2)).catch(e => {
  process.stderr.write('ISOLATED_PM2_CONFIG_REHEARSAL_FAILED ' + (e.code || e.message) + '\n');
  process.exitCode = 1;
});
module.exports = { main };
