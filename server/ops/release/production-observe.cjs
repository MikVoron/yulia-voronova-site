#!/usr/bin/env node
'use strict';
// Fixed-target read-only CLI. Does not invoke PM2, load app code, or read .env.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const evidence = require('./production-evidence.cjs');
const ROOT = '/var/www/smartplate-api';
const BUNDLE = ['production-observe.cjs', 'production-evidence.cjs'];
const ENV = { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C' };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function check(ok, code) { if (!ok) throw new Error(code); }
function command(file, args) {
  const r = cp.spawnSync(file, args, { env: ENV, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  check(!r.error && r.status === 0, 'OBSERVE_COMMAND'); return r.stdout;
}
function manager() {
  const lines = command('/usr/bin/systemctl', ['show', 'pm2-root.service', '-p', 'MainPID', '-p', 'ActiveState', '-p', 'SubState']);
  const props = Object.fromEntries(lines.trim().split('\n').map(x => x.split('=')));
  check(props.ActiveState === 'active' && props.SubState === 'running' && /^[1-9][0-9]+$/.test(props.MainPID), 'OBSERVE_PM2_INACTIVE');
  return Number(props.MainPID);
}
function identity(pid) {
  check(Number.isSafeInteger(pid) && pid > 1, 'OBSERVE_PID');
  const status = fs.readFileSync('/proc/' + pid + '/status', 'utf8');
  const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
  const fields = stat.slice(stat.lastIndexOf(') ') + 2).trim().split(/\s+/);
  const uid = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m);
  const gid = status.match(/^Gid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m);
  check(uid && gid && /^\d+$/.test(fields[19]), 'OBSERVE_PROC');
  return { pid, startTicks: fields[19], ppid: Number(fields[1]), uid: uid.slice(1).map(Number), gid: gid.slice(1).map(Number),
    capabilitiesZero: ['CapInh', 'CapPrm', 'CapEff', 'CapAmb'].every(k => new RegExp('^' + k + ':\\s+0+$', 'm').test(status)),
    cgroup: fs.readFileSync('/proc/' + pid + '/cgroup', 'utf8').trim() };
}
function snapshot() {
  const pm2Pid = manager(), pm2 = identity(pm2Pid);
  check(pm2.uid.every(x => x === 0), 'OBSERVE_PM2_UID');
  const rows = command('/usr/bin/ps', ['-eo', 'pid=,uid=,gid=,args=']).split('\n')
    .map(x => x.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
    .filter(x => x[4] === 'node ' + ROOT + '/index.js');
  check(rows.length === 1, 'OBSERVE_API_COUNT');
  const api = identity(Number(rows[0][1]));
  check(api.ppid === pm2Pid && api.uid.every(x => x === 997) && api.gid.every(x => x === 997), 'OBSERVE_API_IDENTITY');
  check(api.capabilitiesZero && api.cgroup.split('\n').some(x => x.endsWith('/system.slice/pm2-root.service')), 'OBSERVE_API_CONFINEMENT');
  const hashes = {};
  for (const file of ['index.js', 'package.json', 'package-lock.json']) hashes[file] = hash(fs.readFileSync(ROOT + '/' + file));
  return { bootId: fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(), pm2, api, hashes };
}
function protectedBytes(filename, maxBytes) {
  let cursor = '/';
  for (const piece of filename.slice(1).split('/')) {
    cursor = path.posix.join(cursor, piece);
    const st = fs.lstatSync(cursor);
    check(st.uid === 0 && !st.isSymbolicLink() && (st.mode & 0o022) === 0, 'OBSERVE_FILE_PATH');
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    check(st.isFile() && st.nlink === 1 && st.uid === 0 && (st.mode & 0o022) === 0 && st.size <= maxBytes, 'OBSERVE_FILE');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
}
function summarizeDump(bytes) {
  let value; try { value = JSON.parse(bytes); } catch { throw new Error('OBSERVE_DUMP_JSON'); }
  check(Array.isArray(value) && value.length > 0 && value.length <= 50, 'OBSERVE_DUMP_LIST');
  const safe = value.map(x => {
    check(x && typeof x === 'object' && typeof x.name === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x.name), 'OBSERVE_DUMP_NAME');
    // Output a closed projection only. The dump contains environment secrets.
    return { name: x.name, isSmartplate: x.name === 'smartplate-api',
      expectedScript: x.pm_exec_path === ROOT + '/index.js', expectedCwd: x.pm_cwd === ROOT,
      uid997: x.uid === 997 || x.uid === '997', gid997: x.gid === 997 || x.gid === '997',
      forkMode: x.exec_mode === 'fork_mode', autorestart: x.autorestart === true,
      interpreterIsNode: x.exec_interpreter === 'node' || x.exec_interpreter === '/usr/bin/node' };
  });
  check(new Set(safe.map(x => x.name)).size === safe.length && safe.filter(x => x.isSmartplate).length === 1, 'OBSERVE_DUMP_APPS');
  return { sha256: hash(bytes), processCount: safe.length, definitions: safe };
}
function compareDumps(primaryBytes, fallbackBytes) {
  // Validate both before comparing; never return arbitrary keys or field values.
  summarizeDump(primaryBytes); summarizeDump(fallbackBytes);
  const primary = JSON.parse(primaryBytes), fallback = JSON.parse(fallbackBytes);
  const metadata = new Set(['pm_uptime', 'created_at', 'restart_time', 'unstable_restarts', 'status', 'exit_code', 'vizion_running']);
  const knownConfig = new Set(['env', 'args', 'node_args', 'pm_cwd', 'pm_exec_path', 'exec_interpreter',
    'uid', 'gid', 'exec_mode', 'autorestart', 'watch', 'ignore_watch', 'cron_restart', 'min_uptime',
    'max_restarts', 'restart_delay', 'exp_backoff_restart_delay', 'max_memory_restart', 'kill_timeout',
    'listen_timeout', 'wait_ready', 'instance_var', 'merge_logs', 'pm_out_log_path', 'pm_err_log_path',
    'source_map_support', 'disable_source_map_support', 'filter_env', 'namespace',
    'axm_monitor', 'axm_options', 'axm_actions', 'axm_dynamic', 'node_version', 'version',
    'versioning', 'pm_id', 'pm_pid_path', 'pm_log_path', 'km_link', 'unique_id', 'prev_restart_delay']);
  const byName = new Map(fallback.map(x => [x.name, x]));
  const sameProcessNames = primary.length === fallback.length && primary.every(x => byName.has(x.name));
  const sameProcessOrder = isDeepStrictEqual(primary.map(x => x.name), fallback.map(x => x.name));
  const differences = [];
  for (const a of primary) {
    const b = byName.get(a.name); if (!b) continue;
    const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter(k => Object.hasOwn(a, k) !== Object.hasOwn(b, k) || !isDeepStrictEqual(a[k], b[k]));
    differences.push({ name: a.name, changedFieldCount: changed.length,
      metadataFields: changed.filter(k => metadata.has(k)).sort(),
      configurationFields: changed.filter(k => knownConfig.has(k)).sort(),
      unclassifiedFieldCount: changed.filter(k => !metadata.has(k) && !knownConfig.has(k)).length,
      monitorComparison: changed.includes('axm_monitor') ? compareMonitor(a.axm_monitor, b.axm_monitor) : null });
  }
  return { sameProcessNames, sameProcessOrder, identicalJson: isDeepStrictEqual(primary, fallback),
    onlyListedMetadataDiffers: sameProcessNames && sameProcessOrder && differences.some(x => x.changedFieldCount > 0) &&
      differences.every(x => x.configurationFields.length === 0 && x.unclassifiedFieldCount === 0),
    differences, completeSavedPm2PolicyVerified: false };
}
function compareMonitor(a, b) {
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (!object(a) || !object(b)) return { comparable: false, onlyMetricValuesDiffer: false };
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  let addedOrRemovedMetrics = 0, changedValues = 0, changedDefinitions = 0;
  for (const key of keys) {
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) { addedOrRemovedMetrics++; continue; }
    const left = a[key], right = b[key];
    if (isDeepStrictEqual(left, right)) continue;
    const scalar = x => x === null || ['string', 'number', 'boolean'].includes(typeof x);
    if (!object(left) || !object(right) || !Object.hasOwn(left, 'value') || !Object.hasOwn(right, 'value') ||
      !scalar(left.value) || !scalar(right.value)) { changedDefinitions++; continue; }
    const definition = x => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'value'));
    if (!isDeepStrictEqual(definition(left), definition(right))) changedDefinitions++;
    if (!isDeepStrictEqual(left.value, right.value)) changedValues++;
  }
  // Metric names and contents may be private. Counts and booleans only.
  return { comparable: true, metricCountPrimary: Object.keys(a).length, metricCountFallback: Object.keys(b).length,
    addedOrRemovedMetrics, changedValues, changedDefinitions,
    onlyMetricValuesDiffer: changedValues > 0 && changedDefinitions === 0 && addedOrRemovedMetrics === 0 };
}
function pm2Files(before) {
  const pid = Number(protectedBytes('/root/.pm2/pm2.pid', 128).toString().trim());
  check(pid === before.pm2.pid, 'OBSERVE_PM2_PID_FILE');
  const primaryBytes = protectedBytes('/root/.pm2/dump.pm2', 4 * 1024 * 1024), primary = summarizeDump(primaryBytes);
  let fallback, fallbackBytes;
  try { fallbackBytes = protectedBytes('/root/.pm2/dump.pm2.bak', 4 * 1024 * 1024); fallback = summarizeDump(fallbackBytes); }
  catch (e) { if (e.code !== 'ENOENT') throw e; fallback = null; }
  return { primary, fallback, identicalBytes: fallback !== null && primary.sha256 === fallback.sha256,
    comparison: fallback === null ? null : compareDumps(primaryBytes, fallbackBytes),
    completeSavedPm2PolicyVerified: false };
}
function fingerprint() { return hash(JSON.stringify(Object.fromEntries(BUNDLE.map(f => [f, hash(fs.readFileSync(path.join(__dirname, f)))])))); }
async function observe(inspectPm2 = false) {
  const startedAt = new Date().toISOString(), before = snapshot();
  const dumpsBefore = inspectPm2 ? pm2Files(before) : null;
  const web = await evidence.collect();
  const after = snapshot();
  check(JSON.stringify(before) === JSON.stringify(after), 'OBSERVE_BASELINE_CHANGED');
  const dumpsAfter = inspectPm2 ? pm2Files(after) : null;
  check(JSON.stringify(dumpsBefore) === JSON.stringify(dumpsAfter), 'OBSERVE_DUMP_CHANGED');
  return { passed: true, mode: 'read-only-observation', startedAt, finishedAt: new Date().toISOString(),
    bundleSha256: fingerprint(), checks: { ...web.checks, uidGid997: true, capabilitiesZero: true, stableProcess: true },
    catalog: web.catalog, sitemap: web.sitemap, baseline: after, pm2Files: dumpsAfter,
    notVerified: ['checkpointVerified', 'offlineModulesVerified', 'candidateLoadedAs997', 'candidateTestsPassed',
      'auditZero', 'baselineUnchangedForRelease', 'timerVerified', 'newHashesMatch', 'oldHashesMatch',
      'oldModulesVerified', 'savedPm2997', 'timerStopped', 'rollbackServiceInactive'],
    productionExecutionEnabled: false, releaseAuthorized: false, osBootTested: false,
    applicationBusinessFlowsTested: false };
}
async function main(args) {
  if (args.length === 1 && args[0] === '--bundle-hash') return console.log(fingerprint());
  check((args.length === 1 && args[0] === '--observe') ||
    (args.length === 2 && args[0] === '--inspect-pm2' && /^[a-f0-9]{64}$/.test(args[1])), 'OBSERVE_USAGE');
  check(process.platform === 'linux', 'OBSERVE_LINUX_REQUIRED');
  if (args[0] === '--inspect-pm2') {
    check(process.getuid() === 0, 'OBSERVE_ROOT_REQUIRED');
    check(args[1] === fingerprint(), 'OBSERVE_BUNDLE_HASH');
  }
  console.log(JSON.stringify(await observe(args[0] === '--inspect-pm2'), null, 2));
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  // Never echo HTTP bodies, environment, PM2 dump contents, or arbitrary error text.
  const code = /^(?:OBSERVE|HEALTH|CATALOG|SITEMAP|PRIVATE|HTTP)_[A-Z_]+$/.test(error.message) ? error.message : 'OBSERVE_READ_FAILED';
  console.error(JSON.stringify({ passed: false, code })); process.exitCode = 1;
});
module.exports = { identity, summarizeDump, compareDumps, compareMonitor, snapshot, fingerprint, observe, main };
