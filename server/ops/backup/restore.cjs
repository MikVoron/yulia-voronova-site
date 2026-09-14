#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { BASE, PG, ENV, FILES, INPUT, check, layout, unitArgs, validatePrepared, validateWorker } = require('./restore-contract.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function safeCode(e) { return /^RESTORE_[A-Z_]+$/.test(e.message) ? e.message : 'RESTORE_IO'; }
function protectedPath(file, directory = false) {
  const absolute = path.resolve(file); let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const s = fs.lstatSync(cursor);
    check(!s.isSymbolicLink() && s.uid === 0 && (s.mode & 0o022) === 0, 'RESTORE_UNTRUSTED_PATH');
  }
  const s = fs.lstatSync(absolute);
  check(directory ? s.isDirectory() : s.isFile() && s.nlink === 1, 'RESTORE_FILE_TYPE'); return s;
}
function read(file, limit) {
  const st = protectedPath(file), fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const actual = fs.fstatSync(fd);
    check(actual.ino === st.ino && actual.dev === st.dev && actual.size <= limit, 'RESTORE_FILE_CHANGED');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function write(file, bytes, mode = 0o600) {
  const fd = fs.openSync(file, 'wx', mode);
  try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, mode); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const parent = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function json(file, value) { write(file, JSON.stringify(value, null, 2) + '\n'); }
function publicDirectory(dir) {
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755); // Explicitly allow the DynamicUser to traverse code, despite umask 077.
}
function command(file, args, options = {}, code = 'RESTORE_COMMAND') {
  const r = cp.spawnSync(file, args, { env: ENV, timeout: 30000, maxBuffer: 128 * 1024, ...options });
  check(!r.error && r.status === 0, code); return r.stdout;
}
function bundle() {
  const sources = {}, hashes = {};
  for (const name of FILES) {
    const fd = fs.openSync(path.join(__dirname, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = fs.fstatSync(fd); check(st.isFile() && st.nlink === 1 && st.size < 128 * 1024, 'RESTORE_SOURCE');
      sources[name] = fs.readFileSync(fd); hashes[name] = sha(sources[name]);
    } finally { fs.closeSync(fd); }
  }
  return { sources, hashes, hash: sha(JSON.stringify(hashes)) };
}
function preflight() {
  check(process.platform === 'linux', 'RESTORE_LINUX');
  for (const file of ['/usr/bin/node', '/usr/bin/prlimit', '/usr/bin/flock', '/usr/bin/systemd-run',
    '/usr/bin/systemctl', '/usr/bin/gpg', '/usr/bin/curl', '/usr/bin/pgrep',
    ...['initdb', 'pg_ctl', 'postgres', 'psql', 'pg_dump', 'pg_restore'].map(x => PG + x)]) protectedPath(fs.realpathSync(file));
  check(command('/usr/bin/systemctl', ['--version']).toString().startsWith('systemd 249 '), 'RESTORE_SYSTEMD_VERSION');
  const space = fs.statfsSync('/run');
  check(space.type === 0x01021994 && space.bavail * space.bsize > 300 * 1024 * 1024, 'RESTORE_RUNTIME_SPACE');
  const mem = fs.readFileSync('/proc/meminfo', 'utf8');
  check(Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1]) > 768 * 1024, 'RESTORE_MEMORY');
  check(Number(mem.match(/^SwapTotal:\s+(\d+)/m)?.[1]) === 0, 'RESTORE_SWAP_ENABLED');
}
function snapshot() {
  const apiPid = Number(command('/usr/bin/pgrep', ['-f', '^node /var/www/smartplate-api/index\\.js *$']).toString().trim());
  check(Number.isSafeInteger(apiPid) && apiPid > 1, 'RESTORE_API_PID');
  const argv = fs.readFileSync('/proc/' + apiPid + '/cmdline', 'utf8').split('\0').filter(Boolean);
  check(JSON.stringify(argv) === JSON.stringify(['node /var/www/smartplate-api/index.js']) ||
    JSON.stringify(argv) === JSON.stringify(['node', '/var/www/smartplate-api/index.js']), 'RESTORE_API_COMMAND');
  const status = fs.readFileSync('/proc/' + apiPid + '/status', 'utf8');
  check(/^Uid:\s+997\s+997\s+997\s+997$/m.test(status) && /^Gid:\s+997\s+997\s+997\s+997$/m.test(status), 'RESTORE_API_UID');
  const health = JSON.parse(command('/usr/bin/curl', ['-q', '--fail', '--silent', '--show-error', '--max-time', '10',
    'https://api.voronova.online/health']).toString());
  check(health.status === 'ok' && health.db === 'ok', 'RESTORE_API_HEALTH');
  const stat = fs.readFileSync('/proc/' + apiPid + '/stat', 'utf8');
  const result = { apiPid, apiStart: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], status: 'ok', db: 'ok' };
  for (const [key, unit] of [['pm2Pid', 'pm2-root'], ['postgresPid', 'postgresql@16-main']]) {
    result[key] = Number(command('/usr/bin/systemctl', ['show', unit, '--property=MainPID', '--value']).toString().trim());
    check(result[key] > 1, 'RESTORE_PRODUCTION_PID');
  }
  result.files = Object.fromEntries(['index.js', 'package.json', 'package-lock.json'].map(name =>
    [name, sha(fs.readFileSync('/var/www/smartplate-api/' + name))]));
  return result;
}
function stopped(p) {
  const state = command('/usr/bin/systemctl', ['show', p.unit, '--property=ActiveState', '--value']).toString().trim();
  return ['inactive', 'failed'].includes(state);
}
function runUnit(id, mode, input, hostNet) {
  const p = layout(id, mode);
  check(!fs.existsSync(p.runtime), 'RESTORE_RUNTIME_EXISTS');
  let output;
  try {
    const r = cp.spawnSync('/usr/bin/systemd-run', unitArgs(id, mode, hostNet),
      { env: ENV, input, timeout: 210000, maxBuffer: 128 * 1024 });
    let worker;
    try { worker = JSON.parse((r.stdout || '').toString()); } catch { worker = null; }
    if (r.error || r.status !== 0) {
      json(p.root + '/control/' + mode + '-error.json', { status: r.status,
        error: r.error?.code || null, workerError: /^RESTORE_[A-Z_]+$/.test(worker?.error) ? worker.error : null });
      throw new Error('RESTORE_UNIT_FAILED');
    }
    validateWorker(worker, mode); output = worker;
  } finally {
    if (!stopped(p)) command('/usr/bin/systemctl', ['stop', p.unit]);
    check(stopped(p), 'RESTORE_UNIT_NOT_STOPPED');
    check(!fs.existsSync(p.runtime), 'RESTORE_RUNTIME_NOT_REMOVED');
    json(p.root + '/control/' + mode + '-cleanup.json', { complete: true, unitStopped: true, runtimeRemoved: true });
  }
  return output;
}
function locked(id, expectedHash, rehearsalOnly) {
  const p = layout(id);
  check(fs.realpathSync(__filename) === p.code + '/restore.cjs', 'RESTORE_PROTECTED_COPY');
  protectedPath(p.root, true); protectedPath(p.root + '/control', true); protectedPath(BASE + '/restore.lock');
  const hashes = JSON.parse(read(p.root + '/control/helpers.json', 4096));
  for (const name of FILES) check(sha(read(p.code + '/' + name, 128 * 1024)) === hashes[name], 'RESTORE_CODE_CHANGED');
  check(sha(JSON.stringify(hashes)) === expectedHash, 'RESTORE_BUNDLE_CHANGED');
  check(fs.realpathSync('/proc/' + process.ppid + '/exe') === '/usr/bin/flock', 'RESTORE_LOCK_PARENT');
  const actual = fs.readFileSync('/proc/' + process.ppid + '/cmdline', 'utf8').split('\0').filter(Boolean);
  check(JSON.stringify(actual) === JSON.stringify(lockArgs(id, expectedHash, rehearsalOnly)), 'RESTORE_LOCK_COMMAND');
  try {
    if (!rehearsalOnly) {
      validatePrepared(JSON.parse(read(INPUT.root + '/result.json', 8192)));
      check(sha(read(INPUT.root + '/download.gpg', INPUT.encryptedBytes)) === INPUT.encryptedHash, 'RESTORE_ENCRYPTED_HASH');
    }
    const before = snapshot(); json(p.root + '/control/production-before.json', before);
    const hostNet = fs.readlinkSync('/proc/self/ns/net');
    const fixture = runUnit(id, 'fixture', Buffer.alloc(0), hostNet);
    json(p.root + '/control/fixture.json', fixture); process.stdout.write('RESTORE_SYNTHETIC_OK\n');
    if (rehearsalOnly) {
      const after = snapshot(); json(p.root + '/control/production-after.json', after);
      check(JSON.stringify(before) === JSON.stringify(after), 'RESTORE_PRODUCTION_CHANGED');
      json(p.root + '/control/result.json', { passed: true, stage: 'synthetic-only', databaseRestored: false,
        syntheticFixturePassed: true, cleanupComplete: true, productionUnchanged: true,
        realArchiveRead: false, helpersSha256: expectedHash, isolation: fixture.isolation });
      process.stdout.write('RESTORE_RUNTIME_REMOVED\nPRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED\nRESTORE_REHEARSAL_OK\nREAL_BACKUP_RESTORE_NOT_RUN\n');
      return;
    }
    const pass = '/opt/voronova/.gpg-passphrase';
    check((protectedPath(pass).mode & 0o777) === 0o600, 'RESTORE_PASSPHRASE_MODE');
    fs.mkdirSync(p.root + '/control/gnupg', { mode: 0o700 });
    const passFd = fs.openSync(pass, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let dump;
    try {
      dump = command('/usr/bin/gpg', ['--no-options', '--batch', '--no-tty', '--no-autostart',
        '--pinentry-mode', 'loopback', '--no-symkey-cache', '--homedir', p.root + '/control/gnupg',
        '--passphrase-fd', '3', '--decrypt', INPUT.root + '/download.gpg'],
      { stdio: ['ignore', 'pipe', 'pipe', passFd], timeout: 90000, maxBuffer: 64 * 1024 * 1024 }, 'RESTORE_DECRYPT');
    } finally { fs.closeSync(passFd); }
    let restored;
    try {
      check(sha(dump) === INPUT.decryptedHash, 'RESTORE_DECRYPTED_HASH');
      process.stdout.write('RESTORE_ARCHIVE_HASH_VERIFIED\n');
      restored = runUnit(id, 'restore', dump, hostNet);
    } finally { dump.fill(0); }
    const after = snapshot(); json(p.root + '/control/production-after.json', after);
    check(JSON.stringify(before) === JSON.stringify(after), 'RESTORE_PRODUCTION_CHANGED');
    json(p.root + '/control/result.json', { passed: true, databaseRestored: true,
      sourceRun: 'run-623e21cd8157fdbf', encryptedSha256: INPUT.encryptedHash,
      decryptedSha256: INPUT.decryptedHash, tableCount: restored.tableCount,
      totalRows: restored.totalRows, nonemptyTables: restored.nonemptyTables, invalidIndexes: restored.invalidIndexes,
      syntheticFixturePassed: true, cleanupComplete: true, productionUnchanged: true,
      originalOwnershipAndAclRestored: false, applicationBusinessFlowsTested: false,
      isolation: restored.isolation });
    process.stdout.write('RESTORE_DATABASE_OK tables=' + restored.tableCount + '\nRESTORE_RUNTIME_REMOVED\nPRODUCTION_PID_FILES_AND_HEALTH_UNCHANGED\nBACKUP_RESTORE_DRILL_OK\n');
  } catch (e) {
    json(p.root + '/control/failure.json', { passed: false, error: safeCode(e) }); throw e;
  }
}
function lockArgs(id, hash, rehearsalOnly = false) {
  const p = layout(id);
  return ['/usr/bin/flock', '--nonblock', '--close', BASE + '/restore.lock', '/usr/bin/prlimit', '--core=0',
    '--fsize=8388608', '--', '/usr/bin/node', '--max-old-space-size=128', p.code + '/restore.cjs',
    rehearsalOnly ? '--locked-rehearse' : '--locked', id, hash];
}
function main(args) {
  if (args.length === 1 && args[0] === '--bundle-hash') { process.stdout.write(bundle().hash + '\n'); return; }
  if (args.length === 1 && args[0] === '--preflight') { preflight(); snapshot(); process.stdout.write('RESTORE_PREFLIGHT_OK\n'); return; }
  check(process.platform === 'linux' && process.getuid() === 0, 'RESTORE_ROOT_REQUIRED');
  check((args.length === 2 && ['--run', '--rehearse'].includes(args[0])) ||
    (args.length === 3 && ['--locked', '--locked-rehearse'].includes(args[0])), 'RESTORE_USAGE');
  check(/^[a-f0-9]{64}$/.test(args.at(-1)), 'RESTORE_HASH_ARGUMENT');
  process.umask(0o077); preflight();
  const rehearsalOnly = ['--rehearse', '--locked-rehearse'].includes(args[0]);
  if (args[0].startsWith('--locked')) return locked(args[1], args[2], rehearsalOnly);
  const value = bundle(); check(value.hash === args[1], 'RESTORE_BUNDLE_CHANGED');
  protectedPath('/var/lib', true);
  if (!fs.existsSync(BASE)) publicDirectory(BASE);
  protectedPath(BASE, true);
  check((fs.statSync(BASE).mode & 0o777) === 0o755, 'RESTORE_BASE_MODE');
  if (!fs.existsSync(BASE + '/restore.lock')) write(BASE + '/restore.lock', '');
  protectedPath(BASE + '/restore.lock');
  const id = 'run-' + crypto.randomBytes(8).toString('hex'), p = layout(id);
  publicDirectory(p.root); publicDirectory(p.code);
  fs.mkdirSync(p.root + '/control', { mode: 0o700 });
  for (const name of FILES) write(p.code + '/' + name, value.sources[name], 0o644);
  json(p.root + '/control/helpers.json', value.hashes);
  process.stdout.write('RESTORE_DRILL_DIRECTORY ' + p.root + '\n');
  const [file, ...params] = lockArgs(id, value.hash, rehearsalOnly);
  const r = cp.spawnSync(file, params, { env: ENV, stdio: 'inherit', timeout: 540000 });
  check(!r.error && r.status === 0, 'RESTORE_CHILD_FAILED');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { process.stderr.write('BACKUP_RESTORE_DRILL_FAILED ' + safeCode(e) + '\n'); process.exitCode = 1; }
}
module.exports = { lockArgs, bundle, write, publicDirectory };
