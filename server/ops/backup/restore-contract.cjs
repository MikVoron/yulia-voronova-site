'use strict';
const BASE = '/var/lib/smartplate-db-rehearsals';
const PG = '/usr/lib/postgresql/16/bin/';
const ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8' });
const FILES = Object.freeze(['restore-contract.cjs', 'restore-worker.cjs', 'restore.cjs']);
const INPUT = Object.freeze({
  root: '/var/lib/smartplate-restore-drills/run-623e21cd8157fdbf',
  encryptedHash: 'd573ea4f66d9824849360ecacbd509428b5f6a824e711cc2265b54769c3a8a02',
  decryptedHash: '80dff0ba8d012a05d57fe5f525ce6ac89f81a7eee317592a02b3ee2e21f40d5b',
  encryptedBytes: 1585086, tables: 32, entries: 271
});
function check(ok, code) { if (!ok) throw new Error(code); }
function layout(id, mode = 'fixture') {
  check(typeof id === 'string' && /^run-[a-f0-9]{16}$/.test(id), 'RESTORE_RUN_ID');
  check(['fixture', 'restore'].includes(mode), 'RESTORE_MODE');
  const root = BASE + '/' + id, name = 'sp-db-' + id.slice(4) + '-' + mode;
  const runtime = '/run/' + name;
  return { id, mode, root, name, unit: name + '.service', code: root + '/code', runtime,
    data: runtime + '/data', socket: runtime + '/socket', dump: runtime + '/input.dump' };
}
function pgEnv(p) { return { ...ENV, HOME: p.runtime, TMPDIR: p.runtime, PGAPPNAME: 'isolated-backup-restore' }; }
function connection(p, database = 'restore_check') {
  check(['postgres', 'source_fixture', 'restore_check'].includes(database), 'RESTORE_DATABASE_NAME');
  return ['--host=' + p.socket, '--port=6543', '--username=restore_admin', '--dbname=' + database, '--no-password'];
}
function unitArgs(id, mode, hostNet) {
  const p = layout(id, mode);
  check(/^net:\[[0-9]+\]$/.test(hostNet), 'RESTORE_NET_ID');
  const properties = ['Type=exec', 'DynamicUser=yes', 'User=' + p.name,
    'RuntimeDirectory=' + p.name, 'RuntimeDirectoryMode=0700', 'RuntimeDirectoryPreserve=no',
    'WorkingDirectory=' + p.runtime, 'UMask=0077', 'PrivateNetwork=yes', 'PrivateTmp=yes',
    'PrivateDevices=yes', 'ProtectSystem=strict', 'ProtectHome=yes', 'NoNewPrivileges=yes',
    'CapabilityBoundingSet=', 'SupplementaryGroups=', 'RestrictAddressFamilies=AF_UNIX',
    'RestrictNamespaces=yes', 'RestrictSUIDSGID=yes', 'ProtectKernelTunables=yes',
    'ProtectKernelModules=yes', 'ProtectControlGroups=yes', 'LockPersonality=yes',
    'ReadOnlyPaths=/tmp /var/tmp',
    'InaccessiblePaths=/var/lib/postgresql /run/postgresql /var/www/smartplate-api /opt/voronova /var/lib/smartplate-restore-drills',
    'MemoryMax=256M', 'MemorySwapMax=0', 'TasksMax=64', 'CPUQuota=50%', 'Nice=10',
    'LimitCORE=0', 'LimitFSIZE=67108864', 'RuntimeMaxSec=180s', 'TimeoutStopSec=5s',
    'KillMode=control-group', 'Restart=no'];
  return ['--quiet', '--wait', '--pipe', '--collect', '--unit=' + p.unit,
    ...properties.map(x => '--property=' + x), '/usr/bin/env', '-i', 'PATH=' + ENV.PATH,
    'LANG=' + ENV.LANG, '/usr/bin/node', '--max-old-space-size=64',
    p.code + '/restore-worker.cjs', id, mode, hostNet];
}
function validatePrepared(r) {
  check(r?.passed === true && r.stage === 'download-decrypt-toc' &&
    r.encryptedSha256 === INPUT.encryptedHash && r.decryptedSha256 === INPUT.decryptedHash &&
    r.encryptedBytes === INPUT.encryptedBytes && r.entries === INPUT.entries &&
    r.publicTables === INPUT.tables && r.publicTableData === INPUT.tables &&
    r.databaseRestored === false && r.productionDatabaseConnected === false, 'RESTORE_INPUT_RESULT');
}
function validateWorker(r, mode) {
  check(['fixture', 'restore'].includes(mode), 'RESTORE_MODE');
  check(r?.passed === true && r.mode === mode && r.tableCount === (mode === 'fixture' ? 2 : INPUT.tables) &&
    Number.isSafeInteger(r.totalRows) && r.totalRows > 0 && r.postgresStopped === true &&
    r.invalidIndexes === 0 && Number.isSafeInteger(r.nonemptyTables) && r.nonemptyTables > 0 &&
    r.nonemptyTables <= r.tableCount && Number.isSafeInteger(r.isolation?.dynamicUid) &&
    r.isolation.dynamicUid >= 61184 && r.isolation.dynamicUid <= 65519 &&
    r.isolation.networkIsolated === true && r.isolation.productionPathsBlocked === true &&
    r.isolation.capabilitiesZero === true, 'RESTORE_WORKER_RESULT');
  if (mode === 'restore') check(r.inputSha256 === INPUT.decryptedHash, 'RESTORE_WORKER_INPUT_HASH');
  if (mode === 'fixture') check(r.constraintTest === true && r.totalRows === 4, 'RESTORE_FIXTURE_RESULT');
}
module.exports = { BASE, PG, ENV, FILES, INPUT, check, layout, pgEnv, connection, unitArgs, validatePrepared, validateWorker };
