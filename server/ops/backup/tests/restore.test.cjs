'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const c = require('../restore-contract.cjs');
const controller = require('../restore.cjs');
const { databaseCase } = require('../restore-worker.cjs');
const id = 'run-0123456789abcdef';
const hash = 'a'.repeat(64);

test('fixed namespace and modes reject traversal and production names', () => {
  const p = c.layout(id);
  assert.equal(p.socket, '/run/sp-db-0123456789abcdef-fixture/socket');
  for (const bad of ['', '../run-0123456789abcdef', 'run-0123456789ABCDEF', '/var/lib/postgresql'])
    assert.throws(() => c.layout(bad), /RESTORE_RUN_ID/);
  assert.throws(() => c.layout(id, 'production'), /RESTORE_MODE/);
  assert.throws(() => c.connection(p, 'smartplate_db'), /RESTORE_DATABASE_NAME/);
  assert.deepEqual(c.connection(p), ['--host=' + p.socket, '--port=6543',
    '--username=restore_admin', '--dbname=restore_check', '--no-password']);
  assert.equal(c.pgEnv(p).PGHOST, undefined);
  assert.equal(c.pgEnv(p).PGSERVICE, undefined);
});

test('service confines network, data paths, privilege, lifetime, and resources', () => {
  const args = c.unitArgs(id, 'fixture', 'net:[123]');
  for (const flag of ['--wait', '--pipe', '--collect', '--property=DynamicUser=yes',
    '--property=PrivateNetwork=yes', '--property=RestrictAddressFamilies=AF_UNIX',
    '--property=ProtectSystem=strict', '--property=NoNewPrivileges=yes',
    '--property=CapabilityBoundingSet=', '--property=MemoryMax=256M',
    '--property=MemorySwapMax=0', '--property=RuntimeMaxSec=180s',
    '--property=RuntimeDirectoryPreserve=no', '--property=KillMode=control-group']) assert.ok(args.includes(flag), flag);
  const blocked = args.find(x => x.startsWith('--property=InaccessiblePaths='));
  for (const dir of ['/var/lib/postgresql', '/run/postgresql', '/var/www/smartplate-api',
    '/opt/voronova', '/var/lib/smartplate-restore-drills']) assert.ok(blocked.includes(dir));
  assert.ok(args.includes(c.layout(id).code + '/restore-worker.cjs'));
  assert.throws(() => c.unitArgs(id, 'fixture', 'net:[123];shell'), /RESTORE_NET_ID/);
});

test('only exact prior successful TOC evidence is accepted', () => {
  const good = { passed: true, stage: 'download-decrypt-toc', encryptedSha256: c.INPUT.encryptedHash,
    decryptedSha256: c.INPUT.decryptedHash, encryptedBytes: c.INPUT.encryptedBytes,
    entries: 271, publicTables: 32, publicTableData: 32, databaseRestored: false,
    productionDatabaseConnected: false };
  c.validatePrepared(good);
  for (const key of Object.keys(good)) assert.throws(() => c.validatePrepared({ ...good, [key]: null }), /RESTORE_INPUT_RESULT/, key);
});

function goodWorker(mode = 'fixture') {
  return { passed: true, mode, tableCount: mode === 'fixture' ? 2 : 32, totalRows: 4,
    nonemptyTables: 2, invalidIndexes: 0, postgresStopped: true, constraintTest: true,
    inputSha256: c.INPUT.decryptedHash, isolation: { dynamicUid: 62001, networkIsolated: true,
      productionPathsBlocked: true, capabilitiesZero: true } };
}
test('worker evidence fails closed on cleanup, indexes, counts and isolation', () => {
  c.validateWorker(goodWorker(), 'fixture'); c.validateWorker(goodWorker('restore'), 'restore');
  for (const key of ['passed', 'tableCount', 'totalRows', 'postgresStopped', 'invalidIndexes', 'nonemptyTables', 'isolation'])
    assert.throws(() => c.validateWorker({ ...goodWorker(), [key]: null }, 'fixture'));
  for (const key of Object.keys(goodWorker().isolation)) {
    const r = goodWorker(); r.isolation[key] = null;
    assert.throws(() => c.validateWorker(r, 'fixture'));
  }
  assert.throws(() => c.validateWorker({ ...goodWorker(), constraintTest: false }, 'fixture'), /RESTORE_FIXTURE_RESULT/);
  assert.throws(() => c.validateWorker({ ...goodWorker('restore'), inputSha256: hash }, 'restore'), /RESTORE_WORKER_INPUT_HASH/);
});

