'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const directory = path.resolve(__dirname, '../tmp/oauth-preview-20261031');
const before = fs.readFileSync(path.join(directory, 'nginx-installed.conf'), 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
if (sha(before) !== '068be481a92fae085e47e6f9dcd6e9f3d5dbaf5512dc94bee3f2badabd7090bc') throw Error('Installed nginx snapshot changed; refresh read-only observation');
let additions = 0;
const after = before.replace(/\b(connect-src|frame-src|child-src)([^;"\n]*)/g, (match, directive, sources) => {
  if (sources.includes('https://id.vk.ru')) return match;
  additions++;
  return directive + sources + ' https://id.vk.ru';
});
if (additions !== 6 || after.replaceAll(' https://id.vk.ru', '') !== before) throw Error('Unexpected CSP change scope');
fs.writeFileSync(path.join(directory, 'nginx-onetap-candidate.conf'), after);
const report = { marker: 'OAUTH_CSP_CANDIDATE_READY', installedSha256: sha(before), candidateSha256: sha(after), additions, permittedOrigin: 'https://id.vk.ru', applied: false, nginxConfigTested: false };
fs.writeFileSync(path.join(directory, 'nginx-candidate-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
