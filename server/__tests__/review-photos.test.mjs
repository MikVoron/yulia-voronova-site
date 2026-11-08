import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url);
const Module=require('module');
const sharp=require('sharp');
const testSocket=process.env.REVIEW_PHOTOS_TEST_SOCKET;
const testData=process.env.REVIEW_PHOTOS_TEST_DATA;
const nativeTest=Boolean(testSocket || testData);
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333',blocked='44444444-4444-4444-8444-444444444444';
let pg,database,photos,files,app,directory,jpeg,tokens,queue=Promise.resolve();
const mail={sendReviewPhotoNotification:vi.fn()};
function mock(file,exports) { const resolved=require.resolve(file);const entry=new Module(resolved);entry.exports=exports;entry.loaded=true;require.cache[resolved]=entry; }
beforeAll(async()=>{
    let nativePool;
    if(nativeTest){
      if(testSocket && !/^\/tmp\/smartplate-review-photos\.[A-Za-z0-9]+\/socket$/.test(testSocket))throw new Error('Only the disposable photo-test socket is allowed');
      if(testData && (!path.resolve(testData).startsWith(path.join(path.resolve(os.tmpdir()),'smartplate-review-photos-')) || !process.env.REVIEW_PHOTOS_TEST_PASSWORD))throw new Error('Only a password-protected disposable local photo-test cluster is allowed');
      nativePool=new (require('pg').Pool)({host:testSocket || '127.0.0.1',port:59479,user:testSocket ? process.env.USER : 'photo_test',password:testSocket ? undefined : process.env.REVIEW_PHOTOS_TEST_PASSWORD,database:'postgres',max:4});
      pg={query:(sql,params)=>nativePool.query(sql,params),exec:sql=>nativePool.query(sql),close:()=>nativePool.end()};
    }else pg=new PGlite();
    await pg.exec(`CREATE ROLE smartplate;
      CREATE TABLE users(id uuid PRIMARY KEY,display_name text,role text DEFAULT 'user',is_blocked boolean DEFAULT false);
      CREATE TABLE recipes(id text PRIMARY KEY,name text,is_published boolean DEFAULT true);
      CREATE TABLE reviews(id serial PRIMARY KEY,recipe_id text REFERENCES recipes(id),user_id uuid REFERENCES users(id),stars int,UNIQUE(recipe_id,user_id));
      INSERT INTO users(id,display_name,role,is_blocked) VALUES ('${owner}','Анна','user',false),('${other}','Мария','user',false),('${admin}','Юлия','admin',false),('${blocked}','Blocked','user',true);
      INSERT INTO recipes VALUES ('recipe','Каша',true),('recipe-2','Суп',true);
      INSERT INTO reviews(recipe_id,user_id,stars) VALUES ('recipe','${owner}',5),('recipe','${other}',4);`);
    const migration=await fs.readFile(new URL('../migrations/043_review_photos.sql',import.meta.url),'utf8');
    await pg.exec(migration);await pg.exec(migration);
    database={query:(sql,params)=>pg.query(sql,params),pool:{connect:async()=>{
      // PGlite has one session. Serialize test transactions; production uses
      // PostgreSQL advisory/row locks. This is not a multi-process lock test.
      const previous=queue;let release;queue=new Promise(resolve=>{release=resolve;});await previous;
      return {query:database.query,release};
    }}};
    if(nativePool)database.pool=nativePool;
    mock('../src/db.js',database);mock('../src/audit.js',{log:async()=>true});mock('../src/email.js',mail);
    files=require('../src/review-photo-storage');
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-photo-test-'));
    process.env.REVIEW_PHOTOS_DIR=directory;process.env.JWT_SECRET='isolated-review-photo-test-secret-20261108';
    await files.prepare();
    photos=require('../src/review-photos').service({database,files,mail});
    const {generateAccessToken}=require('../src/auth');
    tokens=Object.fromEntries([owner,other,admin,blocked].map(id=>[id,generateAccessToken({id,email:'test@example.test',role:id===admin?'admin':'user'})]));
    app=require('fastify')({logger:false});
    const {requireAdmin}=require('../src/middleware');
    app.addHook('onRoute',require('../src/admin-route-guard').createAdminRouteGuard(requireAdmin));
    await app.register(require('@fastify/cors'),{origin:'https://plate.voronova.online',methods:['GET','POST','PUT','DELETE','OPTIONS']});
    await app.register(require('../src/routes/review-photos'),{enabled:true,service:photos,maintenance:false});
    await app.ready();
    jpeg=await sharp({create:{width:1800,height:900,channels:3,background:'#e5a560'}}).jpeg().withMetadata({orientation:6}).toBuffer();
},30000);
afterAll(async()=>{
    await app?.close();await pg?.close();
    if(directory){
        const resolved=path.resolve(directory),prefix=path.join(path.resolve(os.tmpdir()),'smartplate-photo-test-');
        if(!resolved.startsWith(prefix))throw new Error('Refusing to remove a directory outside the disposable test prefix');
        await fs.rm(resolved,{recursive:true,force:true});
    }
    delete process.env.REVIEW_PHOTOS_DIR;
});
beforeEach(async()=>{await pg.exec('TRUNCATE review_photos,review_photo_notifications');mail.sendReviewPhotoNotification.mockReset();});
const auth=id=>id?{authorization:'Bearer '+tokens[id]}:{};
const upload=(userId=owner,reviewId=1,requestId=randomUUID(),batchId=randomUUID(),input=jpeg)=>app.inject({method:'PUT',url:`/content/reviews/${reviewId}/photos/${requestId}?batchId=${batchId}`,headers:{...auth(userId),'content-type':'application/octet-stream'},payload:input});
describe('review photos: actual PostgreSQL schema, HTTP permissions, images and storage',()=>{
    it('authenticates uploads before accepting content and checks ownership',async()=>{
        expect((await upload(null)).statusCode).toBe(401);
        expect((await upload(blocked)).statusCode).toBe(403);
        expect((await upload(other)).statusCode).toBe(404);
        expect((await database.query('SELECT count(*)::int AS n FROM review_photos')).rows[0].n).toBe(0);
    });
    it('compresses, rotates, strips metadata, hides pending bytes and lists only permitted photos',async()=>{
        const response=await upload();expect(response.statusCode,response.body).toBe(201);
        const {photo}=response.json();expect(photo.status).toBe('pending');expect(photo.width).toBe(600);expect(photo.height).toBe(1200);
        const main=await files.read(photo.id,'main'),meta=await sharp(main).metadata();
        expect(meta.format).toBe('webp');expect(meta.exif).toBeUndefined();expect(meta.orientation).toBeUndefined();
        expect((await sharp(await files.read(photo.id,'thumb')).metadata()).height).toBe(320);
        for(const id of [null,other,blocked])expect((await app.inject({url:photo.url,headers:auth(id)})).statusCode).toBe(404);
        for(const id of [owner,admin]){const view=await app.inject({url:photo.url,headers:auth(id)});expect(view.statusCode).toBe(200);expect(view.headers['cache-control']).toContain('no-store');}
        expect((await app.inject({url:'/content/review-photos?reviewIds=1'})).json().photos).toEqual([]);
        expect((await app.inject({url:'/content/review-photos?reviewIds=1',headers:auth(owner)})).json().photos).toHaveLength(1);
    },15000);
    it('approves only as a current admin; revocation and deletion invalidate the direct URL',async()=>{
        const {photo}= (await upload()).json();
        const action=id=>app.inject({method:'PUT',url:'/admin/review-photos/'+photo.id,headers:auth(id),payload:{status:'approved'}});
        expect((await action(other)).statusCode).toBe(403);expect((await action(null)).statusCode).toBe(401);
        expect((await action(admin)).statusCode).toBe(200);
        expect((await app.inject({url:photo.url})).statusCode).toBe(200);
        expect((await app.inject({method:'PUT',url:'/admin/review-photos/'+photo.id,headers:auth(admin),payload:{status:'rejected',reason:'Другое блюдо'}})).statusCode).toBe(200);
        expect((await app.inject({url:photo.url})).statusCode).toBe(404);
        await expect(files.read(photo.id,'main')).rejects.toMatchObject({code:'ENOENT'});
        expect((await photos.list([1],owner))[0].reason).toBe('Другое блюдо');
        expect((await app.inject({method:'DELETE',url:'/content/review-photos/'+photo.id,headers:auth(other)})).statusCode).toBe(404);
        expect((await app.inject({method:'DELETE',url:'/content/review-photos/'+photo.id,headers:auth(owner)})).statusCode).toBe(200);
        expect(await photos.list([1],owner)).toEqual([]);
    },15000);
    it('makes retries idempotent, rejects different content for a nonce and caps active photos at three',async()=>{
        const requestId=randomUUID(),batchId=randomUUID();
        const first=await upload(owner,1,requestId,batchId);expect(first.statusCode,first.body).toBe(201);
        const retry=await upload(owner,1,requestId,batchId);expect(retry.statusCode).toBe(200);expect(retry.json().photo.id).toBe(first.json().photo.id);
        expect((await upload(owner,1,requestId,batchId,Buffer.from('different'))).statusCode).toBe(409);
        expect((await upload(owner,1,randomUUID(),batchId)).statusCode).toBe(201);
        expect((await upload(owner,1,randomUUID(),batchId)).statusCode).toBe(201);
        expect((await upload()).statusCode).toBe(409);
        expect((await database.query('SELECT count(*)::int AS n FROM review_photo_notifications')).rows[0].n).toBe(1);
        expect((await database.query('SELECT count(*)::int AS n,avg(stars)::float AS avg FROM reviews')).rows[0]).toEqual({n:2,avg:4.5});
    },25000);
    it('rejects malformed and oversized files and UUID/path tricks',async()=>{
        for(const bytes of [Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.from('GIF89a'),Buffer.from([255,216,255,0,1])])expect((await upload(owner,1,randomUUID(),randomUUID(),bytes)).statusCode).toBe(422);
        expect((await upload(owner,1,randomUUID(),randomUUID(),Buffer.alloc(files.MAX_INPUT+1))).statusCode).toBe(413);
        expect((await app.inject({url:'/content/review-photos/not-a-uuid/main'})).statusCode).toBe(400);
        expect((await app.inject({url:'/content/review-photos?reviewIds=1,2147483648'})).statusCode).toBe(400);
        await expect(files.read('../../secret','main')).rejects.toThrow();
    },15000);
    it('retains rejected/deleted submissions in the daily quota and handles review cascade cleanup',async()=>{
        const {photo}=(await upload()).json();
        await database.query(`INSERT INTO review_photos(id,review_id,user_id,request_id,batch_id,input_sha256,status,width,height,bytes,files_deleted_at)
          SELECT gen_random_uuid(),1,$1,gen_random_uuid(),gen_random_uuid(),repeat('a',64),'deleted',1,1,1,now() FROM generate_series(1,11)`,[owner]);
        await photos.remove(photo.id,owner);
        expect((await upload()).statusCode).toBe(429);
        await database.query('DELETE FROM review_photos');
        const second=(await upload()).json().photo;
        await database.query('DELETE FROM reviews WHERE id=1');
        expect((await app.inject({url:second.url,headers:auth(owner)})).statusCode).toBe(404);
        await photos.cleanup();await expect(files.read(second.id,'main')).rejects.toMatchObject({code:'ENOENT'});
        await database.query('INSERT INTO reviews(id,recipe_id,user_id,stars) VALUES (1,\'recipe\',$1,5)',[owner]);
    },20000);
    it('keeps notifications pending after mail failure and sends one notification per batch on retry',async()=>{
        const batch=randomUUID();await upload(owner,1,randomUUID(),batch);await upload(owner,1,randomUUID(),batch);
        await database.query("UPDATE review_photo_notifications SET due_at=now()-interval '1 minute'");
        mail.sendReviewPhotoNotification.mockRejectedValueOnce(new Error('SMTP unavailable'));
        await expect(photos.notifications()).rejects.toThrow('SMTP unavailable');
        await database.query("UPDATE review_photo_notifications SET due_at=now()-interval '1 minute'");
        await photos.notifications();await photos.notifications();
        expect(mail.sendReviewPhotoNotification).toHaveBeenCalledTimes(2);
        expect(mail.sendReviewPhotoNotification).toHaveBeenLastCalledWith('Анна','Каша',2);
        expect((await database.query('SELECT sent_at FROM review_photo_notifications')).rows[0].sent_at).toBeTruthy();
    },20000);
    it('allows the actual upload method and headers through CORS',async()=>{
        const response=await app.inject({method:'OPTIONS',url:`/content/reviews/1/photos/${randomUUID()}`,headers:{origin:'https://plate.voronova.online','access-control-request-method':'PUT','access-control-request-headers':'authorization,content-type'}});
        expect(response.statusCode).toBe(204);expect(response.headers['access-control-allow-methods']).toContain('PUT');
    });
    it.runIf(nativeTest)('bounds concurrent work across PostgreSQL connections and keeps a retry idempotent',async()=>{
        const lock=await database.pool.connect();
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(81743043)');
        try{expect((await upload()).statusCode).toBe(503);}finally{await lock.query('ROLLBACK');lock.release();}
        const request=randomUUID(),batch=randomUUID();
        const results=await Promise.all([upload(owner,1,request,batch),upload(owner,1,request,batch)]);
        expect(results.some(response=>response.statusCode===201)).toBe(true);
        expect(results.every(response=>[200,201,503].includes(response.statusCode))).toBe(true);
        expect((await upload(owner,1,request,batch)).statusCode).toBe(200);
        expect((await database.query('SELECT count(*)::int AS n FROM review_photos')).rows[0].n).toBe(1);
    },20000);
    it('paginates identical creation times without dropping moderation items',async()=>{
        await database.query(`INSERT INTO review_photos(id,review_id,user_id,request_id,batch_id,input_sha256,width,height,bytes)
          SELECT gen_random_uuid(),1,$1,gen_random_uuid(),gen_random_uuid(),repeat('a',64),1,1,1 FROM generate_series(1,33)`,[owner]);
        const first=await photos.queue('pending');expect(first.photos).toHaveLength(30);
        const second=await photos.queue('pending',first.next);expect(second.photos).toHaveLength(3);
        expect(new Set([...first.photos,...second.photos].map(photo=>photo.id)).size).toBe(33);
    });
});
