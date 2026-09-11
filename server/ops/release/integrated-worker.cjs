'use strict';
// UID 997 fixture only. No SmartPlate imports, .env, database or outbound requests.
const fs = require('node:fs');
const http = require('node:http');
const { layout, check } = require('./integrated-contract.cjs');
const { atomicJson } = require('./linux-storage.cjs');
const [id, name, token, role, version] = process.argv.slice(2);
const p = layout(id, name), probe = role === 'probe';
check(process.platform === 'linux' && process.getuid() === 997 && process.getgid() === 997, 'INTEGRATED_WORKER_IDS');
check(/^[a-f0-9]{32}$/.test(token) && ['app', 'sentinel', 'probe'].includes(role), 'INTEGRATED_WORKER_ARGS');
check(fs.realpathSync(__filename) === p.code + '/integrated-worker.cjs', 'INTEGRATED_WORKER_COPY');
check(['old', 'new', 'stable'].includes(version), 'INTEGRATED_WORKER_VERSION');
const expected = probe ? p.candidate : role === 'app' ? p.live : p.stable;
check(process.cwd() === expected, 'INTEGRATED_WORKER_CWD');
const status = fs.readFileSync('/proc/self/status', 'utf8');
for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) {
  check(new RegExp('^' + field + ':\\s+0+$', 'm').test(status), 'INTEGRATED_WORKER_CAPS');
}
const moduleValue = require(expected + '/node_modules/release-fixture/index.cjs');
check(moduleValue.version === version, 'INTEGRATED_WORKER_MODULE');
if (probe) {
  check(version === 'new', 'INTEGRATED_PROBE_VERSION');
  process.stdout.write('INTEGRATED_CANDIDATE_UID997_OK\n');
} else {
  check(process.env.SP_IR_TOKEN === token && process.env.SP_IR_VERSION === version, 'INTEGRATED_WORKER_ENV');
  const body = { fixture: true, token, role, version, pid: process.pid, uid: 997, gid: 997 };
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify(body));
    if (req.url === '/catalog') return res.end(JSON.stringify({ fixture: true, public: ['sample'], privateDetails: null }));
    if (req.url === '/private') { res.statusCode = 401; return res.end('{}'); }
    if (req.url === '/sitemap.xml') { res.setHeader('Content-Type', 'application/xml'); return res.end('<urlset/>'); }
    res.statusCode = 404; res.end('{}');
  });
  server.listen(0, '127.0.0.1', () => atomicJson(p.runtime + '/' + role + '.json', { ...body, port: server.address().port }));
  setTimeout(() => process.exit(1), 150000);
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}
