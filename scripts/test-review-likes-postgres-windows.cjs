'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile,spawn}=require('node:child_process'),{promisify}=require('node:util'),{randomBytes}=require('node:crypto');
const run=promisify(execFile),root=path.resolve(__dirname,'..');
const bin=process.env.PG_TEST_BIN || path.join(root,'.local/pg-tools/node_modules/@embedded-postgres/windows-x64/native/bin');
async function main() {
  if(process.platform!=='win32')throw Error('This runner requires Windows');
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-review-likes-'));
  const prefix=path.join(path.resolve(os.tmpdir()),'smartplate-review-likes-');
  const data=path.join(temporary,'data'),pwfile=path.join(temporary,'password'),password=randomBytes(24).toString('hex');
  const options={windowsHide:true,maxBuffer:1024*1024,timeout:60000};let started=false;
  try {
    await fs.writeFile(pwfile,password+'\n',{mode:0o600});
    await run(path.join(bin,'initdb.exe'),['-D',data,'--username=like_test','--auth=scram-sha-256','--pwfile='+pwfile,'--no-locale','-E','UTF8'],options);await fs.unlink(pwfile);
    await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(temporary,'postgres.log'),'-o','-c listen_addresses=127.0.0.1 -c shared_buffers=16MB -c max_connections=12 -p 59480','-w','start'],options);started=true;
    const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'server/node_modules/vitest/vitest.mjs'),'run','__tests__/review-likes.test.mjs','--maxWorkers=1','--no-file-parallelism'],{cwd:path.join(root,'server'),windowsHide:true,stdio:'inherit',env:{...process.env,REVIEW_LIKES_TEST_PASSWORD:password}});child.once('error',reject);child.once('exit',resolve);});
    if(code!==0)throw Error('Review-like tests failed: '+code);
    console.log('REVIEW_LIKES_NATIVE_POSTGRES_OK');
  } finally {
    if(started)await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','immediate','-w','stop'],options);
    if(!path.resolve(temporary).startsWith(prefix))throw Error('Unsafe temporary cleanup path');
    await fs.rm(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
