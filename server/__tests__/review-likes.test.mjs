import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
const require = createRequire(import.meta.url), Module = require('module');
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', admin='33333333-3333-4333-8333-333333333333', blocked='44444444-4444-4444-8444-444444444444';
let pg, app, tokens;
const mail={sendReviewLike:vi.fn()};
function mock(file, exports) { const resolved=require.resolve(file), entry=new Module(resolved); entry.exports=exports; entry.loaded=true; require.cache[resolved]=entry; }
// The runner creates a password-protected disposable cluster. No .env or production DB.
const native = Boolean(process.env.REVIEW_LIKES_TEST_PASSWORD);
describe.skipIf(!native)('review likes: native PostgreSQL, real HTTP authorization and concurrent requests', () => {
  beforeAll(async () => {
    pg=new (require('pg').Pool)({host:'127.0.0.1',port:59480,user:'like_test',password:process.env.REVIEW_LIKES_TEST_PASSWORD,database:'postgres',max:6});
    await pg.query(`CREATE ROLE smartplate;
      CREATE TABLE users(id uuid PRIMARY KEY, display_name text, email text, avatar text, role text DEFAULT 'user', is_blocked boolean DEFAULT false, early_access_member boolean DEFAULT false, review_friend_badge boolean DEFAULT false);
      CREATE TABLE recipes(id text PRIMARY KEY, name text, is_published boolean DEFAULT true);
      CREATE TABLE reviews(id serial PRIMARY KEY, recipe_id text REFERENCES recipes(id), user_id uuid REFERENCES users(id), stars int, text text, created_at timestamptz DEFAULT now(), UNIQUE(recipe_id,user_id));
      CREATE TABLE review_avatar_assignments(user_id uuid, position int);
      CREATE TABLE review_replies(review_id int PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,admin_id uuid REFERENCES users(id) ON DELETE SET NULL,text text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
      CREATE TABLE review_reply_reactions(review_id int REFERENCES reviews(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id),created_at timestamptz DEFAULT now(),PRIMARY KEY(review_id,user_id));
      INSERT INTO users(id,display_name,email,role,is_blocked) VALUES ('${owner}','Анна','owner@example.test','user',false),('${other}','Мария','other@example.test','user',false),('${admin}','Юлия','admin@example.test','admin',false),('${blocked}','Blocked','blocked@example.test','user',true);
      INSERT INTO recipes VALUES ('recipe','Каша',true),('hidden','Скрытый',false);
      INSERT INTO reviews(recipe_id,user_id,stars,text) VALUES ('recipe','${owner}',5,'Отзыв'),('hidden','${other}',4,'Hidden');
      INSERT INTO review_replies(review_id,admin_id,text) VALUES (1,'${admin}','Ответ Юлии');
      INSERT INTO review_reply_reactions(review_id,user_id) VALUES (1,'${owner}');`);
    await pg.query(await fs.readFile(new URL('../migrations/041_review_comments.sql',import.meta.url),'utf8'));
    await pg.query(`INSERT INTO review_comments(review_id,user_id,text,request_id) VALUES(1,'${other}','Ответ участника','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`);
    const migration=await fs.readFile(new URL('../migrations/044_review_likes.sql',import.meta.url),'utf8');
    await pg.query(migration); await pg.query(migration);
    expect((await pg.query('SELECT count(*)::int AS n FROM review_likes WHERE reply_id=1')).rows[0].n).toBe(1);
    expect((await pg.query('SELECT count(*)::int AS n FROM review_like_notifications')).rows[0].n).toBe(0);
    mock('../src/db.js',{query:(sql,params)=>pg.query(sql,params),pool:pg});
    mock('../src/email.js',mail);mock('../src/audit.js',{log:async()=>true});
    process.env.JWT_SECRET='isolated-review-like-test-secret';
    const {generateAccessToken}=require('../src/auth');
    tokens=Object.fromEntries([owner,other,admin,blocked].map(id=>[id,generateAccessToken({id,email:'fixture@example.test',role:id===admin?'admin':'user'})]));
    app=require('fastify')({logger:false});
    await app.register(require('@fastify/cors'),{origin:'https://plate.voronova.online',methods:['GET','POST','PUT','DELETE','OPTIONS']});
    await app.register(require('../src/routes/content'));
    await app.ready();
  },30000);
  afterAll(async()=>{await app?.close();await pg?.end();});
  beforeEach(async()=>{
    await pg.query('TRUNCATE review_likes CASCADE');
    await pg.query('UPDATE users SET notify_review_likes=true,email_review_likes=false');
    mail.sendReviewLike.mockReset();mail.sendReviewLike.mockResolvedValue(true);
  });
  const auth=id=>id?{authorization:'Bearer '+tokens[id]}:{};
  const like=(id=other,type='review',target=1,active=true)=>app.inject({method:'PUT',url:`/content/review-likes/${type}/${target}`,headers:auth(id),payload:{active}});
  const notifications=id=>app.inject({url:'/content/review-like-notifications',headers:auth(id)});
  const settings=(id,enabled,email)=>app.inject({method:'PUT',url:'/auth/review-like-settings',headers:auth(id),payload:{enabled,email}});
  it('denies guests and blocked users, validates requests and hides missing/unpublished targets',async()=>{
    expect((await like(null)).statusCode).toBe(401);expect((await like(blocked)).statusCode).toBe(403);
    for(const [type,target] of [['bad',1],['__proto__',1],['review','1e0'],['review','0'],['review','2147483648']])expect((await like(other,type,target)).statusCode).toBe(400);
    expect((await like(other,'review',999)).statusCode).toBe(404);expect((await like(owner,'review',2)).statusCode).toBe(404);
    expect((await app.inject({method:'PUT',url:'/content/review-likes/review/1',headers:auth(other),payload:{active:'true'}})).statusCode).toBe(400);
  });
  it('lets users and admins like all three target types without changing rating aggregates',async()=>{
    for(const type of ['review','comment','reply']) {
      expect((await like(other,type)).json()).toEqual({likeCount:1,likedByCurrentUser:true});
      expect((await like(admin,type)).json()).toEqual({likeCount:2,likedByCurrentUser:true});
    }
    expect((await pg.query('SELECT count(*)::int AS n,sum(stars)::int AS stars FROM reviews')).rows[0]).toEqual({n:2,stars:9});
    expect((await notifications(owner)).json().items).toHaveLength(2);
    expect((await notifications(admin)).json().items).toHaveLength(1); // admin's own like is silent
    expect((await notifications(other)).json().items).toHaveLength(1);
    expect(mail.sendReviewLike).not.toHaveBeenCalled();
  });
  it('makes parallel PUTs and retries idempotent; re-likes never create another notification',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>like()));
    for(const result of results)expect(result.json()).toEqual({likeCount:1,likedByCurrentUser:true});
    expect((await notifications(owner)).json().items).toHaveLength(1);
    expect((await like(other,'review',1,false)).json()).toEqual({likeCount:0,likedByCurrentUser:false});
    expect((await notifications(owner)).json().items).toHaveLength(0);
    await like();await like();
    expect((await notifications(owner)).json().items).toHaveLength(1);
    expect((await pg.query('SELECT count(*)::int AS n FROM review_like_notifications')).rows[0].n).toBe(1);
    await like(owner);expect((await notifications(owner)).json().items).toHaveLength(1);
  });
  it('persists independent settings, prevents other users from reading or acknowledging notifications',async()=>{
    expect((await app.inject({url:'/auth/review-like-settings',headers:auth(owner)})).json()).toEqual({enabled:true,email:false});
    expect((await settings(owner,false,true)).json()).toEqual({enabled:false,email:true});await like();
    expect((await notifications(owner)).json().items).toEqual([]);expect(mail.sendReviewLike).not.toHaveBeenCalled();
    await settings(owner,true,false);await like(admin);
    const item=(await notifications(owner)).json().items[0];
    expect((await notifications(other)).json().items).toEqual([]);
    const read=id=>app.inject({method:'POST',url:`/content/review-like-notifications/${item.id}/read`,headers:auth(id)});
    expect((await read(other)).statusCode).toBe(404);expect((await read(owner)).statusCode).toBe(200);expect((await read(owner)).statusCode).toBe(200);
    expect((await app.inject({url:'/content/review-like-notifications?unread=true',headers:auth(owner)})).json().items).toEqual([]);
    expect((await notifications(owner)).json().items[0].read_at).toBeTruthy();
    expect((await settings(owner,'false',false)).statusCode).toBe(400);
  });
  it('sends opt-in email only once, including on concurrent retry, and survives SMTP failure',async()=>{
    await settings(owner,true,true);await Promise.all([like(),like()]);
    expect(mail.sendReviewLike).toHaveBeenCalledTimes(1);expect(mail.sendReviewLike).toHaveBeenCalledWith('owner@example.test','Каша','recipe','review',1);
    await like(other,'review',1,false);await like();expect(mail.sendReviewLike).toHaveBeenCalledTimes(1);
    mail.sendReviewLike.mockRejectedValueOnce(new Error('SMTP unavailable'));
    expect((await like(admin)).statusCode).toBe(200);expect((await notifications(owner)).json().items).toHaveLength(2);
    await like(admin);expect(mail.sendReviewLike).toHaveBeenCalledTimes(2);
  });
  it('exposes personalized comment likes in initial and paginated reads and cleans up deleted targets',async()=>{
    await like(owner,'comment');
    await like(owner,'reply');await like(owner,'review');
    const reviews=await app.inject({url:'/content/reviews/recipe',headers:auth(owner)});
    expect(reviews.statusCode,reviews.body).toBe(200);
    expect(reviews.json()[0]).toMatchObject({likeCount:1,likedByCurrentUser:true,reply:{likeCount:1,likedByCurrentUser:true},comments:[{likeCount:1,likedByCurrentUser:true}]});
    expect(reviews.body).not.toContain('@example.test');
    const page=await app.inject({url:'/content/reviews/1/comments',headers:auth(owner)});
    expect(page.statusCode,page.body).toBe(200);expect(page.json().comments[0]).toMatchObject({likeCount:1,likedByCurrentUser:true});
    const anonymous=await app.inject({url:'/content/reviews/1/comments'});expect(anonymous.json().comments[0].likedByCurrentUser).toBe(false);
    const summary=await require('../src/review-discussions').discussionSummaries([1],owner);
    expect(summary.get(1).comments[0]).toMatchObject({likeCount:1,likedByCurrentUser:true});
    // Roll back fixture deletion so following tests retain their target.
    const client=await pg.connect();try {await client.query('BEGIN');await client.query('DELETE FROM review_comments WHERE id=1');expect((await client.query('SELECT count(*)::int AS n FROM review_likes WHERE comment_id=1')).rows[0].n).toBe(0);expect((await client.query(`SELECT count(*)::int AS n FROM review_like_notifications WHERE user_id='${other}'`)).rows[0].n).toBe(0);await client.query('ROLLBACK');}finally{client.release();}
  });
  it('paginates notification history without duplicates and grants the application role table access',async()=>{
    await pg.query(`INSERT INTO users(id,display_name,email)
      SELECT ('55555555-5555-4555-8555-'||lpad(i::text,12,'0'))::uuid,'Участник '||i,'test@example.test' FROM generate_series(1,25) i ON CONFLICT DO NOTHING;
      INSERT INTO review_likes(user_id,review_id) SELECT id,1 FROM users WHERE id::text LIKE '55555555-%';
      INSERT INTO review_like_notifications(like_id,user_id) SELECT id,'${owner}' FROM review_likes;`);
    const first=(await notifications(owner)).json();expect(first.items).toHaveLength(20);expect(first.hasMore).toBe(true);
    const second=(await app.inject({url:'/content/review-like-notifications?before='+first.items.at(-1).id,headers:auth(owner)})).json();
    expect(second.items).toHaveLength(5);expect(second.hasMore).toBe(false);
    expect(new Set(first.items.concat(second.items).map(item=>item.id)).size).toBe(25);
    const all=(await app.inject({url:'/content/review-like-notifications?unread=true&all=1',headers:auth(owner)})).json();
    expect(all.items).toHaveLength(25);expect(all.hasMore).toBe(false);
    const ids=first.items.map(item=>Number(item.id));
    expect((await app.inject({method:'POST',url:'/content/review-like-notifications/read',headers:auth(other),payload:{ids}})).statusCode).toBe(200);
    expect((await app.inject({url:'/content/review-like-notifications?unread=true&all=1',headers:auth(owner)})).json().items).toHaveLength(25);
    expect((await app.inject({method:'POST',url:'/content/review-like-notifications/read',headers:auth(owner),payload:{ids}})).statusCode).toBe(200);
    expect((await app.inject({url:'/content/review-like-notifications?unread=true&all=1',headers:auth(owner)})).json().items).toHaveLength(5);
    const grants=await pg.query("SELECT has_table_privilege('smartplate','review_likes','INSERT,SELECT,UPDATE') AS likes, has_sequence_privilege('smartplate','review_like_notifications_id_seq','USAGE') AS notifications");
    expect(grants.rows[0]).toEqual({likes:true,notifications:true});
  });
  it('uses CORS PUT already allowed by the production API',async()=>{
    const source=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');expect(source).toMatch(/methods:\s*\[[^\]]*'PUT'/);
    const preflight=await app.inject({method:'OPTIONS',url:'/content/review-likes/review/1',headers:{origin:'https://plate.voronova.online','access-control-request-method':'PUT'}});
    expect(preflight.statusCode).toBe(204);expect(preflight.headers['access-control-allow-methods']).toContain('PUT');
  });
});
