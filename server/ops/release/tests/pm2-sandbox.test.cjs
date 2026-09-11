'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const { layout, childEnv, definition, pm2Invocation, verifyDefinitions } = require('../pm2-sandbox.cjs');
const root = '/tmp/sp-pm2-rh-Ab12Cd', token = 'a'.repeat(32);
function fixture(role, version) {
  const spec = definition(root, token, role, version);
  const id = role === 'app' ? 0 : 1;
  return { name: spec.name, pm_exec_path: spec.script, pm_cwd: spec.cwd,
    exec_interpreter: spec.interpreter, args: spec.args, node_args: spec.node_args,
    exec_mode: 'fork_mode', instances: spec.instances, watch: spec.watch, autorestart: spec.autorestart,
    kill_timeout: spec.kill_timeout, restart_delay: spec.restart_delay,
    pm_out_log_path: spec.out_file, pm_err_log_path: spec.error_file,
    pm_pid_path: spec.pid_file.replace(/\.pid$/, '-' + id + '.pid'), pm_id: id, env: spec.env };
}
function list() { return [fixture('app', 'old'), fixture('sentinel', 'stable')]; }
test('only freshly named /tmp fixture roots are accepted; no home, production, traversal or socket targets', () => {
  for (const value of ['/root/.pm2', '/var/www/smartplate-api', '/tmp', '/home/smartplate-admin',
    root + '/..', root + '/', root + '/rpc.sock', root + '\n', 'C:\\tmp\\test', '', null]) {
    assert.throws(() => layout(value), /PM2_FIXTURE_ROOT/);
  }
  assert.equal(layout(root).pm2, root + '/pm2');
});
test('PM2 commands have a fixed CLI, cwd and dedicated environment with no inherited secret/socket overrides', () => {
  const original = { ...process.env };
  try {
    process.env.PM2_HOME = '/root/.pm2'; process.env.NODE_OPTIONS = '--require=/production.js';
    process.env.PM2_RPC_PORT = '/root/.pm2/rpc.sock'; process.env.SP_TEST_SECRET = 'must-not-leak';
    for (const operation of ['list', 'save', 'resurrect', 'kill', 'start-old', 'start-new', 'delete-app']) {
      const cmd = pm2Invocation(root, operation);
      assert.equal(cmd.file, '/usr/bin/node');
      assert.equal(cmd.args[0], '/usr/lib/node_modules/pm2/bin/pm2');
      assert.equal(cmd.env.PM2_HOME, root + '/pm2');
      assert.equal(cmd.cwd, root + '/work');
      assert.equal(cmd.env.PM2_RPC_PORT, undefined);
      assert.equal(cmd.env.SP_TEST_SECRET, undefined);
      assert.equal(cmd.env.NODE_OPTIONS, '--max-old-space-size=64');
      assert.ok(!cmd.args.includes('all'));
      assert.equal(cmd.env.HOME, root + '/home');
    }
    assert.deepEqual(childEnv(root), pm2Invocation(root, 'list').env);
  } finally {
    for (const key of ['PM2_HOME', 'NODE_OPTIONS', 'PM2_RPC_PORT', 'SP_TEST_SECRET']) {
      if (Object.hasOwn(original, key)) process.env[key] = original[key]; else delete process.env[key];
    }
  }
});
test('startup, global update, arbitrary names and shell operations cannot enter the PM2 command builder', () => {
  for (const operation of ['startup', 'update', 'install', 'delete all', 'restart smartplate-api',
    'kill; id', '__proto__', null, []]) {
    assert.throws(() => pm2Invocation(root, operation), /PM2_FIXTURE_OPERATION/);
  }
  assert.throws(() => definition(root, token, 'smartplate-api', 'old'), /PM2_FIXTURE_ROLE/);
  assert.throws(() => definition(root, token, 'app', 'other'), /PM2_FIXTURE_ROLE/);
  assert.throws(() => definition(root, 'bad', 'app', 'old'), /PM2_FIXTURE_TOKEN/);
});
test('saved and runtime definitions preserve both complete fixture configurations across ordering changes', () => {
  assert.equal(verifyDefinitions(list().reverse(), root, token, 'old').length, 2);
  assert.equal(verifyDefinitions(list().map(pm2_env => ({ pm2_env })), root, token, 'old', true).length, 2);
  const dumped = list();
  for (const entry of dumped) { delete entry.instances; delete entry.pm_id; }
  assert.equal(verifyDefinitions(dumped, root, token, 'old').length, 2);
  assert.throws(() => verifyDefinitions(list(), root, token, 'new'), /PM2_FIXTURE_CONFIG|PM2_FIXTURE_ARGS/);
});
test('unexpected process, duplicate, changed executable, env, args or process policy is refused', () => {
  assert.throws(() => verifyDefinitions([...list(), fixture('app', 'old')], root, token, 'old'), /PM2_FIXTURE_PROCESS_COUNT/);
  assert.throws(() => verifyDefinitions([fixture('app', 'old'), fixture('app', 'old')], root, token, 'old'), /PM2_FIXTURE_DUPLICATE/);
  const changes = { name: 'smartplate-api', pm_exec_path: '/var/www/smartplate-api/index.js',
    pm_cwd: '/var/www/smartplate-api', exec_interpreter: '/bin/sh', instances: 2,
    exec_mode: 'cluster_mode', watch: true, autorestart: true, kill_timeout: 90000,
    restart_delay: 0, pm_out_log_path: '/tmp/out', pm_err_log_path: '/tmp/err',
    pm_pid_path: '/tmp/app.pid', pm_id: 5, args: [], node_args: ['--require=/production.js'] };
  for (const [key, value] of Object.entries(changes)) {
    const entries = list(); entries[0][key] = value;
    assert.throws(() => verifyDefinitions(entries, root, token, 'old'), /PM2_FIXTURE_/);
  }
  for (const key of Object.keys(fixture('app', 'old').env)) {
    const entries = list(); entries[0].env[key] = 'modified';
    assert.throws(() => verifyDefinitions(entries, root, token, 'old'), /PM2_FIXTURE_ENV/);
  }
});
test('CLI rejects production commands without creating a fixture or invoking PM2', () => {
  const result = cp.spawnSync(process.execPath, [path.resolve(__dirname, '../pm2-rehearsal.cjs'), '--apply'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PM2_FIXTURE_(LINUX_ADMIN_REQUIRED|USAGE)/);
  assert.ok(!result.stdout.includes('PM2_REHEARSAL_DIRECTORY'));
});
