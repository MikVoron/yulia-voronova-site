'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { credentials, layout, downloadSpec, decryptArgs, tocSummary, tocOutput } = require('../prepare.cjs');
const id = 'run-0123456789abcdef';
test('credentials accept literal assignments only and never evaluate shell code', () => {
  const keys = credentials('# comment\nexport B2_KEY_ID="key000000"\nB2_APP_KEY=\'secret+/0000=\'\n');
  assert.equal(keys.B2_KEY_ID, 'key000000'); assert.equal(keys.B2_APP_KEY, 'secret+/0000=');
  for (const raw of ['B2_KEY_ID=$(id)', 'B2_KEY_ID=`id`', 'source /etc/environment',
    'B2_KEY_ID=key000000\nB2_APP_KEY=secret000\nB2_KEY_ID=other000',
    'B2_KEY_ID=key000000\nB2_APP_KEY=secret000\nB2_ENDPOINT=https://evil.invalid',
    'B2_KEY_ID=key000000\nB2_APP_KEY="${SECRET}"', 'HOME=/root']) {
    assert.throws(() => credentials(raw), /^Error: PREPARE_(CREDENTIAL_FORMAT|ENDPOINT)$/);
  }
});
test('run identity cannot target arbitrary paths', () => {
  for (const bad of ['../x', '/root', id + '/x', 'run-1234', null]) assert.throws(() => layout(bad), /RUN_ID/);
  assert.equal(layout(id).root, '/var/lib/smartplate-restore-drills/' + id);
});
test('cloud command is a size-bounded GET of one pinned object with fresh environment', () => {
  const spec = downloadSpec(id, { B2_KEY_ID: 'key000000', B2_APP_KEY: 'secret000' });
  assert.equal(spec.file, '/usr/bin/aws'); assert.deepEqual(spec.args.slice(0, 2), ['s3api', 'get-object']);
  assert.equal(spec.args[spec.args.indexOf('--bucket') + 1], 'voronova-backups');
  assert.equal(spec.args[spec.args.indexOf('--key') + 1], 'db/smartplate_db_2026-09-12_03-00.dump.gpg');
  assert.equal(spec.args[spec.args.indexOf('--range') + 1], 'bytes=0-1585086');
  assert.equal(spec.args.at(-1), layout(id).root + '/download.gpg');
  assert.ok(!spec.args.join(' ').includes('secret000'));
  assert.equal(spec.env.AWS_CONFIG_FILE, '/dev/null'); assert.equal(spec.env.AWS_EC2_METADATA_DISABLED, 'true');
  for (const key of ['PGHOST', 'PGDATABASE', 'NODE_OPTIONS', 'HTTP_PROXY']) assert.equal(spec.env[key], undefined);
});
test('TOC summary reports counts, never rows, and rejects absent table data', () => {
  assert.deepEqual(tocSummary('; header\n1; 1259 1 TABLE public example postgres\n2; 0 1 TABLE DATA public example postgres\n'),
    { entries: 2, publicTables: 1, publicTableData: 1 });
  assert.throws(() => tocSummary(''), /TOC_EMPTY/);
  assert.throws(() => tocSummary('1; 1259 1 TABLE public example postgres\n'), /TOC_EMPTY/);
});
test('entrypoint rejects privileged operations without root',
  { skip: process.platform === 'linux' && process.getuid() === 0 }, () => {
    for (const args of [['--run', 'a'.repeat(64)], ['--recheck', 'a'.repeat(64)],
      ['--protected', id, 'a'.repeat(64)], ['--protected-recheck', id, 'a'.repeat(64)], ['--restore']]) {
      const r = cp.spawnSync(process.execPath, [path.join(__dirname, '../prepare.cjs'), ...args], { encoding: 'utf8' });
      assert.equal(r.status, 1); assert.match(r.stderr, /PREPARE_ROOT_REQUIRED/);
    }
  });
