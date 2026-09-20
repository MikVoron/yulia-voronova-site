'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const cp = require('node:child_process');
const e = require('../production-evidence.cjs');
const observer = require('../production-observe.cjs');
const protocol = require('../protocol.cjs');
const { manifest } = require('./fixtures/control-values.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
const recipes = () => [
  { id: 'free-1', access_level: 'free', ingredients: [{ name: 'sample' }], steps: [{ text: 'sample' }] },
  { id: 'trial-1', access_level: 'trial', preview_ingredients: [{ name: 'sample' }], preview_steps: [{ text: 'sample' }] },
  { id: 'pro-1', access_level: 'pro' }
];
function xml(ids = recipes().map(x => x.id)) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    ['https://plate.voronova.online/', ...ids.map(x => 'https://plate.voronova.online/recipe.html?id=' + x)]
      .map(x => '<url><loc>' + x + '</loc></url>').join('\n') + '</urlset>';
}
function response(url) {
  if (url === e.SITEMAP) return { status: 200, type: 'application/xml', body: xml() };
  if (url.endsWith('/health')) return { status: 200, type: 'application/json; charset=utf-8', body: '{"status":"ok","db":"ok"}' };
  if (url.endsWith('/content/recipes')) return { status: 200, type: 'application/json', body: JSON.stringify(recipes()) };
  return { status: 401, type: 'application/json', body: '{"error":"Unauthorized"}' };
}
test('real endpoint contract covers both origins, three private routes and sitemap, without credentials', async () => {
  const called = [];
  const report = await e.collect(async url => { called.push(url); return response(url); });
  assert.deepEqual(called, e.URLS);
  assert.equal(report.catalog.count, 3);
  assert.deepEqual(report.catalog.levels, { free: 1, trial: 1, pro: 1 });
  assert.deepEqual(Object.keys(report.checks), ['localHealth', 'publicHealth', 'catalogAccess', 'privateRoutes', 'sitemap']);
  assert.ok(!JSON.stringify(report).includes('sample'));
});
test('catalog rejects leaked details in any restricted recipe, even when other records pass', () => {
  for (const index of [1, 2]) for (const key of ['ingredients', 'steps', 'note']) {
    const rows = recipes(); rows[index][key] = key === 'note' ? 'secret' : [];
    assert.throws(() => e.catalog(rows), /PRIVATE_DETAILS/);
  }
});
test('approved preview permits names and one text step, but rejects quantities, photos and excess entries', () => {
  for (const change of [
    x => { x.preview_ingredients = [{ name: 'sample', grams: 1 }]; },
    x => { x.preview_ingredients = Array(4).fill({ name: 'sample' }); },
    x => { x.preview_steps = [{ text: 'sample', photo: 'private' }]; },
    x => { x.preview_steps = ['one', 'two']; }
  ]) { const rows = recipes(); change(rows[1]); assert.throws(() => e.catalog(rows), /PREVIEW/); }
});
test('empty, unknown-tier, duplicate and one-sided catalogs cannot satisfy coverage', () => {
  for (const rows of [[], recipes().slice(0, 1), recipes().slice(1), [...recipes(), recipes()[0]],
    [{ ...recipes()[0], access_level: 'premium' }, ...recipes().slice(1)]]) assert.throws(() => e.catalog(rows));
  const legacy = recipes(); legacy[0].access_level = null; legacy[0].is_free = true;
  legacy[2].access_level = null; legacy[2].is_free = false;
  assert.equal(e.catalog(legacy).count, 3);
});
test('degraded DB, redirect, HTML and malformed JSON do not count as healthy HTTP', async () => {
  for (const bad of [
    { status: 200, type: 'application/json', body: '{"status":"ok","db":"error"}' },
    { status: 302, type: 'application/json', body: '{}' },
    { status: 200, type: 'text/html', body: '<html>ok</html>' },
    { status: 200, type: 'application/json', body: 'not json' }
  ]) await assert.rejects(e.collect(async url => url.endsWith('/health') ? bad : response(url)));
});
test('private-route success, forbidden, redirect, gateway HTML or extra user data all fail', async () => {
  for (const bad of [
    { status: 200, type: 'application/json', body: '{}' },
    { status: 403, type: 'application/json', body: '{}' },
    { status: 302, type: 'application/json', body: '{}' },
    { status: 401, type: 'text/html', body: 'gateway' },
    { status: 401, type: 'application/json', body: '{"error":"unauthorized","user":{"email":"secret"}}' }
  ]) for (const base of e.ORIGINS) for (const route of e.PRIVATE) {
    await assert.rejects(e.collect(async url => url === base + route ? bad : response(url)));
  }
});
test('local versus public catalog disagreement fails even when each catalog is valid', async () => {
  await assert.rejects(e.collect(async url => {
    const r = response(url);
    if (url === e.ORIGINS[1] + '/content/recipes') { const rows = recipes(); rows[2].id = 'different'; r.body = JSON.stringify(rows); }
    return r;
  }), /ORIGIN_MISMATCH/);
});
test('sitemap must cover catalog and refuse alternate origins, DTD, trailing markup and duplicates', () => {
  const ids = recipes().map(x => x.id);
  for (const text of [xml(ids.slice(1)), xml().replace('https://plate.', 'https://evil.'),
    '<!DOCTYPE urlset>' + xml(), xml().replace('</urlset>', '<script>1</script></urlset>'),
    xml([...ids, ids[0]]), xml().replace('free-1', 'free-1&xxe;')]) assert.throws(() => e.sitemap(text, ids));
  assert.equal(e.sitemap(xml(), ids).catalogRecipes, 3);
});
test('network transport refuses arbitrary URLs before making any request', () => {
  for (const url of ['http://127.0.0.1:3000/admin', 'https://api.voronova.online/health?x=1',
    'https://user:pass@api.voronova.online/health', 'file:///etc/passwd']) assert.throws(() => e.request(url), /HTTP_TARGET/);
});
function dump() {
  return [{ name: 'smartplate-api', pm_exec_path: '/var/www/smartplate-api/index.js', pm_cwd: '/var/www/smartplate-api',
    uid: 997, gid: 997, exec_mode: 'fork_mode', exec_interpreter: 'node', autorestart: true,
    env: { TOKEN: 'never-display-this-secret' }, args: ['also-private'] }];
}
test('saved dump projection never returns environment, arbitrary arguments or paths', () => {
  const r = observer.summarizeDump(Buffer.from(JSON.stringify(dump())));
  assert.equal(r.definitions[0].uid997, true);
  assert.ok(!JSON.stringify(r).includes('never-display'));
  assert.ok(!JSON.stringify(r).includes('also-private'));
  assert.ok(!JSON.stringify(r).includes('/var/www'));
  const changed = dump(); changed[0].uid = 0;
  assert.equal(observer.summarizeDump(Buffer.from(JSON.stringify(changed))).definitions[0].uid997, false);
});
test('invalid dump or ambiguous API entries cannot yield a plausible inventory', () => {
  for (const value of [[], {}, [dump()[0], dump()[0]], [dump()[0], {}], [{ name: 'other' }], [{ name: 'name\nsecret' }]])
    assert.throws(() => observer.summarizeDump(Buffer.from(JSON.stringify(value))));
});
test('dump comparison distinguishes whitespace/object order from content differences', () => {
  const left = Buffer.from(JSON.stringify(dump())), right = Buffer.from(JSON.stringify(dump(), null, 2));
  assert.equal(observer.compareDumps(left, right).identicalJson, true);
  const reordered = dump().map(x => Object.fromEntries(Object.entries(x).reverse()));
  assert.equal(observer.compareDumps(left, Buffer.from(JSON.stringify(reordered))).identicalJson, true);
});
test('different process names or order must not look like a metadata-only difference', () => {
  const left = [...dump(), { ...dump()[0], name: 'sidecar' }];
  for (const right of [left.slice().reverse(), dump()]) {
    const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
    assert.equal(r.sameProcessOrder, false); assert.equal(r.onlyListedMetadataDiffers, false);
  }
});
test('known runtime metadata changes are reported without values or a policy approval', () => {
  const left = dump(), right = dump(); left[0].pm_uptime = 100; right[0].pm_uptime = 200;
  right[0].restart_time = 1;
  const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
  assert.equal(r.onlyListedMetadataDiffers, true); assert.equal(r.completeSavedPm2PolicyVerified, false);
  assert.deepEqual(r.differences[0].metadataFields, ['pm_uptime', 'restart_time']);
  assert.equal(r.differences[0].changedFieldCount, 2);
});
test('environment, unknown keys and interpreter changes remain significant and never leak values or secret keys', () => {
  const left = dump(), right = dump();
  right[0].env['private-key-name'] = 'private-value';
  right[0]['secret-root-key-name'] = 'another-private-value';
  right[0].exec_interpreter = '/private/interpreter/path';
  const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
  assert.equal(r.onlyListedMetadataDiffers, false);
  assert.deepEqual(r.differences[0].configurationFields, ['env', 'exec_interpreter']);
  assert.equal(r.differences[0].unclassifiedFieldCount, 1);
  assert.equal(r.differences[0].changedFieldCount, 3);
  assert.doesNotMatch(JSON.stringify(r), /private|secret-root|TOKEN|never-display/);
});
test('unknown null-valued field addition is not confused with an absent field', () => {
  const left = dump(), right = dump(); right[0].unknown = null;
  const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
  assert.equal(r.onlyListedMetadataDiffers, false); assert.equal(r.differences[0].unclassifiedFieldCount, 1);
});
test('PM2 monitoring changes expose counts, never private metric names or samples', () => {
  const left = dump(), right = dump();
  left[0].axm_monitor = { 'private-metric': { value: 'private-old-value', type: 'private-type', unit: 'MiB' } };
  right[0].axm_monitor = { 'private-metric': { value: 'private-new-value', type: 'private-type', unit: 'MiB' } };
  const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
  assert.deepEqual(r.differences[0].configurationFields, ['axm_monitor']);
  assert.equal(r.differences[0].unclassifiedFieldCount, 0);
  assert.equal(r.differences[0].monitorComparison.onlyMetricValuesDiffer, true);
  assert.equal(r.differences[0].monitorComparison.changedValues, 1);
  assert.equal(r.onlyListedMetadataDiffers, false); // No automatic policy exemption.
  assert.equal(r.completeSavedPm2PolicyVerified, false);
  assert.doesNotMatch(JSON.stringify(r), /private-metric|private-old|private-new|private-type/);
});
test('new metrics, removed metrics, changed units or types never count as values-only', () => {
  const base = { metric: { value: 1, type: 'heap', unit: 'MiB' } };
  for (const changed of [null, [], {}, { extra: { value: 2 } },
    { metric: { value: 2, type: 'other', unit: 'MiB' } },
    { metric: { value: 2, type: 'heap', unit: 'bytes' } },
    { metric: { value: { nested: 'config' }, type: 'heap', unit: 'MiB' } },
    { metric: { type: 'heap', unit: 'MiB' } }]) {
    assert.equal(observer.compareMonitor(base, changed).onlyMetricValuesDiffer, false);
  }
  assert.equal(observer.compareMonitor(base, clone(base)).onlyMetricValuesDiffer, false);
});
test('instrumentation options are identified but cannot be silently ignored as runtime metadata', () => {
  for (const key of ['axm_options', 'axm_actions', 'node_version', 'pm_pid_path']) {
    const left = dump(), right = dump(); right[0][key] = 'private-config';
    const r = observer.compareDumps(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)));
    assert.deepEqual(r.differences[0].configurationFields, [key]);
    assert.equal(r.onlyListedMetadataDiffers, false); assert.doesNotMatch(JSON.stringify(r), /private-config/);
  }
});
function observeFixture({ changed = false, dumpChanged = false } = {}) {
  const filename = path.join(__dirname, '../production-observe.cjs');
  const actualRequire = createRequire(filename);
  const original = { api: { pid: 100, startTicks: '1000' }, hashes: { 'index.js': 'aaa' } };
  let snapshots = 0, dumps = 0;
  const sandbox = { module: { exports: {} }, __dirname: path.dirname(filename), console,
    hooks: { snapshot: () => { const value = clone(original); if (++snapshots > 1 && changed) value.api.startTicks = '2000'; return value; },
      dumps: () => ({ sha256: ++dumps > 1 && dumpChanged ? 'bbb' : 'aaa' }) } };
  sandbox.require = name => name === './production-evidence.cjs' ? { collect: () => e.collect(async url => response(url)) } : actualRequire(name);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nsnapshot = hooks.snapshot; pm2Files = hooks.dumps;', sandbox, { filename });
  return sandbox.module.exports;
}
test('process restart, PID reuse or dump drift during observation blocks a successful report', async () => {
  await assert.rejects(observeFixture({ changed: true }).observe(), /BASELINE_CHANGED/);
  await assert.rejects(observeFixture({ dumpChanged: true }).observe(true), /DUMP_CHANGED/);
});
test('observation is explicitly incomplete and cannot supply a complete arm or commit event', async () => {
  const result = await observeFixture().observe();
  assert.equal(result.passed, true); assert.equal(result.releaseAuthorized, false);
  assert.equal(result.productionExecutionEnabled, false); assert.equal(result.osBootTested, false);
  assert.ok(result.notVerified.includes('savedPm2997')); assert.ok(result.notVerified.includes('auditZero'));
  assert.throws(() => protocol.transition(protocol.createState(manifest()), {
    action: 'arm', expectedRevision: 0, manifestSha256: protocol.manifestDigest(manifest()), nowMs: 1000, evidence: result.checks
  }), /EVIDENCE_FIELDS/);
});
test('CLI refuses mutation verbs, arbitrary targets and root inspection without its exact syntax', () => {
  for (const args of [['--apply'], ['--observe', 'https://other'], ['--inspect-pm2'], ['--reboot']]) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '../production-observe.cjs'), ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 1); assert.match(r.stderr, /OBSERVE_USAGE/);
  }
});
