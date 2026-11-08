'use strict';
// A temporary native PostgreSQL cluster: no service installation, production
// connection strings or mail. Only loopback TCP + a random one-run password.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile,spawn}=require('node:child_process'),{promisify}=require('node:util');
const {randomBytes}=require('node:crypto');
const net=require('node:net');
const run=promisify(execFile),root=path.resolve(__dirname,'..');
const bin=path.join(root,'.local/pg-tools/node_modules/@embedded-postgres/windows-x64/native/bin');
async function main(){
  if(process.platform!=='win32')throw new Error('Use test-review-photos-postgres.sh on Linux');
  const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(59479,'127.0.0.1',resolve);});await new Promise(resolve=>probe.close(resolve));
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-review-photos-'));
  const resolved=path.resolve(temporary),prefix=path.join(path.resolve(os.tmpdir()),'smartplate-review-photos-');
  if(!resolved.startsWith(prefix))throw new Error('Unexpected temporary cluster path');
  const data=path.join(temporary,'data'),pwfile=path.join(temporary,'password'),password=randomBytes(24).toString('hex');
  const options={windowsHide:true,maxBuffer:1024*1024,timeout:60000};
  let started=false;
  try{
    await fs.writeFile(pwfile,password+'\n',{mode:0o600});
    await run(path.join(bin,'initdb.exe'),['-D',data,'--username=photo_test','--auth=scram-sha-256','--pwfile='+pwfile,'--no-locale','-E','UTF8'],options);
    await fs.unlink(pwfile);
    await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-l',path.join(temporary,'postgres.log'),'-o',"-c listen_addresses=127.0.0.1 -c shared_buffers=16MB -c max_connections=10 -p 59479",'-w','start'],options);
    started=true;
    const exit=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--max-old-space-size=256',path.join(root,'server/node_modules/vitest/vitest.mjs'),'run','__tests__/review-photos.test.mjs','--maxWorkers=1','--no-file-parallelism','--silent','--reporter=json','--outputFile=../.local/photo-native-report.json'],{
        cwd:path.join(root,'server'),windowsHide:true,stdio:'inherit',
        env:{...process.env,REVIEW_PHOTOS_TEST_DATA:data,REVIEW_PHOTOS_TEST_PASSWORD:password},
      });
      child.once('error',reject);child.once('exit',code=>resolve(code));
    });
    if(exit!==0)throw new Error('Native PostgreSQL photo tests failed: '+exit);
    console.log('REVIEW_PHOTOS_NATIVE_POSTGRES_OK');
  }finally{
    if(started)await run(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','immediate','-w','stop'],options);
    if(!path.resolve(temporary).startsWith(prefix))throw new Error('Unsafe temporary cleanup path');
    await fs.rm(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
