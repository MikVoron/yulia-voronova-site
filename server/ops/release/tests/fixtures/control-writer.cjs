'use strict';
// Test-only worker. Parent holds flock --close until this process exits.
// All evidence is synthetic; NO systemd, PM2, application or production access.
const fs = require('node:fs');
const path = require('node:path');
const control = require('../../control-envelope.cjs');
const { atomicJson } = require('../../linux-storage.cjs');
const { manifest } = require('./control-values.cjs');
function check(ok, code) { if (!ok) throw new Error(code); }
function main(args) {
  check(process.platform === 'linux', 'TEST_LINUX_ONLY');
  check(args.length === 3, 'TEST_ARGS');
  const [root, operation, encoded] = args;
  check(/^\/tmp\/sp-control-test-[a-zA-Z0-9]{6}$/.test(root) && fs.realpathSync(root) === root, 'TEST_ROOT');
  const directory = fs.lstatSync(root);
  check(directory.isDirectory() && directory.uid === process.getuid() && (directory.mode & 0o777) === 0o700, 'TEST_OWNER');
  const filename = path.join(root, 'control.json');
  const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  let next;
  if (operation === 'init') {
    check(!fs.existsSync(filename), 'TEST_ALREADY_INITIALIZED');
    next = control.create(manifest());
  } else {
    check(operation === 'update', 'TEST_OPERATION');
    const st = fs.lstatSync(filename);
    check(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.uid === process.getuid() &&
      (st.mode & 0o777) === 0o600 && st.size <= 16384, 'TEST_CONTROL_FILE');
    const value = control.validate(JSON.parse(fs.readFileSync(filename, 'utf8')));
    next = control.update(value, payload.request);
  }
  const fault = payload.fault;
  check([undefined, 'partial-temp', 'file-sync', 'before-rename', 'after-rename', 'dir-sync',
    'file-sync-error', 'dir-sync-error'].includes(fault), 'TEST_FAULT');
  const kill = () => process.kill(process.pid, 'SIGKILL');
  const originalWrite = fs.writeFileSync, originalSync = fs.fsyncSync, originalRename = fs.renameSync;
  // Inject faults INSIDE the existing real atomicJson writer, not a reimplementation.
  fs.writeFileSync = function(fd, bytes, ...rest) {
    if (fault === 'partial-temp' && typeof fd === 'number') {
      originalWrite.call(fs, fd, bytes.slice(0, Math.floor(bytes.length / 2)), ...rest); kill();
    }
    return originalWrite.call(fs, fd, bytes, ...rest);
  };
  fs.fsyncSync = function(fd) {
    const type = fs.fstatSync(fd).isDirectory() ? 'dir' : 'file';
    if (fault === type + '-sync-error') throw new Error('TEST_FSYNC_FAILED');
    const result = originalSync.call(fs, fd);
    if (fault === type + '-sync') kill();
    return result;
  };
  fs.renameSync = function(source, target) {
    if (target === filename && fault === 'before-rename') kill();
    const result = originalRename.call(fs, source, target);
    if (target === filename && fault === 'after-rename') kill();
    return result;
  };
  atomicJson(filename, next);
  process.stdout.write('CONTROL_WRITE_OK\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write((error.code || error.message) + '\n'); process.exitCode = 1; }
}