test('bundle hash covers all three exact files in fixed order', () => {
  const b = controller.bundle();
  assert.deepEqual(Object.keys(b.sources), c.FILES);
  for (const name of c.FILES) assert.equal(b.hashes[name], crypto.createHash('sha256').update(b.sources[name]).digest('hex'));
  assert.equal(b.hash, crypto.createHash('sha256').update(JSON.stringify(b.hashes)).digest('hex'));
});

test('synthetic-only mode is preserved through flock and protected reentry', () => {
  const fixture = controller.lockArgs(id, hash, true), real = controller.lockArgs(id, hash, false);
  assert.ok(fixture.includes('--locked-rehearse')); assert.ok(!fixture.includes('--locked'));
  assert.ok(real.includes('--locked')); assert.ok(!real.includes('--locked-rehearse'));
  assert.deepEqual(fixture.slice(0, 4), ['/usr/bin/flock', '--nonblock', '--close', c.BASE + '/restore.lock']);
  const source = fs.readFileSync(path.join(__dirname, '../restore.cjs'), 'utf8');
  assert.ok(source.indexOf("if (rehearsalOnly) {") < source.indexOf("const pass = '/opt/voronova/.gpg-passphrase'"));
  assert.match(source, /realArchiveRead: false/);
});

test('non-root CLI cannot enter privileged modes', { skip: process.platform === 'linux' && process.getuid() === 0 }, () => {
  for (const args of [['--run', hash], ['--rehearse', hash], ['--locked', id, hash], ['--locked-rehearse', id, hash]]) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '../restore.cjs'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stderr, /RESTORE_ROOT_REQUIRED/);
  }
});

test('public code survives restrictive umask; control data remains private', { skip: process.platform !== 'linux' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-code-mode-'));
  const mask = process.umask(0o077);
  try {
    controller.publicDirectory(dir + '/code');
    controller.write(dir + '/code/helper.cjs', '// fixture', 0o644);
    controller.write(dir + '/private.json', '{}');
    assert.equal(fs.statSync(dir + '/code').mode & 0o777, 0o755);
    assert.equal(fs.statSync(dir + '/code/helper.cjs').mode & 0o777, 0o644);
    assert.equal(fs.statSync(dir + '/private.json').mode & 0o777, 0o600);
  } finally { process.umask(mask); fs.rmSync(dir, { recursive: true }); }
});

test('database runner rejects broad or escaped paths before any PostgreSQL command', () => {
  assert.throws(() => databaseCase({ runtime: '/var/lib/postgresql' }, 'fixture', Buffer.alloc(0)), /RESTORE_CASE_PATH/);
  assert.throws(() => databaseCase({ runtime: '/tmp/sp-db-test-good/../escape' }, 'fixture', Buffer.alloc(0)), /RESTORE_CASE_PATH/);
});

test('real PostgreSQL synthetic dump/restore with own socket and cleanup (no systemd claim)', {
  skip: process.platform !== 'linux' || process.getuid() === 0 || !fs.existsSync(c.PG + 'initdb')
}, () => {
  const runtime = fs.mkdtempSync('/tmp/sp-db-test-');
  fs.chmodSync(runtime, 0o700);
  const p = { runtime, data: runtime + '/data', socket: runtime + '/socket', dump: runtime + '/input.dump' };
  try {
    const r = databaseCase(p, 'fixture', Buffer.alloc(0));
    assert.equal(r.tableCount, 2); assert.equal(r.totalRows, 4); assert.equal(r.invalidIndexes, 0);
    assert.equal(r.constraintTest, true); assert.equal(r.postgresStopped, true);
  } finally {
    if (fs.existsSync(p.data + '/postmaster.pid')) {
      const stopped = cp.spawnSync(c.PG + 'pg_ctl', ['--pgdata=' + p.data, '--wait', '--timeout=15', '--mode=fast', 'stop'],
        { env: c.pgEnv(p), timeout: 20000 });
      assert.equal(stopped.status, 0, 'own test PostgreSQL cleanup failed');
    }
    assert.ok(!fs.existsSync(p.data + '/postmaster.pid'));
    assert.match(runtime, /^\/tmp\/sp-db-test-[A-Za-z0-9]+$/);
    assert.equal(fs.realpathSync(runtime), runtime);
    fs.rmSync(runtime, { recursive: true });
    assert.ok(!fs.existsSync(runtime));
  }
});
