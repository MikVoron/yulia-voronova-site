'use strict';

// Fixture contract only. No I/O, installed PM2 import, or production targets.
const path = require('node:path').posix;
const assert = require('node:assert/strict');
const ROOT = /^\/tmp\/sp-pm2-rh-[a-zA-Z0-9]{6}$/;
const PM2_CLI = '/usr/lib/node_modules/pm2/bin/pm2';
function check(ok, code) { if (!ok) throw new Error(code); }
function layout(root) {
  check(typeof root === 'string' && ROOT.test(root), 'PM2_FIXTURE_ROOT');
  return { root, pm2: root + '/pm2', home: root + '/home', work: root + '/work',
    runtime: root + '/runtime', control: root + '/control', code: root + '/code',
    logs: root + '/logs', tmp: root + '/tmp',
    unit: 'sp-pm2-rh-' + path.basename(root).slice(-6) + '.service' };
}
function context(root, token) {
  check(typeof token === 'string' && /^[a-f0-9]{32}$/.test(token), 'PM2_FIXTURE_TOKEN');
  return { ...layout(root), token };
}
function childEnv(root) {
  const p = layout(root);
  // Never merge process.env: in particular no inherited NODE_OPTIONS,
  // NODE_PATH, PM2 RPC/socket overrides, credentials, or production .env.
  return { PATH: '/usr/bin:/bin', LANG: 'C', HOME: p.home, PM2_HOME: p.pm2,
    TMPDIR: p.tmp, XDG_RUNTIME_DIR: '/run/user/1000',
    NODE_OPTIONS: '--max-old-space-size=64' };
}
function definition(root, token, role, version) {
  const p = context(root, token);
  check((role === 'app' && ['old', 'new'].includes(version)) ||
    (role === 'sentinel' && version === 'stable'), 'PM2_FIXTURE_ROLE');
  return { name: 'sp-pm2-' + path.basename(root).slice(-6) + '-' + role,
    script: p.code + '/pm2-fixture-worker.cjs', cwd: p.work, interpreter: '/usr/bin/node',
    args: [root, role, version, token], node_args: ['--max-old-space-size=32'],
    exec_mode: 'fork', instances: 1, watch: false, autorestart: false,
    kill_timeout: 1000, restart_delay: version === 'new' ? 200 : 100,
    out_file: p.logs + '/' + role + '.out', error_file: p.logs + '/' + role + '.err',
    pid_file: p.runtime + '/' + role + '.pid',
    env: { PM2_HOME: p.pm2, SP_PM2_ROLE: role, SP_PM2_VERSION: version,
      SP_PM2_TOKEN: token, SP_PM2_SETTING: version === 'new' ? 'candidate-setting' : 'saved-setting' } };
}
function pm2Invocation(root, operation) {
  const p = layout(root), name = 'sp-pm2-' + path.basename(root).slice(-6) + '-app';
  const commands = {
    list: ['jlist'], save: ['save', '--force'], resurrect: ['resurrect'], kill: ['kill'],
    'start-old': ['start', p.control + '/old.config.json'],
    'start-new': ['start', p.control + '/new.config.json'],
    'delete-app': ['delete', name]
  };
  check(Object.hasOwn(commands, operation), 'PM2_FIXTURE_OPERATION');
  return { file: '/usr/bin/node', args: [PM2_CLI, ...commands[operation]], env: childEnv(root), cwd: p.work };
}
function verifyDefinitions(entries, root, token, appVersion, runtime = false) {
  const expected = [definition(root, token, 'app', appVersion), definition(root, token, 'sentinel', 'stable')];
  check(Array.isArray(entries) && entries.length === 2, 'PM2_FIXTURE_PROCESS_COUNT');
  const definitions = entries.map(x => runtime ? x.pm2_env : x);
  check(definitions.every(x => x && typeof x === 'object'), 'PM2_FIXTURE_DEFINITION');
  check(new Set(definitions.map(x => x.name)).size === 2, 'PM2_FIXTURE_DUPLICATE');
  for (const wanted of expected) {
    const actual = definitions.find(x => x.name === wanted.name);
    check(actual, 'PM2_FIXTURE_UNKNOWN_PROCESS');
    for (const [key, value] of Object.entries({
      pm_exec_path: wanted.script, pm_cwd: wanted.cwd, exec_interpreter: wanted.interpreter,
      exec_mode: 'fork_mode', watch: false, autorestart: false,
      kill_timeout: wanted.kill_timeout, restart_delay: wanted.restart_delay,
      pm_out_log_path: wanted.out_file, pm_err_log_path: wanted.error_file
    })) check(actual[key] === value, 'PM2_FIXTURE_CONFIG_' + key);
    // PM2 6.0.14 appends its dynamic pm_id to pid_file; save() drops pm_id
    // and instances from the dump. Two unique fork entries still prove count.
    check(actual.instances === undefined || actual.instances === 1, 'PM2_FIXTURE_CONFIG_instances');
    const role = wanted.env.SP_PM2_ROLE;
    check(typeof actual.pm_pid_path === 'string' && path.dirname(actual.pm_pid_path) === layout(root).runtime &&
      new RegExp('^' + role + '-[0-9]+\\.pid$').test(path.basename(actual.pm_pid_path)), 'PM2_FIXTURE_CONFIG_pm_pid_path');
    if (actual.pm_id !== undefined) {
      check(Number.isSafeInteger(actual.pm_id) && actual.pm_id >= 0 &&
        actual.pm_pid_path === wanted.pid_file.replace(/\.pid$/, '-' + actual.pm_id + '.pid'),
      'PM2_FIXTURE_CONFIG_pm_id');
    }
    assert.deepEqual(actual.args, wanted.args, 'PM2_FIXTURE_ARGS');
    assert.deepEqual(actual.node_args, wanted.node_args, 'PM2_FIXTURE_NODE_ARGS');
    for (const [key, value] of Object.entries(wanted.env)) {
      check(actual.env && actual.env[key] === value, 'PM2_FIXTURE_ENV_' + key);
    }
  }
  return expected;
}
module.exports = { PM2_CLI, check, layout, context, childEnv, definition, pm2Invocation, verifyDefinitions };