test('TOC accepts only successful reader with optional EPIPE, not other command failures', () => {
  const stdout = Buffer.from('synthetic TOC');
  assert.deepEqual(tocOutput({ status: 0, stdout }), { bytes: stdout, earlyClose: false });
  assert.deepEqual(tocOutput({ status: 0, stdout, error: { code: 'EPIPE' } }), { bytes: stdout, earlyClose: true });
  for (const change of [{ status: 1 }, { status: null }, { signal: 'SIGTERM' },
    { error: { code: 'ETIMEDOUT' } }, { error: { code: 'ENOBUFS' } }, { stdout: null }]) {
    assert.throws(() => tocOutput({ status: 0, stdout, error: { code: 'EPIPE' }, ...change }), /PREPARE_TOC/);
  }
});
test('real early-closing reader reproduces EPIPE without losing successful exit',
  { skip: process.platform !== 'linux' }, () => {
    const raw = cp.spawnSync('/usr/bin/head', ['-c', '5'], { input: Buffer.alloc(2000000), timeout: 5000 });
    assert.equal(raw.status, 0); assert.equal(raw.error?.code, 'EPIPE');
    assert.equal(tocOutput(raw).bytes.length, 5); assert.equal(tocOutput(raw).earlyClose, true);
  });
test('real pg_restore --list may close stdin before consuming a large archive body',
  { skip: process.platform !== 'linux' }, () => {
    // Minimal PG16 custom header + empty TOC, then dummy unread body. Never restored.
    // Wire fields follow PostgreSQL REL_16_STABLE WriteHead/WriteInt/WriteStr.
    const integer = n => { const b = Buffer.alloc(5); b.writeUInt32LE(n, 1); return b; };
    const string = s => Buffer.concat([integer(Buffer.byteLength(s)), Buffer.from(s)]);
    const header = Buffer.concat([Buffer.from('PGDMP'), Buffer.from([1, 15, 0, 4, 8, 1, 0]),
      ...[0, 0, 0, 12, 8, 126, 0].map(integer), string('synthetic'), string('16.13'), string('16.13'), integer(0)]);
    const raw = cp.spawnSync('/usr/lib/postgresql/16/bin/pg_restore', ['--list'],
      { input: Buffer.concat([header, Buffer.alloc(2000000)]), timeout: 5000,
        env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
    assert.equal(raw.status, 0, raw.stderr?.toString()); assert.equal(raw.error?.code, 'EPIPE');
    const output = tocOutput(raw);
    assert.match(output.bytes.toString(), /TOC Entries: 0/);
    assert.throws(() => tocSummary(output.bytes.toString()), /TOC_EMPTY/);
  });
test('GPG decrypt uses descriptor and stdout only with no agent on Linux (synthetic bytes)',
  { skip: process.platform !== 'linux' }, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-backup-gpg-test-'));
    fs.chmodSync(root, 0o700); fs.mkdirSync(root + '/gnupg', { mode: 0o700 });
    fs.writeFileSync(root + '/pass', 'synthetic-test-passphrase\n', { mode: 0o600 });
    let fd = fs.openSync(root + '/pass', 'r');
    const stopAgent = () => cp.spawnSync('/usr/bin/gpgconf', ['--homedir', root + '/gnupg', '--kill', 'gpg-agent'],
      { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, timeout: 5000 });
    t.after(() => { if (fd !== undefined) fs.closeSync(fd); stopAgent(); fs.rmSync(root, { recursive: true }); });
    const flags = decryptArgs(root);
    assert.ok(flags.includes('--no-autostart')); assert.ok(!flags.includes('--output'));
    const original = Buffer.from('synthetic bytes only, not a database or user data');
    const encrypted = cp.spawnSync('/usr/bin/gpg', ['--no-options', '--batch', '--no-tty',
      '--pinentry-mode', 'loopback', '--no-symkey-cache', '--homedir', root + '/gnupg',
      '--passphrase-fd', '3', '--symmetric', '--output', root + '/download.gpg'],
    { input: original, stdio: ['pipe', 'pipe', 'pipe', fd], env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
    assert.equal(encrypted.status, 0, encrypted.stderr?.toString());
    assert.equal(stopAgent().status, 0); // Only synthetic encryption may use its private agent.
    fs.closeSync(fd); fd = undefined; // Reopen because the shared descriptor offset advanced.
    fd = fs.openSync(root + '/pass', 'r');
    const decrypted = cp.spawnSync('/usr/bin/gpg', flags,
      { stdio: ['ignore', 'pipe', 'pipe', fd], env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
    assert.equal(decrypted.status, 0, decrypted.stderr?.toString()); assert.deepEqual(decrypted.stdout, original);
  });
