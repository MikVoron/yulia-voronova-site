'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const control = require('../control-envelope.cjs');
const { clock, request } = require('./fixtures/control-values.cjs');
const linux = process.platform === 'linux';
const options = { skip: !linux, timeout: 20000 };
const worker = path.join(__dirname, 'fixtures/control-writer.cjs');
function fixture(t) {
  const root = fs.mkdtempSync('/tmp/sp-control-test-'); fs.chmodSync(root, 0o700);
  // Preserve both successful and failed tiny fixtures for independent inspection.
  t.diagnostic('CONTROL_TEST_DIRECTORY ' + root);
  return root;
}
function args(root, operation, payload = {}) {
  return ['--exclusive', '--close', '--timeout', '5', root + '/release.lock', process.execPath,
    worker, root, operation, Buffer.from(JSON.stringify(payload)).toString('base64')];
}
function invoke(root, operation, payload) {
  return cp.spawnSync('/usr/bin/flock', args(root, operation, payload),
    { encoding: 'utf8', timeout: 8000, env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
}
function read(root) { return control.validate(JSON.parse(fs.readFileSync(root + '/control.json', 'utf8'))); }
function good(result) {
  assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /CONTROL_WRITE_OK/);
}
function init(root, phase = 'prepared') {
  good(invoke(root, 'init'));
  for (const action of ['intend-arm', 'arm', 'switch', 'pending', 'confirm', 'commit']) {
    if ((phase === 'arming' && read(root).stage === 'arming') || read(root).state.phase === phase) break;
    good(invoke(root, 'update', { request: request(read(root), action) }));
  }
  return read(root);
}
function asyncInvoke(root, command) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn('/usr/bin/flock', args(root, 'update', { request: command }),
      { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, timeout: 8000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('SIGKILL during real atomic writes leaves one complete state/recovery pair and releases flock', options, t => {
  for (const fault of ['partial-temp', 'file-sync', 'before-rename', 'after-rename', 'dir-sync']) {
    const root = fixture(t), before = init(root, 'arming');
    const command = request(before, 'arm', clock(1000));
    const killed = invoke(root, 'update', { request: command, fault });
    assert.equal(killed.status, 137, killed.stderr);
    assert.doesNotMatch(killed.stdout, /CONTROL_WRITE_OK/);
    const after = read(root), renamed = ['after-rename', 'dir-sync'].includes(fault);
    assert.deepEqual(after, renamed ? control.update(before, command) : before);
    assert.equal(fs.statSync(root + '/control.json').mode & 0o777, 0o600);
    assert.equal(control.decision(after, clock(1001)), renamed ? 'continue' : 'cancel-arm');
    // New process acquires the same lock and rereads the committed value.
    good(invoke(root, 'update', { request: request(after, renamed ? 'rollback' : 'cancel-arm', clock(1001)) }));
    assert.equal(read(root).stage, renamed ? 'active' : 'cancelled');
  }
});

test('fsync errors never report success, including a visible rename whose durability is unknown', options, t => {
  for (const fault of ['file-sync-error', 'dir-sync-error']) {
    const root = fixture(t), before = init(root, 'arming');
    const result = invoke(root, 'update', { request: request(before, 'arm'), fault });
    assert.equal(result.status, 1); assert.match(result.stderr, /TEST_FSYNC_FAILED/);
    assert.doesNotMatch(result.stdout, /CONTROL_WRITE_OK/);
    assert.equal(read(root).stage, fault === 'file-sync-error' ? 'arming' : 'active');
  }
});

test('two controllers with the same generation have exactly one winner under real flock', options, async t => {
  const root = fixture(t), before = init(root, 'arming');
  const outcomes = await Promise.all([asyncInvoke(root, request(before, 'arm')),
    asyncInvoke(root, request(before, 'cancel-arm'))]);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [0, 1]);
  assert.match(outcomes.find(x => x.status === 1).stderr, /CONTROL_STALE_GENERATION/);
  assert.equal(read(root).generation, before.generation + 1);
  assert.ok(['active', 'cancelled'].includes(read(root).stage));
});

test('terminal commit versus rollback has one winner and the loser cannot overwrite its pair', options, async t => {
  const root = fixture(t), before = init(root, 'confirming');
  const outcomes = await Promise.all([asyncInvoke(root, request(before, 'commit')),
    asyncInvoke(root, request(before, 'rollback'))]);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [0, 1]);
  assert.match(outcomes.find(x => x.status === 1).stderr, /CONTROL_STALE_GENERATION/);
  assert.ok(['confirmed', 'rolling_back'].includes(read(root).state.phase));
  assert.deepEqual(read(root).recovery, before.recovery);
});

test('crashes around durable cancellation and terminal commit preserve repeatable cleanup', options, t => {
  for (const [phase, action] of [['arming', 'cancel-arm'], ['confirming', 'commit']]) {
    for (const fault of ['before-rename', 'after-rename']) {
      const root = fixture(t), before = init(root, phase);
      const command = request(before, action);
      assert.equal(invoke(root, 'update', { request: command, fault }).status, 137);
      assert.deepEqual(read(root), fault === 'before-rename' ? before : control.update(before, command));
      if (fault === 'before-rename') {
        good(invoke(root, 'update', { request: request(read(root), phase === 'arming' ? 'cancel-arm' : 'rollback') }));
        if (phase !== 'arming') good(invoke(root, 'update', { request: request(read(root), 'restored') }));
      }
      const current = read(root), cleanup = current.stage === 'cancelled' ? 'cancel-cleanup' : 'cleanup';
      assert.equal(control.decision(current, null), cleanup);
      good(invoke(root, 'update', { request: request(current, cleanup) }));
      const cleaned = read(root);
      good(invoke(root, 'update', { request: request(cleaned, cleanup) }));
      assert.deepEqual(read(root), cleaned);
      assert.equal(control.decision(cleaned, null), 'idle');
    }
  }
});

test('corrupt or missing control files are refused rather than recreated as a fresh release', options, t => {
  const root = fixture(t), before = init(root, 'arming'), command = request(before, 'arm');
  for (const damaged of ['{', JSON.stringify({ ...before, recovery: null })]) {
    fs.writeFileSync(root + '/control.json', damaged);
    const result = invoke(root, 'update', { request: command });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout, /CONTROL_WRITE_OK/);
    assert.equal(fs.readFileSync(root + '/control.json', 'utf8'), damaged);
  }
  fs.unlinkSync(root + '/control.json');
  const result = invoke(root, 'update', { request: command });
  assert.equal(result.status, 1); assert.match(result.stderr, /ENOENT/);
  assert.equal(fs.existsSync(root + '/control.json'), false);
});

test('fixture writer rejects linked or permissive state files without modifying their targets', options, t => {
  for (const kind of ['symlink', 'hardlink', 'mode']) {
    const root = fixture(t), before = init(root, 'arming');
    const file = root + '/control.json', target = root + '/saved.json';
    fs.renameSync(file, target); const bytes = fs.readFileSync(target);
    if (kind === 'symlink') fs.symlinkSync(target, file);
    if (kind === 'hardlink') fs.linkSync(target, file);
    if (kind === 'mode') { fs.copyFileSync(target, file); fs.chmodSync(file, 0o644); }
    const result = invoke(root, 'update', { request: request(before, 'arm') });
    assert.equal(result.status, 1); assert.match(result.stderr, /TEST_CONTROL_FILE/);
    assert.deepEqual(fs.readFileSync(target), bytes);
  }
});
