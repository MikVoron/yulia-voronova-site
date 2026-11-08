'use strict';
// Exercise the Python release checks against real HTTP, without a database or mail.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createRequire}=require('node:module');
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);return i<0?fallback:args[i+1];}
const root=path.resolve(__dirname,'..');
const source=path.resolve(option('--source-root',path.join(root,'server')));
const dependencies=path.resolve(option('--dependencies-root',source));
const installer=path.resolve(option('--installer',path.join(__dirname,'install-review-photos-release.py')));
const python=option('--python',process.platform==='win32'?'python':'python3');
function runPython(code,origin){return new Promise((resolve,reject)=>{
 const child=spawn(python,['-c',code,installer,origin],{stdio:['ignore','pipe','pipe']});let output='',errors='';
 const timer=setTimeout(()=>{child.kill();reject(new Error('Python HTTP fixture timed out'));},25000);
 child.stdout.on('data',part=>{output+=part;});child.stderr.on('data',part=>{errors+=part;});
 child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);if(code)reject(new Error(output+errors));else resolve(output.trim());});
});}
async function main(){
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-photo-release-http-'));let app;
 try{
  const server=path.join(temporary,'app/server');await fs.mkdir(path.join(server,'src/routes'),{recursive:true});
  for(const file of ['src/routes/review-photos.js','src/review-photos.js','src/review-photo-storage.js'])await fs.copyFile(path.join(source,file),path.join(server,file));
  for(const file of ['src/auth.js','src/middleware.js','src/admin-route-guard.js']){
   const preferred=path.join(source,file);await fs.copyFile(await fs.access(preferred).then(()=>preferred,()=>path.join(dependencies,file)),path.join(server,file));
  }
  await fs.symlink(path.join(dependencies,'node_modules'),path.join(server,'node_modules'),process.platform==='win32'?'junction':'dir');
  await fs.writeFile(path.join(server,'src/db.js'),"module.exports={query(){throw Error('Database forbidden in HTTP fixture')}};");
  await fs.writeFile(path.join(server,'src/email.js'),'module.exports={};');
  await fs.writeFile(path.join(server,'src/audit.js'),"module.exports={log(){throw Error('Audit writes forbidden in HTTP fixture')}};");
  process.env.JWT_SECRET='isolated-photo-release-http-fixture-20261108';process.env.REVIEW_PHOTOS_DIR=path.join(temporary,'photos');
  const requireApp=createRequire(path.join(server,'fixture.cjs'));
  app=requireApp('fastify')({logger:false,bodyLimit:8*1024*1024,trustProxy:'127.0.0.1,::1'});
  const {requireAdmin}=requireApp('./src/middleware');app.addHook('onRoute',requireApp('./src/admin-route-guard').createAdminRouteGuard(requireAdmin));
  await app.register(requireApp('@fastify/cors'),{origin:['https://plate.voronova.online'],methods:['GET','POST','PUT','DELETE','OPTIONS'],credentials:true});
  await app.register(requireApp('@fastify/cookie'));await app.register(requireApp('@fastify/compress'),{global:true,threshold:1024});
  await app.register(requireApp('@fastify/helmet'),{contentSecurityPolicy:false,crossOriginEmbedderPolicy:false,crossOriginResourcePolicy:{policy:'cross-origin'},hsts:false,noSniff:false,referrerPolicy:false});
  await app.register(requireApp('@fastify/rate-limit'),{max:100,timeWindow:'1 minute'});
  app.setErrorHandler((error,req,reply)=>reply.code(error.statusCode||500).send({error:error.message,statusCode:error.statusCode||500,code:error.code}));
  const forbidden=()=>{throw Error('Unauthenticated request reached a mutating service method');};
  const service={upload:forbidden,remove:forbidden,moderate:forbidden,queue:forbidden,completeBatch:forbidden,list:async()=>[],image:async()=>{throw Object.assign(new Error('Missing fixture image'),{statusCode:404});}};
  await app.register(requireApp('./src/routes/review-photos'),{enabled:true,service,maintenance:false});
  const origin=await app.listen({host:'127.0.0.1',port:0});
  const code=[
   'import importlib.util,json,sys,urllib.request,urllib.error',
   "spec=importlib.util.spec_from_file_location('release',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);origin=sys.argv[2]",
   "bad=urllib.request.Request(origin+'/content/review-photos/11111111-1111-4111-8111-111111111111',method='DELETE',headers={'Content-Type':'application/json'})",
   'try:',
   ' urllib.request.urlopen(bad,timeout=5);raise AssertionError("Legacy malformed DELETE unexpectedly succeeded")',
   'except urllib.error.HTTPError as error:',
   ' data=json.loads(error.read());assert error.code==400 and data.get("code")=="FST_ERR_CTP_EMPTY_JSON_BODY",data',
   " print('REVIEW_PHOTOS_LEGACY_SMOKE_FAILURE_REPRODUCED status=400 empty_json_body')",
   "original=m.fetch;m.fetch=lambda path,*args,**kwargs:original(origin+path,*args,**{**kwargs,'public':True})",
   'm.smoke_api()',
   "print('REVIEW_PHOTOS_RELEASE_HTTP_OK actualPythonClient=True databaseConnected=False mailSent=False')",
  ].join('\n');
  console.log(await runPython(code,origin));
 }finally{
  await app?.close();
  if(!path.resolve(temporary).startsWith(path.join(path.resolve(os.tmpdir()),'smartplate-photo-release-http-')))throw Error('Unsafe fixture cleanup path');
  await fs.rm(temporary,{recursive:true,force:true});
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
