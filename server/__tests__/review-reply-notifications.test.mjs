import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url), Module=require('node:module');
const owner='11111111-1111-4111-8111-111111111111', actor='22222222-2222-4222-8222-222222222222', admin='33333333-3333-4333-8333-333333333333', blocked='44444444-4444-4444-8444-444444444444';
const mail={sendReviewDiscussionReply:vi.fn()};
let database, app, worker, notifications, tokens;
function mock(file,exports){const id=require.resolve(file),m=new Module(id);m.exports=exports;m.loaded=true;require.cache[id]=m;}
const auth=id=>id?{authorization:'Bearer '+tokens[id]}:{};
const post=(id=actor,requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',review=1)=>app.inject({method:'POST',url:`/content/reviews/${review}/comments`,headers:auth(id),payload:{text:'Новый ответ',requestId}});
const list=(id=owner,query='')=>app.inject({url:'/content/review-reply-notifications'+query,headers:auth(id)});
const settings=(enabled,email)=>app.inject({method:'PUT',url:'/auth/review-reply-settings',headers:auth(owner),payload:{enabled,email}});
const run=()=>worker.dispatch();
const authorReply=()=>app.inject({method:'POST',url:'/admin/reviews/1/reply',headers:auth(admin),payload:{text:'Спасибо!'}});

beforeAll(async()=>{
  if(process.env.REPLY_TEST_PORT){
    const pool=new (require('pg').Pool)({host:'127.0.0.1',port:Number(process.env.REPLY_TEST_PORT),user:'reply_test',database:'postgres',password:process.env.REPLY_TEST_PASSWORD,max:8});
    database={query:(sql,params)=>pool.query(sql,params),pool:{connect:()=>pool.connect()},close:()=>pool.end()};
  }else{
    const {PGlite}=await import('@electric-sql/pglite');const pg=new PGlite();
    database={query:(sql,params)=>pg.query(sql,params),exec:sql=>pg.exec(sql),pool:{connect:async()=>({query:(sql,params)=>pg.query(sql,params),release(){}})},close:()=>pg.close()};
  }
  const exec=database.exec||database.query;
  await exec(`CREATE ROLE smartplate;
    CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text,avatar text,role text DEFAULT 'user',is_blocked boolean DEFAULT false);
    CREATE TABLE recipes(id text PRIMARY KEY,name text,is_published boolean DEFAULT true);
    CREATE TABLE reviews(id serial PRIMARY KEY,recipe_id text REFERENCES recipes(id),user_id uuid REFERENCES users(id),stars int,text text,created_at timestamptz DEFAULT now(),UNIQUE(recipe_id,user_id));
    CREATE TABLE review_avatar_assignments(user_id uuid PRIMARY KEY,position int);
    CREATE TABLE review_replies(review_id int PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,admin_id uuid REFERENCES users(id),text text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE review_reply_reactions(review_id int REFERENCES reviews(id),user_id uuid REFERENCES users(id),created_at timestamptz DEFAULT now());
    INSERT INTO users(id,display_name,email,role,is_blocked) VALUES('${owner}','Мишель','owner@example.test','user',false),('${actor}','Женя','actor@example.test','user',false),('${admin}','Юлия','admin@example.test','admin',false),('${blocked}','Blocked','blocked@example.test','user',true);
    INSERT INTO recipes VALUES('recipe','Томатная овсянка',true),('hidden','Скрытый',false);
    INSERT INTO reviews(recipe_id,user_id,stars,text) VALUES('recipe','${owner}',5,'Мой отзыв'),('hidden','${owner}',4,'Скрытый отзыв');`);
  for(const file of ['041_review_comments.sql','044_review_likes.sql','046_review_reply_notifications.sql','046_review_reply_notifications.sql'])await exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
  mock('../src/db.js',database);mock('../src/email.js',mail);mock('../src/audit.js',{log:async()=>true});
  process.env.JWT_SECRET='isolated-reply-notification-test-secret';
  const jwt=require('jsonwebtoken');tokens=Object.fromEntries([owner,actor,admin,blocked].map(id=>[id,jwt.sign({sub:id,role:id===admin?'admin':'user'},process.env.JWT_SECRET,{expiresIn:'15m'})]));
  notifications=require('../src/review-reply-notifications');worker=notifications.service({database,mail,log:{error:vi.fn()}});
  app=require('fastify')({logger:false});
  await app.register(require('@fastify/cors'),{origin:'https://plate.voronova.online',methods:['GET','POST','PUT','DELETE','OPTIONS']});
  await app.register(require('../src/routes/content'),{reviewReplyMaintenance:false});await app.ready();
},30000);
afterAll(async()=>{await app?.close();await database?.close();});
beforeEach(async()=>{
  await database.query('TRUNCATE review_comments,review_replies,review_reply_notifications RESTART IDENTITY CASCADE');
  await database.query('UPDATE users SET notify_review_replies=true,email_review_replies=true,is_blocked=false');
  await database.query("UPDATE recipes SET is_published=(id='recipe')");
  await database.query('UPDATE users SET is_blocked=true WHERE id=$1',[blocked]);
  mail.sendReviewDiscussionReply.mockReset();mail.sendReviewDiscussionReply.mockResolvedValue({messageId:'fixture-smtp-id'});
});
describe('reply notification transactions, privacy and delivery',()=>{
  it('distinguishes safe temporary retries, permanent rejections and uncertain delivery',()=>{
    expect(notifications.failureStatus({responseCode:451})).toBe('pending');
    expect(notifications.failureStatus({code:'ECONNREFUSED'})).toBe('pending');
    expect(notifications.failureStatus({code:'ETIMEDOUT',command:'CONN'})).toBe('pending');
    expect(notifications.failureStatus({responseCode:550})).toBe('failed');
    expect(notifications.failureStatus({code:'ECONNRESET',command:'DATA'})).toBe('uncertain');
  });
  it('stops retrying after the bounded number of temporary failures',async()=>{
    await post();await database.query('UPDATE review_reply_notifications SET attempts=7');
    mail.sendReviewDiscussionReply.mockRejectedValue(Object.assign(new Error('fixture busy'),{responseCode:451}));
    await run();await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);
    expect((await database.query('SELECT email_status,attempts FROM review_reply_notifications')).rows[0]).toEqual({email_status:'failed',attempts:8});
  });
  it('defaults both channels on without changing like preferences or backfilling old replies',async()=>{
    expect((await app.inject({url:'/auth/review-reply-settings',headers:auth(owner)})).json()).toEqual({enabled:true,email:true});
    expect((await database.query('SELECT email_review_likes FROM users WHERE id=$1',[owner])).rows[0].email_review_likes).toBe(false);
    expect((await list()).json().items).toEqual([]);await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
  });
  it('does not enqueue an old admin reply when it is edited after migration',async()=>{
    await database.query('INSERT INTO review_replies(review_id,admin_id,text) VALUES(1,$1,$2)',[admin,'Старый ответ']);
    expect((await authorReply()).statusCode).toBe(200);expect((await list()).json().items).toHaveLength(0);
    await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
  });
  it('notifies the review owner about participant and Julia replies, never other participants',async()=>{
    expect((await post()).statusCode).toBe(201);
    expect((await post(admin,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).statusCode).toBe(201);
    expect((await list()).json().items.map(x=>x.actor)).toEqual(['Юлия','Женя']);
    expect((await list(actor)).json().items).toEqual([]);expect((await list(admin)).json().items).toEqual([]);
    await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(2);
    expect(mail.sendReviewDiscussionReply.mock.calls[0][0]).toBe('owner@example.test');
    expect(mail.sendReviewDiscussionReply.mock.calls[0][1]).toMatchObject({recipe_id:'recipe',review_id:1,actor:'Женя',reply_text:'Новый ответ'});
    await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(2);
  });
  it('does not notify for self replies, edits, or repeated create requests',async()=>{
    await post(owner);expect((await list()).json().items).toHaveLength(0);
    const response=await post(actor,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');const id=response.json().comment.id;
    expect((await post(actor,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).statusCode).toBe(200);
    expect((await app.inject({method:'PUT',url:'/content/review-comments/'+id,headers:auth(actor),payload:{text:'Исправлено'}})).statusCode).toBe(200);
    expect((await list()).json().items).toHaveLength(1);await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);
    expect(mail.sendReviewDiscussionReply.mock.calls[0][1].reply_text).toBe('Исправлено');
  });
  it('keeps both paths atomic when notification insertion fails',async()=>{
    const connect=database.pool.connect;
    database.pool.connect=async()=>{const client=await connect.call(database.pool);return {release:()=>client.release(),query:(sql,args)=>sql.includes('INSERT INTO review_reply_notifications')?Promise.reject(new Error('fixture insert failure')):client.query(sql,args)};};
    try {
      expect((await post()).statusCode).toBe(500);expect((await authorReply()).statusCode).toBe(500);
      expect((await database.query('SELECT count(*)::int AS n FROM review_comments')).rows[0].n).toBe(0);
      expect((await database.query('SELECT count(*)::int AS n FROM review_replies')).rows[0].n).toBe(0);
    }finally{database.pool.connect=connect;}
  });
  it('respects separate email opt-out and does not replay accumulated replies',async()=>{
    expect((await settings(true,false)).statusCode).toBe(200);await post();
    expect((await list()).json().items).toHaveLength(1);await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
    await settings(true,true);await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
    await settings(false,true);await post(admin,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect((await list()).json().items).toHaveLength(0);await settings(true,true);
    expect((await list()).json().items).toHaveLength(1);
    expect((await database.query('SELECT email_review_likes FROM users WHERE id=$1',[owner])).rows[0].email_review_likes).toBe(false);
  });
  it('cancels pending mail when disabled and keeps cabinet notifications',async()=>{
    await post();await settings(true,false);await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
    expect((await list()).json().items).toHaveLength(1);
  });
  it('retries explicit temporary SMTP rejection and does not retry after success',async()=>{
    await post();mail.sendReviewDiscussionReply.mockRejectedValueOnce(Object.assign(new Error('fixture smtp busy'),{code:'EENVELOPE',responseCode:451}));
    await run();expect((await database.query('SELECT email_status,attempts FROM review_reply_notifications')).rows[0]).toEqual({email_status:'pending',attempts:1});
    await database.query('UPDATE review_reply_notifications SET due_at=now()');await run();await run();
    expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(2);
    expect((await database.query('SELECT email_status,message_id FROM review_reply_notifications')).rows[0]).toEqual({email_status:'sent',message_id:'fixture-smtp-id'});
  });
  it('does not resend ambiguous post-DATA errors or expired sending leases',async()=>{
    await post();mail.sendReviewDiscussionReply.mockRejectedValueOnce(Object.assign(new Error('fixture disconnected'),{code:'ECONNRESET',command:'DATA'}));
    await run();await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);
    expect((await database.query('SELECT email_status FROM review_reply_notifications')).rows[0].email_status).toBe('uncertain');
    await database.query("UPDATE review_reply_notifications SET email_status='sending',lease_until=now()-interval '1 second'");await run();
    expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);
  });
  it('does not resend after SMTP acceptance if saving the receipt fails',async()=>{
    await post();const adapter={...database,query:async(sql,args)=>{if(sql.includes("email_status='sent'"))throw new Error('fixture receipt write failure');return database.query(sql,args);}};
    await notifications.service({database:adapter,mail,log:{error:vi.fn()}}).dispatch();await run();
    expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);expect((await database.query('SELECT email_status FROM review_reply_notifications')).rows[0].email_status).toBe('uncertain');
  });
  it('hides deleted messages and unpublished recipes and suppresses blocked recipients',async()=>{
    const result=await post();await database.query('UPDATE users SET is_blocked=true WHERE id=$1',[owner]);await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
    await database.query('UPDATE users SET is_blocked=false WHERE id=$1',[owner]);
    await app.inject({method:'DELETE',url:'/content/review-comments/'+result.json().comment.id,headers:auth(actor)});
    expect((await list()).json().items).toHaveLength(0);
    await post(actor,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');await database.query("UPDATE recipes SET is_published=false WHERE id='recipe'");await run();expect(mail.sendReviewDiscussionReply).not.toHaveBeenCalled();
  });
  it('authorizes reads and acknowledgements; preserves pagination and unread state',async()=>{
    expect((await list(null)).statusCode).toBe(401);expect((await list(blocked)).statusCode).toBe(403);
    await post();const id=(await list()).json().items[0].id;
    const read=user=>app.inject({method:'POST',url:'/content/review-reply-notifications/read',headers:auth(user),payload:{ids:[id]}});
    await read(actor);expect((await list(owner,'?unread=true&all=1')).json().items).toHaveLength(1);
    await read(owner);expect((await list(owner,'?unread=true&all=1')).json().items).toHaveLength(0);
    expect((await list()).json().items).toHaveLength(1);expect((await list(owner,'?before='+id)).json().items).toHaveLength(0);
    expect((await list(owner,'?before=1e0')).statusCode).toBe(400);expect((await settings('yes',true)).statusCode).toBe(400);
    const preflight=await app.inject({method:'OPTIONS',url:'/auth/review-reply-settings',headers:{origin:'https://plate.voronova.online','access-control-request-method':'PUT'}});expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
  });
  it.skipIf(!process.env.REPLY_TEST_PORT)('handles concurrent create retries, admin saves and two dispatch workers',async()=>{
    const responses=await Promise.all(Array.from({length:6},()=>post()));
    expect(responses.map(r=>r.statusCode).sort()).toEqual([200,200,200,200,200,201]);
    const replies=await Promise.all(Array.from({length:6},()=>authorReply()));
    expect(replies.every(r=>r.statusCode===200)).toBe(true);expect((await list()).json().items).toHaveLength(2);
    await Promise.all([run(),run()]);expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(2);
  });
  it('creates the admin reply and its event atomically and keeps edits silent',async()=>{
    expect((await authorReply()).statusCode).toBe(200);expect((await authorReply()).statusCode).toBe(200);
    expect((await list()).json().items).toMatchObject([{actor:'Юлия',reply_id:1,comment_id:null}]);
    await run();expect(mail.sendReviewDiscussionReply).toHaveBeenCalledTimes(1);
  });
});
