'use strict';

// Artificial service: no imports from SmartPlate, npm, database, secrets or PM2.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const [root, token] = process.argv.slice(2);
if (process.platform !== 'linux' || process.getuid() !== 997 || process.getgid() !== 997 ||
    !/^\/var\/lib\/smartplate-release-rehearsals\/run-[a-f0-9]{16}\/case-[0-9]{2}$/.test(root) ||
    !/^[a-f0-9]{32}$/.test(token || '')) throw new Error('FIXTURE_ONLY');
const modulePath = path.join(root, 'live/node_modules/release-fixture/index.cjs');
const version = require(modulePath).version;
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url !== '/health') { res.statusCode = 404; res.end('{}'); return; }
  res.end(JSON.stringify({ fixture: true, token, version, pid: process.pid, uid: process.getuid(), gid: process.getgid() }));
});
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(path.join(root, 'runtime/ready.json'), JSON.stringify({ port: server.address().port, token }), { mode: 0o600 });
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
