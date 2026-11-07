const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const [baselineArg, outputArg, base = '1a57cc66'] = process.argv.slice(2);
if (!baselineArg || !outputArg) throw new Error('Usage: node build-seo-navigation-release.cjs BASELINE OUTPUT [BASE_REF]');
const baseline = path.resolve(baselineArg), output = path.resolve(outputArg);
fs.mkdirSync(path.join(output, 'payload'), { recursive: true });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const manifest = { release: 'seo-navigation-20261107', commit: git(['rev-parse','HEAD']).trim(), files: [] };
const patches = [];
const specs = [
  ['server/src/routes/content.js','content.js','/var/www/smartplate-api/src/routes/content.js'],
  ['server/nginx/plate.voronova.online','plate.voronova.online','/etc/nginx/sites-available/plate.voronova.online'],
  ['platform/index-page.js','index-page.js','/var/www/smartplate-platform/index-page.js'],
  ['platform/index.html','index.html','/var/www/smartplate-platform/index.html'],
];
for (const [source, name, target] of specs) {
  const original = fs.readFileSync(path.join(baseline, name));
  let text = original.toString('utf8').replace(/\r\n/g, '\n');
  if (source === 'platform/index.html') {
    const regex = /index-page\.js\?v=[^"\s]+/g;
    if ([...text.matchAll(regex)].length !== 1) throw new Error('Unexpected homepage script references');
    const before = text.match(regex)[0];
    text = text.replace(regex, 'index-page.js?v=20261107-server-navigation');
    patches.push({ source, before, after: 'index-page.js?v=20261107-server-navigation' });
  } else {
    const diff = git(['diff', '--no-ext-diff', '--unified=3', base, '--', source]);
    const hunks = [];
    let hunk;
    for (const line of diff.split('\n')) {
      if (line.startsWith('@@')) { hunk = { before: '', after: '' }; hunks.push(hunk); continue; }
      if (!hunk || ![' ','+','-'].includes(line[0])) continue;
      if (line[0] !== '+') hunk.before += line.slice(1) + '\n';
      if (line[0] !== '-') hunk.after += line.slice(1) + '\n';
    }
    if (!hunks.length) throw new Error(`No scoped patch for ${source}`);
    for (const change of hunks) {
      if (text.split(change.before).length !== 2) throw new Error(`Production drift overlaps patch: ${source}`);
      text = text.replace(change.before, () => change.after);
      patches.push({ source, ...change });
    }
  }
  fs.writeFileSync(path.join(output, 'payload', name), text);
  manifest.files.push({ source, name, target, before: sha(original), after: sha(text) });
}
const moduleSource = fs.readFileSync(path.join(root, 'server/src/home-seo.js'));
fs.writeFileSync(path.join(output, 'payload/home-seo.js'), moduleSource);
manifest.files.push({ source:'server/src/home-seo.js', name:'home-seo.js',
  target:'/var/www/smartplate-api/src/home-seo.js', before:null, after:sha(moduleSource) });
for (const [src, dest] of [
  ['server/migrate-bulgur-photo-paths-20261107.sql','bulgur.sql'],
  ['scripts/install-seo-navigation-20261107.py','install.py'],
  ['scripts/rehearse-seo-navigation-20261107.py','rehearse.py'],
]) fs.copyFileSync(path.join(root,src),path.join(output,dest));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'reviewed-deltas.json'),JSON.stringify(patches,null,2)+'\n');
const files = ['manifest.json','reviewed-deltas.json','bulgur.sql','install.py','rehearse.py', ...manifest.files.map(x=>'payload/'+x.name)];
fs.writeFileSync(path.join(output,'SHA256SUMS'),files.map(file=>`${sha(fs.readFileSync(path.join(output,file)))}  ${file}`).join('\n')+'\n');
console.log(JSON.stringify({output,commit:manifest.commit,files:manifest.files.length,patches:patches.length}));
