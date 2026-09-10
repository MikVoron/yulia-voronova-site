#!/usr/bin/env node
'use strict';

// Intentionally only a read-only planner. Never dispatch commands from a manifest.
const fs = require('node:fs');
const path = require('node:path');
const { FILES, validateCandidate, preview } = require('./protocol.cjs');
function readRegular(input, limit) {
  const absolute = path.resolve(input);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('SYMLINK_REJECTED');
  }
  const before = fs.lstatSync(absolute);
  if (!before.isFile() || before.size > limit) throw new Error('FILE_TYPE_OR_SIZE');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const current = fs.fstatSync(fd);
    if (!current.isFile() || current.ino !== before.ino || current.dev !== before.dev || current.size > limit)
      throw new Error('FILE_CHANGED');
    const bytes = Buffer.alloc(limit + 1);
    let size = 0, count;
    while (size <= limit && (count = fs.readSync(fd, bytes, size, bytes.length - size, null)) > 0) size += count;
    if (size > limit) throw new Error('FILE_TYPE_OR_SIZE');
    return bytes.subarray(0, size);
  } finally { fs.closeSync(fd); }
}
function main(args) {
  if (args.length !== 3 || args[0] !== '--plan') throw new Error('USAGE: node plan.cjs --plan MANIFEST_JSON BUNDLE_DIRECTORY; production execution unavailable');
  const manifest = JSON.parse(readRegular(args[1], 65536).toString('utf8'));
  const bytes = Object.fromEntries(FILES.map(name => [name, readRegular(path.join(args[2], name), 8 * 1024 * 1024)]));
  return preview(validateCandidate(manifest, bytes));
}
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n'); }
  catch (e) { process.stderr.write('RELEASE_PLAN_REJECTED: ' + (e.code || e.message) + '\n'); process.exitCode = 1; }
}
module.exports = { main, readRegular };
