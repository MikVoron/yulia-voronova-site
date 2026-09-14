'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { layout, ENV } = require('../integrated-contract.cjs');
const filename = path.join(__dirname, '../integrated-rehearsal.cjs');
const source = fs.readFileSync(filename, 'utf8');
const actualRequire = createRequire(filename);
const id = 'run-0123456789abcdef', p = layout(id), hash = 'a'.repeat(64);

// Exercise the actual bootstrap/finally from a staging filename, without root,
// filesystem writes, timers or child processes. Only external boundaries are fake.
function fixture({ suiteFails = false, cleanupFails = false, bootOnly = false, omitColdEvidence = false } = {}) {
  const files = new Map(), calls = [], output = [];
  const fakeFs = { existsSync: () => true, mkdirSync() {}, realpathSync: x => x };
  const fakeStorage = {
    protectedPath() {}, atomicWrite: (file, bytes) => files.set(file, bytes),
    atomicJson: (file, value) => files.set(file, Buffer.from(JSON.stringify(value)))
  };
  const fakeCp = { spawnSync(file, args, options) {
    calls.push({ file, args: Array.from(args), options });
    const result = { status: 0, stdout: '', stderr: '' };
    if (file === '/usr/bin/systemd-run') {
      if (args.includes('--unit=' + p.suite)) {
        fakeStorage.atomicJson(p.root + '/control/result.json', suiteFails
          ? { passed: false, error: 'TEST_SUITE_FAILED' } : { passed: true, cases: 10,
            ...(bootOnly && !omitColdEvidence ? { coldStartRecoveryTested: true, osBootTested: false,
              modeledEvidence: ['bootIdChange'] } : {}) });
      }
    } else if (file === '/usr/bin/systemctl') {
      assert.ok(args[1].startsWith('sp-ir-0123456789abcdef-'));
      if (args[0] === 'show') result.stdout = args[1] === p.suite ||
        calls.some(x => x.file === file && x.args[0] === 'stop' && x.args[1] === args[1])
        ? 'inactive\n' : 'active\n';
      else assert.equal(args[0], 'stop');
    } else {
      assert.equal(file, '/usr/bin/node');
      assert.deepEqual(Array.from(args), [p.code + '/integrated-rehearsal.cjs', '--cleanup', id]);
      assert.deepEqual({ ...options.env }, ENV);
      assert.equal(options.timeout, 120000);
      if (cleanupFails) { result.status = 1; result.stderr = 'TEST_CLEANUP_FAILED'; }
    }
    return result;
  } };
  const sandbox = {
    module: { exports: {} }, __filename: '/home/smartplate-admin/staging/integrated-rehearsal.cjs',
    __dirname: '/home/smartplate-admin/staging', Buffer,
    process: { stdout: { write: value => output.push(value) } },
    require: name => {
      if (name === 'node:fs') return fakeFs;
      if (name === 'node:child_process') return fakeCp;
      if (name === 'node:crypto') return { randomBytes: () => Buffer.from(id.slice(4), 'hex') };
      if (name === './linux-storage.cjs') return fakeStorage;
      return actualRequire(name);
    },
    testHash: hash, testRead: file => {
      assert.ok(files.has(file), 'unexpected fixture read: ' + file);
      return files.get(file);
    }
  };
  vm.runInNewContext(source + `
    preflight = () => {};
    readBundle = () => ({ sources: {}, hashes: {}, sha256: testHash });
    readBytes = testRead;
    module.exports.run = run;
  `, sandbox, { filename });
  return { run: () => sandbox.module.exports.run(hash, bootOnly), calls, output };
}

test('bootstrap success invokes protected cleanup before stopping watchdog and reporting completion', async () => {
  const f = fixture(); await f.run();
  const clean = f.calls.findIndex(x => x.file === '/usr/bin/node');
  assert.ok(clean >= 0);
  assert.deepEqual(f.calls.filter(x => x.args[0] === 'stop').map(x => x.args[1]),
    [p.watchdog + '.timer', p.watchdog + '.service']);
  assert.ok(f.calls.findIndex(x => x.args[0] === 'stop') > clean);
  assert.match(f.output.join(''), /INTEGRATED_FIXTURE_RESOURCES_STOPPED/);
});

test('suite failure still uses protected cleanup and preserves the suite error', async () => {
  const f = fixture({ suiteFails: true });
  await assert.rejects(f.run(), /TEST_SUITE_FAILED/);
  assert.equal(f.calls.filter(x => x.file === '/usr/bin/node').length, 1);
  assert.match(f.output.join(''), /INTEGRATED_FIXTURE_RESOURCES_STOPPED/);
});

test('failed protected cleanup leaves watchdog armed and does not claim completion', async () => {
  const f = fixture({ cleanupFails: true });
  await assert.rejects(f.run(), /COMMAND_FAILED_node/);
  assert.equal(f.calls.filter(x => x.file === '/usr/bin/node').length, 1);
  assert.equal(f.calls.filter(x => x.args[0] === 'stop').length, 0);
  assert.doesNotMatch(f.output.join(''), /INTEGRATED_FIXTURE_RESOURCES_STOPPED/);
});

test('cold-start bootstrap invokes the separate suite and retains protected cleanup', async () => {
  const f = fixture({ bootOnly: true }); await f.run();
  const launch = f.calls.find(x => x.file === '/usr/bin/systemd-run' && x.args.includes('--unit=' + p.suite));
  assert.ok(launch.args.includes('--boot-suite')); assert.ok(!launch.args.includes('--suite'));
  assert.equal(f.calls.filter(x => x.file === '/usr/bin/node').length, 1);
});

test('ordinary suite result cannot masquerade as completed cold-start rehearsal', async () => {
  const f = fixture({ bootOnly: true, omitColdEvidence: true });
  await assert.rejects(f.run(), /INTEGRATED_COLD_START_RESULT/);
  assert.equal(f.calls.filter(x => x.file === '/usr/bin/node').length, 1);
});
