#!/usr/bin/env node
'use strict';
// One pinned encrypted object. No SQL execution, DB connection or cloud writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const BASE = '/var/lib/smartplate-restore-drills';
const ARCHIVE = 'smartplate_db_2026-09-12_03-00.dump.gpg';
const SIZE = 1585086;
const HASH = 'd573ea4f66d9824849360ecacbd509428b5f6a824e711cc2265b54769c3a8a02';
const SCRIPT_HASH = 'ce8b3726411ec8914213b7a70b84a4623ee1e041ad8229cfc098c44876950056';
const ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com';
const LOCAL = '/opt/voronova/backups/' + ARCHIVE;
const CREDS = '/opt/voronova/.b2-credentials';
const PASS = '/opt/voronova/.gpg-passphrase';
const PG = '/usr/lib/postgresql/16/bin/pg_restore';
const RECHECK_SOURCE = BASE + '/run-e76d043900822355/download.gpg';
const ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function check(ok, code) { if (!ok) throw new Error(code); }
function layout(id) {
  check(typeof id === 'string' && /^run-[a-f0-9]{16}$/.test(id), 'PREPARE_RUN_ID');
  return { root: BASE + '/' + id, code: BASE + '/' + id + '/prepare.cjs' };
}
function protectedPath(file, directory = false) {
  const absolute = path.resolve(file);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const st = fs.lstatSync(cursor);
    check(!st.isSymbolicLink() && st.uid === 0 && (st.mode & 0o022) === 0, 'PREPARE_PATH');
  }
  const st = fs.lstatSync(absolute);
  check(directory ? st.isDirectory() : st.isFile() && st.nlink === 1, 'PREPARE_FILE_TYPE');
  return st;
}
function read(file, limit, secret = false) {
  const st = protectedPath(file);
  if (secret) check((st.mode & 0o777) === 0o600, 'PREPARE_SECRET_MODE');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const current = fs.fstatSync(fd);
    check(current.ino === st.ino && current.dev === st.dev && current.size <= limit,
      'PREPARE_FILE_CHANGED_OR_TOO_LARGE');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function writeNew(file, bytes) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const parent = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function credentials(text) {
  // Parse assignments, never execute/source the shell file. Reject unsupported syntax.
  const result = Object.create(null);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?(B2_KEY_ID|B2_APP_KEY|B2_ENDPOINT)=(?:'([^']*)'|"([^"]*)"|([^\s#]+))\s*(?:#.*)?$/);
    check(m && !Object.hasOwn(result, m[1]), 'PREPARE_CREDENTIAL_FORMAT');
    result[m[1]] = m[2] ?? m[3] ?? m[4];
  }
  check(/^[A-Za-z0-9_-]{8,128}$/.test(result.B2_KEY_ID || '') &&
    /^[A-Za-z0-9+/_=-]{8,256}$/.test(result.B2_APP_KEY || ''), 'PREPARE_CREDENTIAL_FORMAT');
  check(result.B2_ENDPOINT === undefined || result.B2_ENDPOINT === ENDPOINT, 'PREPARE_ENDPOINT');
  return result;
}
function downloadSpec(id, keys) {
  const p = layout(id);
  return { file: '/usr/bin/aws', args: ['s3api', 'get-object', '--bucket', 'voronova-backups',
    '--key', 'db/' + ARCHIVE, '--range', 'bytes=0-' + SIZE, '--endpoint-url', ENDPOINT,
    '--cli-connect-timeout', '10', '--cli-read-timeout', '30', p.root + '/download.gpg'],
  env: { ...ENV, HOME: p.root, AWS_ACCESS_KEY_ID: keys.B2_KEY_ID, AWS_SECRET_ACCESS_KEY: keys.B2_APP_KEY,
    AWS_DEFAULT_REGION: 'eu-central-003', AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_EC2_METADATA_DISABLED: 'true', AWS_MAX_ATTEMPTS: '2', AWS_PAGER: '' } };
}
function decryptArgs(root) {
  return ['--no-options', '--batch', '--no-tty', '--no-autostart', '--pinentry-mode', 'loopback',
    '--no-symkey-cache', '--homedir', root + '/gnupg', '--passphrase-fd', '3', '--decrypt', root + '/download.gpg'];
}
function tocSummary(text) {
  const lines = text.split(/\r?\n/).filter(x => /^\d+; /.test(x));
  const tables = lines.filter(x => /^\d+; \d+ \d+ TABLE public /.test(x)).length;
  const tableData = lines.filter(x => /^\d+; \d+ \d+ TABLE DATA public /.test(x)).length;
  check(tables > 0 && tableData > 0, 'PREPARE_TOC_EMPTY');
  return { entries: lines.length, publicTables: tables, publicTableData: tableData };
}
function command(file, args, options = {}, code = 'PREPARE_COMMAND') {
  const result = cp.spawnSync(file, args, { env: ENV, timeout: 90000, maxBuffer: 2 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    // Never expose captured output: it can contain credentials, metadata or plaintext.
    if (Buffer.isBuffer(result.stdout)) result.stdout.fill(0);
    if (Buffer.isBuffer(result.stderr)) result.stderr.fill(0);
    throw new Error(code);
  }
  return result.stdout;
}
function tocOutput(result) {
  // --list may exit successfully after TOC while the parent still sends data.
  // Accept only that write-side EPIPE, never a failed reader, signal or timeout.
  const earlyClose = result.error?.code === 'EPIPE';
  check(result.status === 0 && !result.signal && (!result.error || earlyClose), 'PREPARE_TOC');
  check(Buffer.isBuffer(result.stdout), 'PREPARE_TOC');
  return { bytes: result.stdout, earlyClose };
}
function preflight() {
  check(process.platform === 'linux', 'PREPARE_LINUX');
  for (const file of ['/usr/bin/node', '/usr/bin/prlimit', '/usr/bin/aws', '/usr/bin/gpg', PG]) protectedPath(fs.realpathSync(file));
  check(protectedPath(LOCAL).size === SIZE, 'PREPARE_LOCAL_SIZE');
  for (const file of [CREDS, PASS]) check((protectedPath(file).mode & 0o777) === 0o600, 'PREPARE_SECRET_MODE');
  const space = fs.statfsSync('/var/lib');
  check(space.bavail * space.bsize > 256 * 1024 * 1024, 'PREPARE_SPACE');
}
function prepare(id, recheck = false) {
  const p = layout(id);
  check(fs.realpathSync(__filename) === p.code, 'PREPARE_PROTECTED_COPY');
  protectedPath(p.root, true);
  check((protectedPath(p.code).mode & 0o777) === 0o600, 'PREPARE_CODE_MODE');
  check(sha(read('/opt/voronova/backup.sh', 128 * 1024)) === SCRIPT_HASH, 'PREPARE_BACKUP_SCRIPT_CHANGED');
  check(sha(read(LOCAL, SIZE)) === HASH, 'PREPARE_LOCAL_HASH');
  if (recheck) {
    const previous = read(RECHECK_SOURCE, SIZE, true);
    check(previous.length === SIZE && sha(previous) === HASH, 'PREPARE_EXISTING_COPY_HASH');
    writeNew(p.root + '/download.gpg', previous);
  } else {
    const keys = credentials(read(CREDS, 16 * 1024, true).toString('utf8'));
    const spec = downloadSpec(id, keys);
    command(spec.file, spec.args, { env: spec.env }, 'PREPARE_B2_DOWNLOAD');
  }
  const encrypted = read(p.root + '/download.gpg', SIZE + 1, true);
  check(encrypted.length === SIZE && sha(encrypted) === HASH, 'PREPARE_B2_HASH');
  process.stdout.write(recheck ? 'BACKUP_EXISTING_COPY_VERIFIED\n' : 'BACKUP_B2_COPY_VERIFIED\n');
  fs.mkdirSync(p.root + '/gnupg', { mode: 0o700 });
  // Passphrase is provided as a descriptor, never an argument or log entry.
  const passStat = protectedPath(PASS);
  check((passStat.mode & 0o777) === 0o600, 'PREPARE_SECRET_MODE');
  const passFd = fs.openSync(PASS, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let dump;
  try {
    dump = command('/usr/bin/gpg', decryptArgs(p.root), { maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe', passFd] }, 'PREPARE_DECRYPT');
  } finally { fs.closeSync(passFd); }
  let summary, dumpHash, tocInputEarlyClose;
  try {
    check(dump.subarray(0, 5).toString('ascii') === 'PGDMP', 'PREPARE_DUMP_FORMAT');
    dumpHash = sha(dump);
    const raw = cp.spawnSync(PG, ['--list'], { input: dump, env: ENV,
      timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
    const errorCode = raw.error ? (['EPIPE', 'ETIMEDOUT', 'ENOBUFS'].includes(raw.error.code) ? raw.error.code : 'OTHER') : 'none';
    process.stdout.write('BACKUP_TOC_PROCESS status=' + (Number.isInteger(raw.status) ? raw.status : 'none') +
      ' error=' + errorCode + '\n');
    try {
      const toc = tocOutput(raw);
      tocInputEarlyClose = toc.earlyClose;
      summary = tocSummary(toc.bytes.toString('utf8'));
    } finally {
      if (Buffer.isBuffer(raw.stdout)) raw.stdout.fill(0);
      if (Buffer.isBuffer(raw.stderr)) raw.stderr.fill(0);
    }
  } finally { dump.fill(0); }
  // Re-read local source to detect replacement/rotation during download.
  check(sha(read(LOCAL, SIZE)) === HASH, 'PREPARE_LOCAL_CHANGED');
  writeNew(p.root + '/result.json', JSON.stringify({ passed: true, stage: 'download-decrypt-toc',
    archive: ARCHIVE, encryptedSha256: HASH, decryptedSha256: dumpHash,
    encryptedBytes: SIZE, ...summary, databaseRestored: false,
    tocInputEarlyClose, source: recheck ? 'verified-existing-b2-copy' : 'b2-download',
    plaintextFileCreated: false, productionDatabaseConnected: false }, null, 2) + '\n');
  process.stdout.write('BACKUP_DECRYPT_AND_TOC_OK tables=' + summary.publicTables + '\nDATABASE_RESTORE_NOT_RUN\n');
}
function main(args) {
  if (args.length === 1 && args[0] === '--self-hash') {
    process.stdout.write(sha(fs.readFileSync(__filename)) + '\n'); return;
  }
  if (args.length === 1 && args[0] === '--preflight') {
    preflight(); process.stdout.write('BACKUP_PREPARE_PREFLIGHT_OK\n'); return;
  }
  check(process.platform === 'linux' && process.getuid() === 0, 'PREPARE_ROOT_REQUIRED');
  process.umask(0o077);
  check((args.length === 2 && ['--run', '--recheck'].includes(args[0])) ||
    (args.length === 3 && ['--protected', '--protected-recheck'].includes(args[0])), 'PREPARE_USAGE');
  const wanted = args.at(-1);
  check(/^[a-f0-9]{64}$/.test(wanted), 'PREPARE_HASH_ARGUMENT');
  const fd = fs.openSync(__filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let bytes;
  try {
    const st = fs.fstatSync(fd);
    check(st.isFile() && st.nlink === 1 && st.size < 128 * 1024, 'PREPARE_SOURCE');
    bytes = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  check(sha(bytes) === wanted, 'PREPARE_HELPER_CHANGED');
  preflight();
  if (args[0].startsWith('--protected')) return prepare(args[1], args[0] === '--protected-recheck');
  protectedPath('/var/lib', true);
  if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { mode: 0o700 });
  check((protectedPath(BASE, true).mode & 0o777) === 0o700, 'PREPARE_BASE_MODE');
  const id = 'run-' + crypto.randomBytes(8).toString('hex'), p = layout(id);
  fs.mkdirSync(p.root, { mode: 0o700 }); writeNew(p.code, bytes);
  process.stdout.write('BACKUP_PREPARE_DIRECTORY ' + p.root + '\n');
  // Root-owned immutable-for-admin copy, clean env; no shell sourcing or DB client configuration.
  const result = cp.spawnSync('/usr/bin/prlimit', ['--core=0', '--fsize=8388608', '--',
    '/usr/bin/node', '--max-old-space-size=128', p.code,
    args[0] === '--recheck' ? '--protected-recheck' : '--protected', id, wanted],
  { env: ENV, stdio: 'inherit', timeout: 300000 });
  check(!result.error && result.status === 0, 'PREPARE_CHILD_FAILED');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) {
    const code = /^PREPARE_[A-Z_]+$/.test(e.message) ? e.message : 'PREPARE_IO_FAILED';
    process.stderr.write('BACKUP_PREPARE_FAILED ' + code + '\n'); process.exitCode = 1;
  }
}
module.exports = { credentials, layout, downloadSpec, decryptArgs, tocSummary, tocOutput };
