'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { fork } = require('node:child_process');

const MAX_INPUT = 20 * 1024 * 1024;
const MAX_PIXELS = 50 * 1000 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enabled = () => process.env.REVIEW_PHOTOS_ENABLED === '1';
function root() {
  const value = process.env.REVIEW_PHOTOS_DIR;
  if (!value || !path.isAbsolute(value)) throw new Error('REVIEW_PHOTOS_DIR must be an absolute private directory');
  const resolved = path.resolve(value);
  // Never default to a directory served with the platform or inside this repository.
  const repository = path.resolve(__dirname, '../..');
  if (resolved === repository || resolved.startsWith(repository + path.sep)) throw new Error('Photo storage must be outside the application directory');
  return resolved;
}
function directory(id) {
  if (!UUID.test(id)) throw new Error('Invalid photo id');
  return path.join(root(), id.toLowerCase());
}
async function prepare() {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root());
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Photo storage must be a real directory');
  await fs.access(root(), fs.constants.R_OK | fs.constants.W_OK);
}
async function hasSpace() {
  const stat = await fs.statfs(root());
  return stat.bavail * stat.bsize >= 512 * 1024 * 1024;
}
async function write(id, photo) {
  const dir = directory(id);
  await fs.mkdir(dir, { mode: 0o700 });
  await fs.writeFile(path.join(dir, 'main.webp'), photo.main, { flag: 'wx', mode: 0o600 });
  await fs.writeFile(path.join(dir, 'thumb.webp'), photo.thumb, { flag: 'wx', mode: 0o600 });
}
async function read(id, variant) {
  if (!['main', 'thumb'].includes(variant)) throw new Error('Invalid photo variant');
  return fs.readFile(path.join(directory(id), variant + '.webp'));
}
async function remove(id) {
  // Only application-generated UUID directories and the two known derivatives.
  const dir = directory(id);
  for (const file of ['main.webp', 'thumb.webp']) await fs.unlink(path.join(dir, file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await fs.rmdir(dir).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
function processImage(input) {
  return new Promise((resolve, reject) => {
    const worker = fork(path.join(__dirname, 'review-photo-worker.js'), [], {
      serialization: 'advanced', execArgv: ['--max-old-space-size=192'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.kill();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(Object.assign(new Error('Не удалось обработать фото за отведённое время. Попробуйте другой снимок.'), { statusCode: 422 })), 30000);
    worker.once('error', error => finish(error));
    worker.once('exit', () => finish(Object.assign(new Error('Не удалось обработать фото. Попробуйте другой снимок.'), { statusCode: 422 })));
    worker.once('message', result => result.error
      ? finish(Object.assign(new Error(result.error), { statusCode: 422 }))
      : finish(null, result));
    worker.send({ input, maxPixels: MAX_PIXELS });
  });
}
module.exports = { enabled, root, prepare, hasSpace, write, read, remove, processImage, MAX_INPUT, UUID };
