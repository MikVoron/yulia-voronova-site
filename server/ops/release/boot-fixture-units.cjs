'use strict';
// Runtime unit templates for the FIXED fixture namespace, never pm2-root.service.
const { layout, environment, ENV, PM2 } = require('./integrated-contract.cjs');
function units(id, name) {
  const p = layout(id, name), prepare = p.prepare;
  const command = action => '/usr/bin/env -i PATH=' + ENV.PATH + ' LANG=C /usr/bin/flock --exclusive --wait 40 --close ' +
    p.lock + ' /usr/bin/node ' + p.code + '/integrated-rehearsal.cjs --locked ' + id + ' ' + name + ' ' + action + ' none';
  const limits = ['NoNewPrivileges=yes', 'ProtectSystem=strict', 'ReadWritePaths=' + p.dir + ' ' + p.root + '/control',
    'MemoryMax=256M', 'TasksMax=64', 'CPUQuota=50%', 'TimeoutStopSec=5s', 'KillMode=control-group'];
  return {
    [prepare]: ['[Unit]', 'Description=SmartPlate isolated offline startup preparation', '[Service]',
      'Type=oneshot', 'RemainAfterExit=no', 'TimeoutStartSec=60s', ...limits,
      'ExecStart=' + command('boot-prepare'), ''].join('\n'),
    [p.bootManager]: ['[Unit]', 'Description=SmartPlate isolated startup recovery manager',
      'Requires=' + prepare, 'After=' + prepare, 'StartLimitIntervalSec=60s', 'StartLimitBurst=3', '[Service]',
      'Type=exec', 'Restart=on-failure', 'RestartSec=1s', 'TimeoutStartSec=90s', 'RuntimeMaxSec=150s', ...limits,
      // Required dependency checks ordering/failure. This also runs at EVERY
      // service start, including automatic Restart= (dependencies need not rerun).
      'ExecStartPre=' + command('boot-prepare'),
      'ExecStart=/usr/bin/env -i ' + Object.entries(environment(id, name)).map(([k, v]) => k + '=' + v).join(' ') +
        ' /usr/bin/node ' + PM2 + ' resurrect --no-daemon',
      // Failure keeps the gate closed; systemd stops the started manager/cgroup.
      'ExecStartPost=' + command('boot-post'), ''].join('\n')
  };
}
module.exports = { units };
