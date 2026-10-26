'use strict';
// Actual PostgreSQL, actual route handlers and JWT middleware. Disposable cluster only.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const socket = process.env.REVIEW_DISCUSSIONS_TEST_SOCKET || '';
assert.match(socket, /^\/tmp\/smartplate-review-discussions\.[A-Za-z0-9]+\/socket$/);
const root = path.resolve(__dirname, '..');
const config = { host: socket, port: 59474, user: process.env.USER, database: 'postgres', max: 4 };
const bootstrap = new Pool(config);
let pool, app;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const blocked = '44444444-4444-4444-8444-444444444444';
function mock(file, exports) {
  const resolved = require.resolve(path.join(root, 'server/src', file));
  const entry = new Module(resolved); entry.exports = exports; entry.loaded = true; require.cache[resolved] = entry;
}
async function run() {
  await bootstrap.query(`CREATE ROLE smartplate;
    CREATE TABLE users (id uuid PRIMARY KEY, email text, display_name text, avatar text, role text NOT NULL DEFAULT 'user', is_blocked boolean DEFAULT false);
    CREATE TABLE reviews (id serial PRIMARY KEY, recipe_id text NOT NULL, user_id uuid REFERENCES users(id), stars int NOT NULL CHECK(stars BETWEEN 1 AND 5), text text, created_at timestamptz DEFAULT now(), UNIQUE(recipe_id,user_id));
    CREATE TABLE review_avatar_assignments(user_id uuid PRIMARY KEY REFERENCES users(id), position bigint UNIQUE);
    CREATE TABLE review_avatar_counter(id int PRIMARY KEY, next_position bigint);
    INSERT INTO review_avatar_counter VALUES(1,0);
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartplate;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartplate;`);
  await bootstrap.query('INSERT INTO users(id,email,display_name,role,is_blocked) VALUES ($1,\'owner@example.test\',\'Анна\',\'user\',false),($2,\'other@example.test\',NULL,\'user\',false),($3,\'admin@example.test\',\'Юлия\',\'admin\',false),($4,\'blocked@example.test\',NULL,\'user\',true)', [owner,other,admin,blocked]);
  await bootstrap.query('INSERT INTO reviews(recipe_id,user_id,stars,text,created_at) VALUES (\'recipe\',$1,4,\'Первый опыт\',\'2026-01-01\'),(\'recipe\',$2,5,\'Отлично\',\'2026-01-02\')', [owner,other]);
  for (const file of ['023_review_replies.sql','024_review_reply_reactions.sql','041_review_comments.sql','041_review_comments.sql']) {
    await bootstrap.query(fs.readFileSync(path.join(root,'server/migrations',file),'utf8'));
  }
  await bootstrap.query('INSERT INTO review_replies(review_id,admin_id,text) VALUES (1,$1,\'Совет Юлии\')', [admin]);
  await bootstrap.query('INSERT INTO review_reply_reactions(review_id,user_id) VALUES (1,$1)', [owner]);
  pool = new Pool({ ...config, options: '-c role=smartplate' });
  mock('db.js', { pool, query: (sql, params) => pool.query(sql, params) });
  mock('audit.js', { log: async () => {} });
  process.env.JWT_SECRET = 'isolated-review-discussion-test-secret-20261026';
  const { generateAccessToken } = require('../server/src/auth');
  const { registerDiscussionRoutes, discussionSummaries } = require('../server/src/review-discussions');
  app = require('fastify')({ logger: false }); registerDiscussionRoutes(app); await app.ready();
  const tokens = Object.fromEntries([owner,other,admin,blocked].map(id=>[id,generateAccessToken({id,email:'test@example.test',role:id===admin?'admin':'user'})]));
  async function request(method, url, id, payload) {
    return app.inject({method,url,headers:id ? {authorization:'Bearer '+tokens[id]} : {},payload});
  }
  const before = (await pool.query('SELECT AVG(stars)::text AS avg, COUNT(*)::int AS count FROM reviews')).rows[0];
  let response = await request('POST','/content/reviews/1/comments',null,{text:'test',requestId:randomUUID()}); assert.equal(response.statusCode,401);
  response = await request('POST','/content/reviews/1/comments',blocked,{text:'test',requestId:randomUUID()}); assert.equal(response.statusCode,403);
  for (const text of ['', '   ', 'x'.repeat(1001), 23, {}]) {
    response = await request('POST','/content/reviews/1/comments',owner,{text,requestId:randomUUID()}); assert.equal(response.statusCode,400);
  }
  response = await request('POST','/content/reviews/0/comments',owner,{text:'x',requestId:randomUUID()}); assert.equal(response.statusCode,400);
  response = await request('POST','/content/reviews/999/comments',owner,{text:'x',requestId:randomUUID()}); assert.equal(response.statusCode,404);
  response = await request('GET','/content/reviews/999/comments'); assert.equal(response.statusCode,404);
  response = await request('GET','/content/reviews/1/comments?after=bad'); assert.equal(response.statusCode,400);
  const nonce = randomUUID();
  const concurrent = await Promise.all([1,2].map(()=>request('POST','/content/reviews/1/comments',other,{text:'Можно заменить муку?',requestId:nonce})));
  assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,201]);
  const comment = concurrent[0].json().comment;
  assert.equal(comment.author,'Аноним'); assert.match(comment.avatar,/avocado\.svg$/); assert.equal(comment.isAuthor,false);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM review_comments')).rows[0].n,1);
  response = await request('POST','/content/reviews/2/comments',other,{text:'Другой отзыв',requestId:nonce}); assert.equal(response.statusCode,409);
  response = await request('POST','/content/reviews/1/comments',admin,{text:'Да, замените.',requestId:randomUUID()}); assert.equal(response.statusCode,201); assert.equal(response.json().comment.isAuthor,true);
  response = await request('PATCH','/content/review-comments/'+comment.id,owner,{text:'Чужая правка',role:'admin'}); assert.equal(response.statusCode,404);
  response = await request('PATCH','/content/review-comments/'+comment.id,other,{text:'А рисовой мукой?'}); assert.equal(response.statusCode,200);
  response = await request('DELETE','/content/review-comments/'+comment.id,owner); assert.equal(response.statusCode,404);
  let summaries = await discussionSummaries([1,2]); assert.equal(summaries.get(1).commentCount,2); assert.equal(summaries.get(2).commentCount,0);
  assert.equal(summaries.get(1).comments[0].text,'А рисовой мукой?');
  for (let i=0;i<25;i++) await pool.query('INSERT INTO review_comments(review_id,user_id,request_id,text) VALUES(1,$1,$2,$3)',[owner,randomUUID(),'Дополнение '+i]);
  summaries = await discussionSummaries([1]); assert.equal(summaries.get(1).comments.length,5); assert.equal(summaries.get(1).commentCount,27);
  response = await request('GET','/content/reviews/1/comments'); assert.equal(response.statusCode,200); assert.equal(response.json().comments.length,20); assert.equal(response.json().hasMore,true);
  const firstPage = response.json().comments;
  assert.equal('email' in firstPage[0],false);
  response = await request('GET','/content/reviews/1/comments?after='+firstPage.at(-1).id); assert.equal(response.json().comments.length,7); assert.equal(response.json().hasMore,false);
  assert.equal(response.json().comments.some(c=>firstPage.some(p=>p.id===c.id)),false);
  assert.deepEqual((await pool.query('SELECT AVG(stars)::text AS avg, COUNT(*)::int AS count FROM reviews')).rows[0],before);
  // Execute the actual review upsert SQL to verify editing retains its timestamp and thread.
  const content = fs.readFileSync(path.join(root,'server/src/routes/content.js'),'utf8');
  const sql = content.match(/`(INSERT INTO reviews \(recipe_id, user_id, stars, text\)[\s\S]*?RETURNING \*)`/)[1];
  await pool.query(sql,['recipe',owner,5,'Изменила мнение',true]);
  await pool.query(sql,['recipe',owner,3,null,false]);
  const review = (await pool.query('SELECT * FROM reviews WHERE id=1')).rows[0];
  assert.equal(review.text,'Изменила мнение'); assert.equal(review.stars,3); assert.equal(review.created_at.toISOString(),'2026-01-01T00:00:00.000Z');
  assert.equal((await discussionSummaries([1])).get(1).commentCount,27);
  assert.equal((await pool.query('SELECT text FROM review_replies WHERE review_id=1')).rows[0].text,'Совет Юлии');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM review_reply_reactions')).rows[0].n,1);
  response = await request('DELETE','/content/review-comments/'+comment.id,admin); assert.equal(response.statusCode,200);
  const ownComment = (await pool.query('SELECT id FROM review_comments WHERE user_id=$1 LIMIT 1',[owner])).rows[0].id;
  response = await request('DELETE','/content/review-comments/'+ownComment,owner); assert.equal(response.statusCode,200);
  await pool.query('DELETE FROM reviews WHERE id=1');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM review_comments')).rows[0].n,0);
  console.log('REVIEW_DISCUSSIONS_POSTGRES_OK engine=native-multiconnection: migration rerun, least-privilege grants, real JWT auth, blocked user, validation, retry deduplication, author avatars, ownership, admin moderation, pagination, unchanged ratings, review editing, preserved legacy replies/reactions, cascade');
}
run().catch(error=>{ console.error(error); process.exitCode=1; }).finally(async()=>{ if(app) await app.close(); if(pool) await pool.end(); await bootstrap.end(); });
