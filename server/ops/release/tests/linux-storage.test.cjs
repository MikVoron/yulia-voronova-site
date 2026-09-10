'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { beneath, atomicWrite, atomicJson, inventory, verifyTree, copyVerified, protectedPath } = require('../linux-storage.cjs');
const linux = process.platform === 'linux';
const options = { skip: !linux };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-storage-test-'));
  // Only the exact mkdtemp-created test directory; never production or a workspace.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function tree(root) {
  fs.mkdirSync(root, { mode: 0o755 }); fs.chmodSync(root, 0o755);
  fs.mkdirSync(root + '/modules', { mode: 0o750 }); fs.chmodSync(root + '/modules', 0o750);
  atomicWrite(root + '/package.json', '{"version":"old"}', 0o640);
  atomicWrite(root + '/modules/test.cjs', 'module.exports=42;', 0o644);
}
test('relative paths cannot escape the selected root', () => {
  for (const value of ['', '.', '..', '../outside', '/var/www', 'a/../../b', 'a//b', 'a\\b']) {
    assert.throws(() => beneath('/fixture', value));
  }
  assert.equal(beneath(path.resolve('fixture'), 'a/b.cjs'), path.resolve('fixture/a/b.cjs'));
});
test('atomic JSON replaces complete values and forces private permissions', options, t => {
  const root = fixture(t), file = root + '/state.json';
  atomicJson(file, { phase: 'prepared', revision: 0 });
  atomicJson(file, { phase: 'armed', revision: 1 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { phase: 'armed', revision: 1 });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(root), ['state.json']);
});
test('atomic writes reject symlinks including dangling links and hardlinks', options, t => {
  const root = fixture(t), target = root + '/real';
  fs.writeFileSync(target, 'unchanged');
  fs.symlinkSync(target, root + '/link');
  fs.symlinkSync(root + '/missing', root + '/dangling');
  fs.linkSync(target, root + '/hard');
  for (const file of ['link', 'dangling', 'hard']) assert.throws(() => atomicWrite(root + '/' + file, 'wrong'), /UNSAFE_WRITE_TARGET/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'unchanged');
});
test('offline copy verifies all bytes, owners and modes with restrictive umask', options, t => {
  const root = fixture(t); tree(root + '/source');
  const expected = inventory(root + '/source'), mask = process.umask(0o077);
  try { copyVerified(root + '/source', root + '/backup', expected); }
  finally { process.umask(mask); }
  assert.deepEqual(inventory(root + '/backup'), expected);
  assert.throws(() => copyVerified(root + '/source', root + '/backup', expected), /COPY_TARGET_EXISTS/);
  assert.equal(require(root + '/backup/modules/test.cjs'), 42);
});
test('corruption or a missing file is refused before creating a restore directory', options, t => {
  const root = fixture(t); tree(root + '/source');
  const expected = inventory(root + '/source');
  atomicWrite(root + '/source/package.json', 'damaged', 0o640);
  assert.throws(() => copyVerified(root + '/source', root + '/restore', expected), /TREE_INTEGRITY/);
  assert.equal(fs.existsSync(root + '/restore'), false);
  fs.unlinkSync(root + '/source/package.json');
  assert.throws(() => verifyTree(root + '/source', expected), /TREE_INTEGRITY/);
});
test('tree refuses symlinks, hardlinks and oversized files', options, t => {
  const root = fixture(t); tree(root + '/source');
  fs.symlinkSync('/var/www', root + '/source/link');
  assert.throws(() => inventory(root + '/source'), /TREE_SYMLINK/);
  fs.unlinkSync(root + '/source/link');
  fs.linkSync(root + '/source/package.json', root + '/source/hard');
  assert.throws(() => inventory(root + '/source'), /TREE_FILE/);
  fs.unlinkSync(root + '/source/hard');
  fs.writeFileSync(root + '/source/large', Buffer.alloc(1024 * 1024 + 1));
  assert.throws(() => inventory(root + '/source'), /TREE_FILE/);
});
test('protected path rejects a writable ancestor even for a regular file', options, t => {
  const root = fixture(t); fs.writeFileSync(root + '/file', 'test');
  assert.throws(() => protectedPath(root + '/file'), /UNTRUSTED_PATH/);
});
test('flock reports the deliberately killed child without killing the caller', options, t => {
  const root = fixture(t);
  const result = cp.spawnSync('/usr/bin/flock', ['--exclusive', '--close', root + '/lock',
    process.execPath, '-e', "process.kill(process.pid,'SIGKILL')"], { timeout: 5000 });
  assert.equal(result.status, 137);
  const retry = cp.spawnSync('/usr/bin/flock', ['--nonblock', root + '/lock', '/usr/bin/true'], { timeout: 5000 });
  assert.equal(retry.status, 0);
});
test('fixture CLI refuses non-root execution before creating any server directories', { skip: linux && process.getuid() === 0 }, () => {
  const result = cp.spawnSync(process.execPath, [path.join(__dirname, '../linux-rehearsal.cjs'), '--run'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /LINUX_ROOT_REQUIRED/);
});
