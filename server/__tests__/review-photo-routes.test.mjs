import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url),Module=require('module');
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333',blocked='44444444-4444-4444-8444-444444444444';
let app,disabledApp,temporary,tokens,role='admin';
const photos={upload:vi.fn(),list:vi.fn(),image:vi.fn(),remove:vi.fn(),moderate:vi.fn(),queue:vi.fn(),completeBatch:vi.fn()};
const id=randomUUID(),requestId=randomUUID(),batchId=randomUUID();
function mock(file,exports){const resolved=require.resolve(file),entry=new Module(resolved);entry.exports=exports;entry.loaded=true;require.cache[resolved]=entry;}
beforeAll(async()=>{
    mock('../src/db.js',{query:async(sql,params)=>({rows:sql.includes('SELECT is_blocked')?[{is_blocked:params[0]===blocked}]:[{role:params[0]===admin?role:'user'}]})});
    mock('../src/audit.js',{log:async()=>true});mock('../src/email.js',{});
    process.env.JWT_SECRET='isolated-photo-route-secret-20261108';
    temporary=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-photo-route-'));
    process.env.REVIEW_PHOTOS_DIR=temporary;
    const {generateAccessToken}=require('../src/auth');
    tokens=Object.fromEntries([owner,other,admin,blocked].map(id=>[id,generateAccessToken({id,email:'fixture@example.test',role:id===admin?'admin':'user'})]));
    const {requireAdmin}=require('../src/middleware');
    app=require('fastify')({logger:false});app.addHook('onRoute',require('../src/admin-route-guard').createAdminRouteGuard(requireAdmin));
    await app.register(require('../src/routes/review-photos'),{enabled:true,service:photos,maintenance:false});await app.ready();
    disabledApp=require('fastify')({logger:false});await disabledApp.register(require('../src/routes/review-photos'),{enabled:false,service:photos});await disabledApp.ready();
});
afterAll(async()=>{
    await app?.close();await disabledApp?.close();
    if(temporary){const resolved=path.resolve(temporary);if(!resolved.startsWith(path.join(path.resolve(os.tmpdir()),'smartplate-photo-route-')))throw new Error('Unsafe test cleanup');await fs.rm(resolved,{recursive:true,force:true});}
    delete process.env.REVIEW_PHOTOS_DIR;
});
beforeEach(()=>{Object.values(photos).forEach(fn=>fn.mockReset());role='admin';photos.upload.mockResolvedValue({photo:{id,status:'pending'},repeated:false});photos.list.mockResolvedValue([]);photos.image.mockResolvedValue(Buffer.from('webp-fixture'));photos.queue.mockResolvedValue({photos:[],pendingCount:0,next:null});});
const headers=userId=>userId?{authorization:'Bearer '+tokens[userId]}:{};
const upload=userId=>app.inject({method:'PUT',url:`/content/reviews/1/photos/${requestId}?batchId=${batchId}`,headers:{...headers(userId),'content-type':'application/octet-stream'},payload:Buffer.from('image-fixture')});
describe('photo HTTP routes without expensive database/browser processes',()=>{
    it('keeps the feature off without exposing upload endpoints',async()=>{
        expect((await disabledApp.inject({url:'/content/review-photos/config'})).json().enabled).toBe(false);
        expect((await disabledApp.inject({method:'PUT',url:`/content/reviews/1/photos/${requestId}`,headers:headers(owner)})).statusCode).toBe(404);
    });
    it('rejects unauthenticated and blocked uploads before calling the service',async()=>{
        expect((await upload(null)).statusCode).toBe(401);expect((await upload(blocked)).statusCode).toBe(403);expect(photos.upload).not.toHaveBeenCalled();
    });
    it('passes binary data intact and reports an idempotent retry',async()=>{
        const first=await upload(owner);expect(first.statusCode,first.body).toBe(201);
        expect(photos.upload.mock.calls[0][0]).toEqual({reviewId:1,userId:owner,requestId,batchId,input:Buffer.from('image-fixture')});
        photos.upload.mockResolvedValue({photo:{id,status:'pending'},repeated:true});expect((await upload(owner)).statusCode).toBe(200);
    });
    it('bounds incoming requests and releases admission slots after completion',async()=>{
        let release;const gate=new Promise(resolve=>{release=resolve;});photos.upload.mockImplementation(()=>gate);
        const first=upload(owner).then(value=>value),second=upload(other).then(value=>value);
        for(let i=0;i<100&&photos.upload.mock.calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
        expect(photos.upload).toHaveBeenCalledTimes(2);
        const third=await upload(owner);expect(third.statusCode).toBe(503);
        release({photo:{id,status:'pending'},repeated:false});expect((await first).statusCode).toBe(201);expect((await second).statusCode).toBe(201);
        expect((await upload(owner)).statusCode).toBe(201);
    });
    it('translates limits and expected busy errors into useful messages',async()=>{
        photos.upload.mockRejectedValue(Object.assign(new Error('Фото обрабатывается. Повторите позже.'),{statusCode:503}));
        const busy=await upload(owner);expect(busy.statusCode).toBe(503);expect(busy.headers['retry-after']).toBe('5');
        const oversized=await app.inject({method:'PUT',url:`/content/reviews/1/photos/${requestId}?batchId=${batchId}`,headers:{...headers(owner),'content-type':'application/octet-stream'},payload:Buffer.alloc(20*1024*1024+1)});
        expect(oversized.statusCode).toBe(413);expect(oversized.json().error).toContain('20 МБ');
    });
    it('validates addresses and private response caching',async()=>{
        expect((await app.inject({url:'/content/review-photos/not-a-uuid/main'})).statusCode).toBe(400);
        expect((await app.inject({url:'/content/review-photos/'+id+'/bad'})).statusCode).toBe(404);
        const image=await app.inject({url:'/content/review-photos/'+id+'/main',headers:headers(owner)});
        expect(image.statusCode).toBe(200);expect(image.headers['cache-control']).toContain('no-store');expect(image.headers['x-content-type-options']).toBe('nosniff');
        expect(photos.image).toHaveBeenCalledWith(id,'main',owner);
        expect((await app.inject({url:'/content/review-photos?reviewIds=1,2',headers:headers(owner)})).statusCode).toBe(200);expect(photos.list).toHaveBeenCalledWith([1,2],owner);
    });
    it('uses the current database role for administrator decisions',async()=>{
        const decision=userId=>app.inject({method:'PUT',url:'/admin/review-photos/'+id,headers:headers(userId),payload:{status:'approved'}});
        expect((await decision(owner)).statusCode).toBe(403);expect((await decision(admin)).statusCode).toBe(200);
        role='user';expect((await decision(admin)).statusCode).toBe(403);
        expect(photos.moderate).toHaveBeenCalledTimes(1);
    });
    it('validates moderation fields, queue cursor and completion before calling the service',async()=>{
        expect((await app.inject({method:'PUT',url:'/admin/review-photos/'+id,headers:headers(admin),payload:{status:'pending'}})).statusCode).toBe(400);
        expect((await app.inject({url:'/admin/review-photos?after=invalid',headers:headers(admin)})).statusCode).toBe(400);
        expect((await app.inject({method:'POST',url:`/content/reviews/1/photo-batches/${batchId}/complete`,headers:headers(owner)})).statusCode).toBe(200);
        expect(photos.completeBatch).toHaveBeenCalledWith(1,owner,batchId);
    });
});
