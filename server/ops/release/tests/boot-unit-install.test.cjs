'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { layout } = require('../integrated-contract.cjs');
const filename = path.join(__dirname, '../integrated-rehearsal.cjs');
const source = fs.readFileSync(filename, 'utf8'), actualRequire = createRequire(filename);
const id = 'run-0123456789abcdef';

// Run the real installer, manager selection, quiescence checks and cleanup.
// Only filesystem/process boundaries are simulated; no root or Linux required.
function fixture({ fragment = 'source', transient = 'no', loadState = 'loaded', badLink = false,
  corruptedBytes = false, bootstrapActive = false, mode = 'bootstrap', badPrepare = false } = {}) {
  const p = layout(id), files = new Map(), links = new Map(), calls = [];
  const configPath = p.control + '/config.json', observationsPath = p.control + '/boot-unit-observation.json';
  const put = (file, value) => files.set(file, Buffer.from(JSON.stringify(value)));
  put(configPath, { fixture: true, id, name: p.name, token: 'a'.repeat(32), timerMs: 600000, managerMode: mode });
  put(p.root + '/control/cases.json', [p.name]);
  const missing = () => { const e = new Error('missing'); e.code = 'ENOENT'; throw e; };
  const fakeFs = {
    mkdirSync() {}, readdirSync: () => [],
    lstatSync(file) { if (!links.has(file)) return missing(); return { uid: 0, isSymbolicLink: () => true }; },
    readlinkSync: file => badLink ? '/untrusted/unit' : links.get(file),
    realpathSync: file => links.get(file) || file,
    unlinkSync: file => { assert.ok(links.has(file)); links.delete(file); }
  };
  function command(file, args) {
    calls.push({ file, args: Array.from(args) });
    if (args[0] === 'link') for (const source of args.slice(2)) {
      links.set('/run/systemd/system/' + source.split('/').pop(), source);
      if (corruptedBytes) files.set(source, Buffer.from('wrong unit'));
    }
    if (args[0] === 'show') {
      const unit = args[1], key = args[2].slice('--property='.length);
      let value;
      if (key === 'ActiveState') value = bootstrapActive && unit === p.bootstrapManager ? 'active' : 'inactive';
      else if (key === 'LoadState') value = badPrepare && unit === p.prepare ? 'error' : loadState;
      else if (key === 'Transient') value = unit === p.bootstrapManager ? 'yes' : transient;
      else if (key === 'FragmentPath') value = fragment === 'source' ? p.control + '/units/' + unit
        : fragment === 'runtime' ? '/run/systemd/system/' + unit : '/untrusted/' + unit;
      else assert.fail('unexpected property: ' + key);
      return { status: 0, stdout: value + '\n' };
    }
    return { status: 0, stdout: '' };
  }
  const sandbox = { module: { exports: {} }, __filename: filename, __dirname: path.dirname(filename), Buffer,
    process: { pid: 100, ppid: 99 }, testCommand: command,
    testRead: file => { assert.ok(files.has(file), 'unexpected read: ' + file); return files.get(file); },
    require(name) {
      if (name === 'node:fs') return fakeFs;
      if (name === './linux-storage.cjs') return { protectedPath() {}, syncDir() {},
        atomicWrite: (file, bytes) => files.set(file, Buffer.from(bytes)), atomicJson: put };
      return actualRequire(name);
    }
  };
  vm.runInNewContext(source + `
    verifyBundle = () => {};
    readBytes = testRead;
    command = testCommand;
    module.exports.boundary = { installBootUnits, verify, stopAll };
  `, sandbox, { filename });
  const boundary = sandbox.module.exports.boundary;
  return { p, calls, files, links, install: () => boundary.installBootUnits(p),
    verify: value => boundary.verify(value), cleanup: () => boundary.stopAll(id),
    config: () => JSON.parse(files.get(configPath)), observations: () => JSON.parse(files.get(observationsPath)) };
}

for (const fragment of ['source', 'runtime']) test('installer accepts only protected ' + fragment + ' fragment and distinct recovery name', () => {
  const f = fixture({ fragment }); f.install();
  assert.notEqual(f.p.bootManager, f.p.bootstrapManager);
  assert.equal(f.p.manager, f.p.bootManager); assert.equal(f.config().managerMode, 'boot');
  assert.deepEqual(f.observations().map(x => x.name), [f.p.prepare, f.p.bootManager]);
  const freshChild = layout(id); f.verify(freshChild); assert.equal(freshChild.manager, f.p.bootManager);
  const link = f.calls.find(x => x.args[0] === 'link');
  assert.ok(link.args.every(x => !x.endsWith('/' + f.p.bootstrapManager)));
  assert.ok(!f.calls.some(x => ['start', 'restart'].includes(x.args[0])));
});

for (const options of [{ transient: 'yes' }, { loadState: 'not-found' }, { fragment: 'outside' },
  { badPrepare: true }, { badLink: true }, { corruptedBytes: true }]) {
  test('installer refuses unsafe unit observation ' + JSON.stringify(options) + ' without selecting or starting it', () => {
    const f = fixture(options);
    assert.throws(f.install, /INTEGRATED_BOOT_UNIT_(?:NOT_LOADED|OWNERSHIP)/);
    assert.equal(f.config().managerMode, 'bootstrap'); assert.equal(f.p.manager, f.p.bootstrapManager);
    assert.equal(f.observations().length, 2);
    assert.ok(!f.calls.some(x => ['start', 'restart'].includes(x.args[0])));
  });
}

test('active bootstrap manager and invalid protected selection prevent installation', () => {
  const active = fixture({ bootstrapActive: true });
  assert.throws(active.install, /INTEGRATED_BOOT_MANAGER_ACTIVE/);
  assert.equal(active.links.size, 0);
  const bad = fixture({ mode: '/root/.pm2' }); assert.throws(bad.install, /INTEGRATED_MANAGER_MODE/);
  const selected = fixture({ mode: 'boot' }); assert.throws(selected.install, /INTEGRATED_BOOT_UNITS_ALREADY_SELECTED/);
});

test('cleanup stops both names even after partial installation; generated sources and observations remain', () => {
  for (const transient of ['no', 'yes']) {
    const f = fixture({ transient });
    if (transient === 'yes') assert.throws(f.install); else f.install();
    f.cleanup();
    const stops = f.calls.filter(x => x.args[0] === 'stop').map(x => x.args[1]);
    assert.ok(stops.includes(f.p.bootManager)); assert.ok(stops.includes(f.p.bootstrapManager));
    assert.equal(f.links.size, 0); assert.equal(f.observations().length, 2);
    assert.ok(f.files.has(f.p.control + '/units/' + f.p.bootManager));
    assert.equal(JSON.parse(f.files.get(f.p.root + '/control/resources-stopped.json')).complete, true);
  }
});
