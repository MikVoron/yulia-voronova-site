'use strict';

// Reusable filesystem primitives. The caller must hold an OS lock for every write.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sha256 } = require('./protocol.cjs');
function check(ok, code) { if (!ok) throw new Error(code); }
function beneath(base, relative) {
  check(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') &&
    relative.split('/').every(p => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(p) && p !== '..'), 'UNSAFE_RELATIVE_PATH');
  const resolved = path.resolve(base, relative);
  check(resolved.startsWith(path.resolve(base) + path.sep), 'OUTSIDE_ROOT');
  return resolved;
}
function protectedPath(input, directory = false) {
  const absolute = path.resolve(input);
  let cursor = path.parse(absolute).root;
  for (const piece of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, piece);
    const st = fs.lstatSync(cursor);
    check(!st.isSymbolicLink() && st.uid === 0 && (st.mode & 0o022) === 0, 'UNTRUSTED_PATH');
  }
  const st = fs.lstatSync(absolute);
  check(directory ? st.isDirectory() : st.isFile() && st.nlink === 1, 'WRONG_FILE_TYPE');
  return absolute;
}
function syncDir(dir) {
  const fd = fs.openSync(dir, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function atomicWrite(filename, bytes, mode = 0o600) {
  const parent = path.dirname(filename);
  let st;
  try { st = fs.lstatSync(filename); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st) {
    check(st.isFile() && !st.isSymbolicLink() && st.nlink === 1, 'UNSAFE_WRITE_TARGET');
  }
  const temp = path.join(parent, '.write-' + crypto.randomBytes(12).toString('hex'));
  const fd = fs.openSync(temp, 'wx', mode);
  try { fs.fchmodSync(fd, mode); fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  // A failed rename leaves a private .write-* artifact for diagnosis, never deletes data.
  fs.renameSync(temp, filename);
  syncDir(parent);
}
function atomicJson(filename, value) { atomicWrite(filename, JSON.stringify(value, null, 2) + '\n'); }
function inventory(root) {
  const entries = [];
  let bytes = 0;
  function walk(dir, prefix) {
    check(entries.length < 1000 && prefix.split('/').length <= 16, 'TREE_LIMIT');
    const st = fs.lstatSync(dir);
    check(st.isDirectory() && !st.isSymbolicLink(), 'TREE_DIRECTORY');
    entries.push({ path: prefix || '.', type: 'directory', mode: st.mode & 0o777, uid: st.uid, gid: st.gid });
    for (const name of fs.readdirSync(dir).sort()) {
      const relative = prefix ? prefix + '/' + name : name;
      const full = beneath(root, relative), s = fs.lstatSync(full);
      check(!s.isSymbolicLink(), 'TREE_SYMLINK');
      if (s.isDirectory()) walk(full, relative);
      else {
        check(s.isFile() && s.nlink === 1 && s.size <= 1024 * 1024, 'TREE_FILE');
        bytes += s.size;
        check(bytes <= 16 * 1024 * 1024 && entries.length < 1000, 'TREE_LIMIT');
        entries.push({ path: relative, type: 'file', mode: s.mode & 0o777,
          uid: s.uid, gid: s.gid, sha256: sha256(fs.readFileSync(full)) });
      }
    }
  }
  walk(root, '');
  return entries;
}
function verifyTree(root, expected) { check(JSON.stringify(inventory(root)) === JSON.stringify(expected), 'TREE_INTEGRITY'); }
function copyVerified(source, destination, expected) {
  verifyTree(source, expected);
  check(!fs.existsSync(destination), 'COPY_TARGET_EXISTS');
  for (const entry of expected) {
    const target = entry.path === '.' ? destination : beneath(destination, entry.path);
    if (entry.type === 'directory') fs.mkdirSync(target, { mode: entry.mode });
    else {
      fs.copyFileSync(beneath(source, entry.path), target, fs.constants.COPYFILE_EXCL);
    }
    fs.chmodSync(target, entry.mode);
    if (process.platform === 'linux' && process.getuid() === 0) fs.chownSync(target, entry.uid, entry.gid);
    if (entry.type === 'file') {
      const fd = fs.openSync(target, 'r');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
  }
  for (const entry of expected.filter(e => e.type === 'directory').reverse()) {
    syncDir(entry.path === '.' ? destination : beneath(destination, entry.path));
  }
  syncDir(path.dirname(destination));
  verifyTree(destination, expected);
}
module.exports = { check, beneath, protectedPath, syncDir, atomicWrite, atomicJson, inventory, verifyTree, copyVerified };
