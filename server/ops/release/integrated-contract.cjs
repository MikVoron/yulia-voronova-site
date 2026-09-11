'use strict';
// Fixed root-owned fixture namespace. No configurable production paths/commands.
const assert = require('node:assert/strict');
const BASE = '/var/lib/smartplate-pm2-rehearsals';
const PM2 = '/usr/lib/node_modules/pm2/bin/pm2';
const HELPERS = Object.freeze(['integrated-contract.cjs', 'integrated-rehearsal.cjs', 'integrated-worker.cjs',
  'protocol.cjs', 'recovery-policy.cjs', 'control-envelope.cjs', 'linux-storage.cjs']);
const ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' });
function check(ok, code) { if (!ok) throw new Error(code); }
function layout(id, name = 'case-01') {
  check(typeof id === 'string' && /^run-[a-f0-9]{16}$/.test(id), 'INTEGRATED_RUN_ID');
  check(typeof name === 'string' && /^case-(?:0[1-9]|10)$/.test(name), 'INTEGRATED_CASE_ID');
  const root = BASE + '/' + id, dir = root + '/' + name, prefix = 'sp-ir-' + id.slice(4);
  return { id, name, root, dir, code: root + '/code', lock: root + '/control/transition.lock',
    control: dir + '/control', pm2: dir + '/pm2', home: dir + '/home', runtime: dir + '/runtime',
    live: dir + '/live', candidate: dir + '/candidate', backup: dir + '/backup', stable: dir + '/stable',
    manager: prefix + '-' + name + '-manager.service', rollback: prefix + '-' + name + '-rollback',
    suite: prefix + '-suite.service', watchdog: prefix + '-watchdog' };
}
function environment(id, name) {
  const p = layout(id, name);
  return { ...ENV, HOME: p.home, PM2_HOME: p.pm2, TMPDIR: p.home,
    NODE_OPTIONS: '--max-old-space-size=64' };
}
function definition(id, name, token, role, version) {
  const p = layout(id, name);
  check(typeof token === 'string' && /^[a-f0-9]{32}$/.test(token), 'INTEGRATED_TOKEN');
  check((role === 'app' && ['old', 'new'].includes(version)) ||
    (role === 'sentinel' && version === 'stable'), 'INTEGRATED_ROLE');
  return { name: 'sp-ir-' + id.slice(4) + '-' + name + '-' + role,
    script: p.code + '/integrated-worker.cjs', cwd: role === 'app' ? p.live : p.stable,
    interpreter: '/usr/bin/node', args: [id, name, token, role, version],
    node_args: ['--max-old-space-size=32'], uid: 997, gid: 997, exec_mode: 'fork', instances: 1,
    watch: false, autorestart: false, kill_timeout: 1000,
    out_file: p.pm2 + '/' + role + '.out', error_file: p.pm2 + '/' + role + '.err',
    pid_file: p.pm2 + '/' + role + '.pid', env: { SP_IR_TOKEN: token, SP_IR_VERSION: version } };
}
function verifyDefinitions(entries, id, name, token, version, runtime = false) {
  check(Array.isArray(entries) && entries.length === 2, 'INTEGRATED_PM2_COUNT');
  const list = entries.map(x => runtime ? x.pm2_env : x);
  check(list.every(x => x && typeof x === 'object') && new Set(list.map(x => x.name)).size === 2, 'INTEGRATED_PM2_LIST');
  for (const role of ['app', 'sentinel']) {
    const wanted = definition(id, name, token, role, role === 'app' ? version : 'stable');
    const actual = list.find(x => x.name === wanted.name);
    check(actual, 'INTEGRATED_PM2_NAME');
    for (const [key, value] of Object.entries({ pm_exec_path: wanted.script, pm_cwd: wanted.cwd,
      exec_interpreter: wanted.interpreter, exec_mode: 'fork_mode', uid: 997, gid: 997,
      watch: false, autorestart: false, kill_timeout: 1000,
      pm_out_log_path: wanted.out_file, pm_err_log_path: wanted.error_file })) {
      check(actual[key] === value, 'INTEGRATED_PM2_' + key);
    }
    assert.deepEqual(actual.args, wanted.args); assert.deepEqual(actual.node_args, wanted.node_args);
    check(actual.instances === undefined || actual.instances === 1, 'INTEGRATED_PM2_INSTANCES');
    const escaped = layout(id, name).pm2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    check(new RegExp('^' + escaped + '/' + role + '-[0-9]+\\.pid$').test(actual.pm_pid_path), 'INTEGRATED_PM2_PID_PATH');
    for (const [key, value] of Object.entries(wanted.env)) check(actual.env?.[key] === value, 'INTEGRATED_PM2_ENV');
  }
}
function pm2Command(id, name, action) {
  const p = layout(id, name);
  const actions = { list: ['jlist'], save: ['save', '--force'] };
  check(Object.hasOwn(actions, action), 'INTEGRATED_PM2_ACTION');
  return { file: '/usr/bin/node', args: [PM2, ...actions[action]], env: environment(id, name), cwd: p.dir };
}
function unitPath(name) {
  check(/^sp-ir-[a-f0-9]{16}-case-(?:0[1-9]|10)-rollback\.timer$/.test(name), 'INTEGRATED_TIMER_NAME');
  return '/org/freedesktop/systemd1/unit/' + name.replace(/[^a-zA-Z0-9]/g,
    c => '_' + c.charCodeAt(0).toString(16));
}
function timerMatches(value, dueMs) {
  check(value && value.type === 't' && Number.isSafeInteger(value.data) &&
    value.data === dueMs * 1000, 'INTEGRATED_TIMER_DEADLINE');
  return true;
}
module.exports = { BASE, PM2, HELPERS, ENV, check, layout, environment, definition, verifyDefinitions,
  pm2Command, unitPath, timerMatches };
