'use strict';
// Build only committed, explicitly named blobs. No secrets are read or packaged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const observationPath = process.argv[2];
const output = path.resolve(process.argv[3] || '');
if (!observationPath || !process.argv[3]) throw Error('Usage: node build-oauth-production-package.cjs observation.json output-directory');
const observation = JSON.parse(fs.readFileSync(observationPath, 'utf8').replace(/^\uFEFF/, ''));
const targets = {
  'server/nginx/plate.voronova.online': '/etc/nginx/sites-available/plate.voronova.online',
  'server/src/oauth-accounts.js': '/var/www/smartplate-api/src/oauth-accounts.js',
  'server/src/routes/oauth.js': '/var/www/smartplate-api/src/routes/oauth.js',
  'platform/oauth-login.css': '/var/www/smartplate-platform/oauth-login.css',
  'platform/vendor/vkid/LICENSE': '/var/www/smartplate-platform/vendor/vkid/LICENSE',
  'platform/vendor/vkid/sdk-2.6.1.js': '/var/www/smartplate-platform/vendor/vkid/sdk-2.6.1.js',
  'platform/oauth-login.js': '/var/www/smartplate-platform/oauth-login.js',
  'platform/vk-one-tap.js': '/var/www/smartplate-platform/vk-one-tap.js',
  'platform/auth-callback.js': '/var/www/smartplate-platform/auth-callback.js',
  'platform/auth-callback.html': '/var/www/smartplate-platform/auth-callback.html',
  'platform/login.html': '/var/www/smartplate-platform/login.html'
};
const git = args => execFileSync('git', args, { cwd: root });
if (git(['status', '--porcelain', '--untracked-files=normal']).toString().trim()) throw Error('Release worktree is not clean');
if (fs.existsSync(output)) throw Error('Output directory already exists');
const commit = git(['rev-parse', 'HEAD']).toString().trim();
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const blob = name => git(['show', commit + ':' + name]);
const installer = blob('scripts/install-oauth-20261031.py');
const files = {};
for (const [name, destination] of Object.entries(targets)) {
  if (!Object.hasOwn(observation.files, destination)) throw Error('Missing target observation: ' + name);
  const body = blob(name);
  if (name.endsWith('sdk-2.6.1.js') && sha(body) !== '0a027e662452af50f47826fb87c0204dc8d116ffce528a4ab4b9715dc7354297') throw Error('Official SDK bytes changed');
  files[name] = { old_sha256: observation.files[destination].sha256, new_sha256: sha(body) };
  const target = path.join(output, 'payload', name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}
const checkpoint = observation.files['/home/smartplate-admin/api-checkpoint-20260909.sh'];
if (!checkpoint || !/^[a-f0-9]{64}$/.test(checkpoint.sha256)) throw Error('Missing reviewed checkpoint helper');
const manifest = { version: 1, commit, installer_sha256: sha(installer), checkpoint_script_sha256: checkpoint.sha256, files };
fs.writeFileSync(path.join(output, 'install.py'), installer);
const encoded = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), encoded);
console.log(JSON.stringify({ marker: 'OAUTH_PACKAGE_BUILT', commit, files: Object.keys(files).length, manifestSha256: sha(encoded), installerSha256: sha(installer), output }));
