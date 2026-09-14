'use strict';
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { PG, INPUT, check, layout, pgEnv, connection } = require('./restore-contract.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function invoke(p, program, args, options = {}) {
  const r = cp.spawnSync(PG + program, args, { env: pgEnv(p), cwd: p.runtime,
    timeout: 60000, maxBuffer: 64 * 1024 * 1024, ...options });
  if (r.error || r.status !== 0) throw new Error('RESTORE_PG_' + program.toUpperCase().replace(/[^A-Z]/g, '_'));
  return r.stdout;
}
function sql(p, statement, database = 'restore_check') {
  return invoke(p, 'psql', [...connection(p, database), '--no-psqlrc', '--tuples-only', '--no-align',
    '--set=ON_ERROR_STOP=1', '--command', statement]).toString('utf8').trim();
}
function identity(p, database) {
  const v = JSON.parse(sql(p, `SELECT json_build_object('db',current_database(), 'role',current_user,
    'data',current_setting('data_directory'),'socket',current_setting('unix_socket_directories'),
    'local',inet_server_addr() IS NULL,'tcp',current_setting('listen_addresses'))`, database));
  check(v.db === database && v.role === 'restore_admin' && v.data === p.data &&
    v.socket === p.socket && v.local === true && v.tcp === '', 'RESTORE_CONNECTION_IDENTITY');
}
function databaseCase(p, mode, input) {
  // Only main() may select runtime paths in the privileged service. Tests use a fresh own tmp directory.
  check(['fixture', 'restore'].includes(mode), 'RESTORE_MODE');
  check(/^\/run\/sp-db-[a-f0-9]{16}-(fixture|restore)$/.test(p.runtime) ||
    (mode === 'fixture' && /^\/tmp\/sp-db-test-[A-Za-z0-9]+$/.test(p.runtime)), 'RESTORE_CASE_PATH');
  const st = fs.lstatSync(p.runtime);
  check(st.isDirectory() && !st.isSymbolicLink() && fs.realpathSync(p.runtime) === p.runtime &&
    st.uid === process.getuid() && (st.mode & 0o777) === 0o700 &&
    p.data === p.runtime + '/data' && p.socket === p.runtime + '/socket' &&
    p.dump === p.runtime + '/input.dump', 'RESTORE_CASE_PATH');
  check(!fs.existsSync(p.data) && !fs.existsSync(p.socket) && !fs.existsSync(p.dump), 'RESTORE_CASE_NOT_FRESH');
  fs.mkdirSync(p.socket, { mode: 0o700 });
  let started = false, result;
  try {
    invoke(p, 'initdb', ['--pgdata=' + p.data, '--username=restore_admin', '--auth-local=trust',
      '--auth-host=reject', '--encoding=UTF8', '--locale=C.UTF-8']);
    fs.appendFileSync(p.data + '/postgresql.conf', `
listen_addresses = ''
port = 6543
unix_socket_directories = '${p.socket}'
unix_socket_permissions = 0700
shared_buffers = '16MB'
work_mem = '2MB'
maintenance_work_mem = '16MB'
max_connections = 5
max_worker_processes = 0
max_parallel_workers = 0
max_wal_size = '64MB'
min_wal_size = '32MB'
wal_buffers = '1MB'
temp_file_limit = '16MB'
statement_timeout = '45s'
log_statement = 'none'
log_min_error_statement = 'panic'
log_parameter_max_length_on_error = 0
`, { mode: 0o600 });
    invoke(p, 'pg_ctl', ['--pgdata=' + p.data, '--log=' + p.runtime + '/postgres.log', '--wait', '--timeout=30', 'start']);
    started = true; identity(p, 'postgres');
    if (mode === 'fixture') {
      sql(p, 'CREATE DATABASE source_fixture TEMPLATE template0', 'postgres');
      identity(p, 'source_fixture');
      sql(p, `CREATE TABLE restore_probe (id integer PRIMARY KEY, value text NOT NULL);
        INSERT INTO restore_probe VALUES (1,'fixture-one'),(2,'fixture-two');
        CREATE TABLE restore_related (id integer PRIMARY KEY, parent integer REFERENCES restore_probe(id));
        INSERT INTO restore_related VALUES (1,1),(2,2);`, 'source_fixture');
      input = invoke(p, 'pg_dump', [...connection(p, 'source_fixture'), '--format=custom']);
    } else check(sha(input) === INPUT.decryptedHash, 'RESTORE_INPUT_HASH');
    const inputSha256 = sha(input);
    fs.writeFileSync(p.dump, input, { flag: 'wx', mode: 0o600 });
    input.fill(0);
    sql(p, 'CREATE DATABASE restore_check TEMPLATE template0', 'postgres'); identity(p, 'restore_check');
    invoke(p, 'pg_restore', [...connection(p), '--exit-on-error', '--single-transaction',
      '--no-owner', '--no-privileges', '--no-tablespaces', p.dump]);
    identity(p, 'restore_check');
    const names = JSON.parse(sql(p, `SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json)
      FROM pg_tables WHERE schemaname='public'`));
    check(names.length === (mode === 'fixture' ? 2 : INPUT.tables), 'RESTORE_TABLE_COUNT');
    let totalRows = 0, nonemptyTables = 0;
    for (const name of names) {
      check(typeof name === 'string' && name.length <= 63, 'RESTORE_TABLE_NAME');
      const count = Number(sql(p, 'SELECT count(*) FROM public."' + name.replace(/"/g, '""') + '"'));
      check(Number.isSafeInteger(count) && count >= 0, 'RESTORE_ROW_COUNT');
      totalRows += count; if (count > 0) nonemptyTables++;
    }
    check(Number.isSafeInteger(totalRows) && totalRows > 0, 'RESTORE_EMPTY_DATA');
    const invalidIndexes = Number(sql(p, `SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid`));
    check(invalidIndexes === 0, 'RESTORE_INVALID_INDEXES');
    let constraintTest;
    if (mode === 'fixture') {
      check(sql(p, 'SELECT value FROM restore_probe WHERE id=2') === 'fixture-two', 'RESTORE_FIXTURE_VALUE');
      const denied = cp.spawnSync(PG + 'psql', [...connection(p), '--no-psqlrc', '--set=ON_ERROR_STOP=1',
        '--command', 'INSERT INTO restore_related VALUES (3,999)'], { env: pgEnv(p), timeout: 5000 });
      check(!denied.error && denied.status !== 0 && sql(p, 'SELECT count(*) FROM restore_related') === '2', 'RESTORE_FIXTURE_CONSTRAINT');
      constraintTest = true;
    }
    result = { passed: true, mode, tableCount: names.length, totalRows, nonemptyTables, invalidIndexes, inputSha256,
      ...(constraintTest ? { constraintTest } : {}) };
  } finally {
    if (started || fs.existsSync(p.data + '/postmaster.pid')) {
      invoke(p, 'pg_ctl', ['--pgdata=' + p.data, '--wait', '--timeout=15', '--mode=fast', 'stop']);
      check(!fs.existsSync(p.data + '/postmaster.pid'), 'RESTORE_PG_STILL_RUNNING');
    }
    if (Buffer.isBuffer(input)) input.fill(0);
  }
  return { ...result, postgresStopped: true };
}
function isolation(p, hostNet) {
  const uid = process.getuid();
  check(uid >= 61184 && uid <= 65519 && process.getgid() >= 61184 && process.getgid() <= 65519, 'RESTORE_DYNAMIC_UID');
  check(process.getgroups().every(g => g === process.getgid()), 'RESTORE_EXTRA_GROUPS');
  const st = fs.lstatSync(p.runtime);
  check(st.isDirectory() && !st.isSymbolicLink() && st.uid === uid && (st.mode & 0o777) === 0o700 &&
    fs.realpathSync(p.runtime) === p.runtime, 'RESTORE_RUNTIME');
  check(fs.statfsSync(p.runtime).type === 0x01021994, 'RESTORE_TMPFS');
  check(fs.readFileSync('/proc/self/cgroup', 'utf8').includes('/' + p.unit), 'RESTORE_CGROUP');
  check(/^net:\[[0-9]+\]$/.test(hostNet) && fs.readlinkSync('/proc/self/ns/net') !== hostNet, 'RESTORE_NETWORK');
  const status = fs.readFileSync('/proc/self/status', 'utf8');
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) check(new RegExp('^' + key + ':\\s+0+$', 'm').test(status), 'RESTORE_CAPABILITIES');
  for (const blocked of ['/var/lib/postgresql', '/run/postgresql', '/var/www/smartplate-api', '/opt/voronova']) {
    let denied = false;
    try { fs.readdirSync(blocked); } catch (e) { denied = ['EACCES', 'EPERM'].includes(e.code); }
    check(denied, 'RESTORE_PRODUCTION_PATH_VISIBLE');
  }
  return { dynamicUid: uid, networkIsolated: true, productionPathsBlocked: true, capabilitiesZero: true };
}
function main(args) {
  check(process.platform === 'linux' && args.length === 3, 'RESTORE_WORKER_USAGE');
  const [id, mode, hostNet] = args, p = layout(id, mode);
  check(fs.realpathSync(__filename) === p.code + '/restore-worker.cjs', 'RESTORE_WORKER_CODE');
  process.umask(0o077);
  const evidence = isolation(p, hostNet);
  const input = fs.readFileSync(0);
  check(input.length <= 64 * 1024 * 1024 && (mode !== 'fixture' || input.length === 0), 'RESTORE_INPUT_SIZE');
  const result = databaseCase(p, mode, input);
  process.stdout.write(JSON.stringify({ ...result, isolation: evidence }) + '\n');
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) {
    const code = /^RESTORE_[A-Z_]+$/.test(e.message) ? e.message : 'RESTORE_WORKER_IO';
    process.stdout.write(JSON.stringify({ passed: false, error: code }) + '\n'); process.exitCode = 1;
  }
}
module.exports = { databaseCase };
