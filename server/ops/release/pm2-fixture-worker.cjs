'use strict';

// Tiny HTTP fixture. Never imports SmartPlate or opens a database.
const fs = require('node:fs');
const http = require('node:http');
const { context, definition, check } = require('./pm2-sandbox.cjs');
const { atomicJson } = require('./linux-storage.cjs');
const [root, role, version, token] = process.argv.slice(2);
check(process.platform === 'linux' && process.getuid() === 1000 && process.getgid() === 1000,
  'PM2_FIXTURE_UID_REQUIRED');
const p = context(root, token), spec = definition(root, token, role, version);
check(fs.realpathSync(__filename) === spec.script && process.cwd() === p.work, 'PM2_FIXTURE_LOCATION');
for (const [key, value] of Object.entries(spec.env)) check(process.env[key] === value, 'PM2_FIXTURE_ENV');
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/health') { res.statusCode = 404; res.end('{}'); return; }
  res.end(JSON.stringify({ fixture: true, role, version, token, setting: process.env.SP_PM2_SETTING,
    pid: process.pid, uid: process.getuid(), gid: process.getgid() }));
});
server.listen(0, '127.0.0.1', () => {
  atomicJson(p.runtime + '/' + role + '.json', { port: server.address().port, token, pid: process.pid });
});
// Independent bounds in addition to the enclosing user service cgroup.
setTimeout(() => process.exit(1), 150000);
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
