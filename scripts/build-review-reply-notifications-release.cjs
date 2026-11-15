'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.local/review-reply-release'),pkg=path.join(out,'package');
const release='review-reply-notifications-20261115';
const api=['server/src/review-reply-notifications.js','server/src/email.js','server/src/review-discussions.js','server/src/routes/content.js'];
const web=['data-v2.js','review-reply-settings.js','cabinet.html','admin.html','auth-callback.html','category.html','index.html','ingredient.html','login.html','recipe-editor.html','recipe.html'];
const targets=Object.fromEntries(api.map(f=>[f,'/var/www/smartplate-api/'+f.slice(7)]).concat(web.map(f=>['platform/'+f,'/var/www/smartplate-platform/'+f])));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const git=args=>execFileSync('git',args,{cwd:root});
const code=`import pathlib,json,base64\npaths=${JSON.stringify(targets)}\nprint(json.dumps({k:base64.b64encode(pathlib.Path(v).read_bytes()).decode() if pathlib.Path(v).is_file() else None for k,v in paths.items()}))\n`;
const live=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','smartplate-admin@5.42.119.198','python3 -'],{input:code,encoding:'utf8',maxBuffer:8*1024*1024}));
fs.mkdirSync(pkg,{recursive:true});
const rows=[];
const drift=[];
for(const [file,target] of Object.entries(targets)){
  const actual=live[file]===null?null:Buffer.from(live[file],'base64');
  const added=['server/src/review-reply-notifications.js','platform/review-reply-settings.js'].includes(file);
  let expected=added?null:git(['show',(file==='server/src/review-discussions.js'?'05266277':'fb458036')+':'+file]);
  // Preserve the already-served author-badge cache marker, verified separately
  // from the original Git baseline; it changes only these two asset references.
  if(['platform/recipe.html','platform/category.html','platform/ingredient.html'].includes(file)) {
    expected=Buffer.from(expected.toString().replace(/(review-discussions\.(?:js|css)\?v=)20261115-reply-recipient/g,'$120261115-author-badge'));
  }
  if(file==='platform/recipe.html')expected=Buffer.from(expected.toString().replace('recipe-page.js?v=20261115-reply-recipient','recipe-page.js?v=20261115-author-badge'));
  if(expected===null?actual!==null:!actual?.equals(expected))drift.push(file);
  if(expected){const original=path.join(out,'git-baseline',file);fs.mkdirSync(path.dirname(original),{recursive:true});fs.writeFileSync(original,expected);}
  const source=git(['show','HEAD:'+file]);
  if(!Buffer.from(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).equals(source))throw Error('Uncommitted runtime change: '+file);
  const dest=path.join(pkg,'runtime',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,source);
  if(actual){const baseline=path.join(out,'baseline',file);fs.mkdirSync(path.dirname(baseline),{recursive:true});fs.writeFileSync(baseline,actual);}
  rows.push({file,target,before:actual?sha(actual):null,after:sha(source)});
}
if(drift.length)throw Error('Production drift; compare saved baselines: '+drift.join(', '));
const migration='server/migrations/046_review_reply_notifications.sql';
const migrationBytes=git(['show','HEAD:'+migration]);
fs.mkdirSync(path.dirname(path.join(pkg,'runtime',migration)),{recursive:true});fs.writeFileSync(path.join(pkg,'runtime',migration),migrationBytes);
const installer=git(['show','HEAD:scripts/install-review-reply-notifications.py']);
fs.writeFileSync(path.join(pkg,'install-review-reply-notifications.py'),installer);
fs.mkdirSync(path.join(pkg,'__tests__'),{recursive:true});fs.writeFileSync(path.join(pkg,'__tests__/test_install_review_reply_notifications.py'),git(['show','HEAD:scripts/__tests__/test_install_review_reply_notifications.py']));
const manifest={release,commit:git(['rev-parse','HEAD']).toString().trim(),files:rows,installer_sha256:sha(installer),migration:{file:migration,sha256:sha(migrationBytes)}};
const body=Buffer.from(JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(pkg,'manifest.json'),body);
const manifestSha=sha(body),remote='/home/smartplate-admin/release-staging/'+release;
fs.writeFileSync(path.join(pkg,'run.sh'),'#!/bin/bash\nset -euo pipefail\nexec /usr/bin/python3 '+remote+'/install-review-reply-notifications.py --manifest-sha '+manifestSha+'\n');
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({release,commit:manifest.commit,manifestSha,remote,files:rows.length},null,2));
console.log('REPLY_RELEASE_PACKAGE_READY '+JSON.stringify({commit:manifest.commit,manifestSha,files:rows.length,productionBaselineVerified:true}));
