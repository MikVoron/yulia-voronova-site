'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { sha256 } = require('../protocol.cjs');
const { HELPERS } = require('../integrated-contract.cjs');
const { layout, environment, definition, verifyDefinitions, pm2Command, unitPath, timerMatches } = require('../integrated-contract.cjs');
const id = 'run-0123456789abcdef', name = 'case-01', token = 'a'.repeat(32);
function dump(version = 'old') {
  return ['app', 'sentinel'].map((role, index) => {
    const wanted = definition(id, name, token, role, role === 'app' ? version : 'stable');
    return { name: wanted.name, pm_exec_path: wanted.script, pm_cwd: wanted.cwd,
      exec_interpreter: wanted.interpreter, exec_mode: 'fork_mode', uid: 997, gid: 997,
      watch: false, autorestart: false, kill_timeout: 1000, args: wanted.args, node_args: wanted.node_args,
      pm_out_log_path: wanted.out_file, pm_err_log_path: wanted.error_file,
      pm_pid_path: wanted.pid_file.replace(/\.pid$/, '-' + index + '.pid'), env: wanted.env };
  });
}
test('integrated fixture accepts only generated run IDs and ten bounded case IDs', () => {
  for (const value of ['/root/.pm2', '/var/www/smartplate-api', '../run-0123456789abcdef', id + '/x', '', null]) {
    assert.throws(() => layout(value), /RUN_ID/);
  }
  for (const value of ['case-00', 'case-11', 'case-1', '../case-01', 'case-01/x', 'case-01;reboot']) {
    assert.throws(() => layout(id, value), /CASE_ID/);
  }
  assert.equal(layout(id, 'case-10').root, '/var/lib/smartplate-pm2-rehearsals/' + id);
  assert.notEqual(layout(id, 'case-01').pm2, layout(id, 'case-02').pm2);
  assert.equal(layout(id, 'case-01').lock, layout(id, 'case-02').lock);
});
test('PM2 calls use their own environment and allow only list/save in this controller', () => {
  const env = environment(id, name);
  assert.equal(env.PM2_HOME, layout(id, name).pm2);
  assert.equal(env.HOME, layout(id, name).home);
  assert.equal(env.NODE_PATH, undefined); assert.equal(env.PM2_RPC_PORT, undefined);
  for (const action of ['restart', 'kill', 'startup', 'resurrect', 'delete', 'list;reboot']) {
    assert.throws(() => pm2Command(id, name, action), /PM2_ACTION/);
  }
  for (const action of ['list', 'save']) {
    const spec = pm2Command(id, name, action);
    assert.equal(spec.file, '/usr/bin/node'); assert.deepEqual(spec.env, env);
    assert.equal(spec.args[0], '/usr/lib/node_modules/pm2/bin/pm2');
  }
});
test('saved configurations enforce UID997, fixed code/cwd, args and both fixture processes', () => {
  verifyDefinitions(dump(), id, name, token, 'old');
  verifyDefinitions(dump('new').map(pm2_env => ({ pm2_env })), id, name, token, 'new', true);
  for (const edit of [x => { x[0].uid = 0; }, x => { x[0].gid = 0; },
    x => { x[0].pm_exec_path = '/var/www/smartplate-api/index.js'; },
    x => { x[0].pm_cwd = '/var/www/smartplate-api'; }, x => { x[0].exec_interpreter = '/bin/sh'; },
    x => { x[0].args.push('--extra'); }, x => { x[0].node_args = ['--require=/tmp/bad']; },
    x => { x[0].pm_pid_path = '/root/.pm2/pids/app-0.pid'; },
    x => { x[0].pm_pid_path = layout(id, name).pm2 + '/../../outside'; },
    x => { x[0].env.SP_IR_TOKEN = 'b'.repeat(32); }, x => { x[0].autorestart = true; },
    x => { x[0].instances = 2; }, x => x.pop(), x => x.push(x[0]), x => { x[1] = x[0]; }]) {
    const entries = dump(); edit(entries);
    assert.throws(() => verifyDefinitions(entries, id, name, token, 'old'));
  }
});
test('timer identities cannot target production units and numeric deadlines must match exactly', () => {
  assert.equal(unitPath(layout(id, name).rollback + '.timer'),
    '/org/freedesktop/systemd1/unit/sp_2dir_2d0123456789abcdef_2dcase_2d01_2drollback_2etimer');
  for (const value of ['pm2-root.service', 'nginx.timer', layout(id, name).rollback + '.service']) {
    assert.throws(() => unitPath(value), /TIMER_NAME/);
  }
  assert.equal(timerMatches({ type: 't', data: 123456000 }, 123456), true);
  for (const value of [{ type: 't', data: '123456000' }, { type: 's', data: 123456000 },
    { type: 't', data: 123456001 }, { type: 't', data: 0 }, null]) {
    assert.throws(() => timerMatches(value, 123456), /TIMER_DEADLINE/);
  }
});
test('entrypoint rejects every privileged operation before writes when not root',
  { skip: process.platform === 'linux' && process.getuid() === 0 }, () => {
    for (const args of [['--run', 'a'.repeat(64)], ['--suite', id], ['--cleanup', id],
      ['--locked', id, name, 'rollback', ''], ['--deploy']]) {
      const result = cp.spawnSync(process.execPath, [path.join(__dirname, '../integrated-rehearsal.cjs'), ...args],
        { encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1); assert.match(result.stderr, /INTEGRATED_ROOT_REQUIRED/);
    }
  });
test('read-only bundle fingerprint covers the exact seven helper files in the defined order', () => {
  const hashes = Object.fromEntries(HELPERS.map(file => [file, sha256(fs.readFileSync(path.join(__dirname, '..', file)))]));
  const result = cp.spawnSync(process.execPath, [path.join(__dirname, '../integrated-rehearsal.cjs'), '--bundle-hash'],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), sha256(JSON.stringify(hashes)));
  assert.equal(HELPERS.length, 7);
});
