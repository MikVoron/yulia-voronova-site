'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const baseline=path.resolve(process.argv[2] || '');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const specs=[
  ['server/src/review-photos.js','live-api/review-photos.js','/var/www/smartplate-api/src/review-photos.js'],
  ['server/src/review-photo-results.js',null,'/var/www/smartplate-api/src/review-photo-results.js'],
  ['server/src/routes/review-photos.js','live-api/review-photo-routes.js','/var/www/smartplate-api/src/routes/review-photos.js'],
  ['server/src/email.js','live-api/email.js','/var/www/smartplate-api/src/email.js'],
  ['platform/data-v2.js','live-front/data-v2.js','/var/www/smartplate-platform/data-v2.js'],
  ['platform/admin-review-photos.js','live-front/admin-review-photos.js','/var/www/smartplate-platform/admin-review-photos.js'],
];
const plan={release:'photo-results-20261115',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:[]};
const payload=new Map();
for(const [file,beforePath,target] of specs){
  const data=Buffer.from(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'));
  const old=beforePath?fs.readFileSync(path.join(baseline,beforePath)):null;
  if(old){
    // After committing, the baseline ref remains the checked-out parent.
    const base=execFileSync('git',['show',(process.env.PHOTO_RESULTS_BASE || 'origin/main')+':'+file],{cwd:root,encoding:'utf8'});
    if(base.replaceAll('\r\n','\n')!==old.toString('utf8').replaceAll('\r\n','\n'))throw Error('Production drift: '+file);
  }
  payload.set(file,data);plan.files.push({file,target,before:old?sha(old):null,after:sha(data)});
}
for(const [key,file] of [['migration','server/migrations/045_review_photo_results.sql'],['helper','scripts/photo-result-zhenya.cjs']]){
  const data=Buffer.from(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n'));
  payload.set(file,data);plan[key]={file,sha256:sha(data)};
}
const manifest=Buffer.from(JSON.stringify(plan,null,2)+'\n');
const hash=sha(manifest),out=path.join(root,'.local','photo-results-release-'+hash.slice(0,12));
fs.mkdirSync(out,{recursive:true});
for(const [file,data] of payload){const dest=path.join(out,'runtime',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);}
const installer=Buffer.from(fs.readFileSync(path.join(root,'scripts/install-photo-results.py'),'utf8').replaceAll('\r\n','\n'));
fs.writeFileSync(path.join(out,'install.py'),installer);fs.writeFileSync(path.join(out,'manifest.json'),manifest);
console.log(JSON.stringify({out,manifestSha:hash,installerSha:sha(installer),files:plan.files.length}));
