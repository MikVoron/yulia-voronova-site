'use strict';
// Package exact Git blobs from the committed release, never a dirty working copy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'tmp/review-discussions-release-20261026'));
const oldHashes = {
 'server/src/routes/content.js':'196b9e5bb4940c2e85dff1878cf48269801eff9639f4f6e92156cc733d69b012',
 'server/src/review-discussions.js':null,
 'server/migrations/041_review_comments.sql':null,
 'platform/recipe-page.js':'2d823e77a16e8ce49f7a5e7923183dd4f54088cca4f356a9df91fa19aae40df0',
 'platform/recipe.html':'67df3d6c6850a29b2a94ba66761c309cc982270d06b3bd3ccc67daac4bf4d742',
 'platform/category-page.js':'00d4d289d52d9bc1601e89daa544d51064ab889047e7cbcc15b16a7025fcf05a',
 'platform/category.html':'b7de83be62743fe744bd4db8a99fe8cef85ddbad3656716c04f5773b25512d09',
 'platform/ingredient-page.js':'530dbfcb81e62361e71fd0a213056877311f4bf33d2a3eea40fd917111dd9797',
 'platform/ingredient.html':'7f9c26de2c2cba2bea8f85f1933fb664252c7e167219910d7cf562b4f4218355',
 'platform/review-discussions.js':null,
 'platform/review-discussions.css':null,
};
const git = args => execFileSync('git', args, {cwd:root});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const commit = git(['rev-parse','HEAD']).toString().trim();
if(git(['status','--porcelain','--untracked-files=no']).toString().trim())throw Error('Commit the release before packaging');
fs.mkdirSync(output,{recursive:true});
const files=[];
for(const [name,old] of Object.entries(oldHashes)){
 const body=git(['show','HEAD:'+name]);
 const destination=path.join(output,'payload',name);
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,body);
 files.push({path:name,old_sha256:old,new_sha256:sha(body)});
}
for(const name of ['install-review-discussions-20261026.py','test-review-discussions-release.py']){
 fs.writeFileSync(path.join(output,name),git(['show','HEAD:scripts/'+name]));
}
const manifest={release:'review-discussions-20261026',commit,files,
 installer_sha256:sha(fs.readFileSync(path.join(output,'install-review-discussions-20261026.py')))};
const body=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(output,'manifest.json'),body);
console.log(JSON.stringify({output,commit,files:files.length,manifest_sha256:sha(body),installer_sha256:manifest.installer_sha256}));
