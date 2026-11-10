'use strict';
// Requires a disposable Unix-socket PostgreSQL instance, never the live database.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { Pool } = require('pg');
const socket = process.env.LOGIN_UX_TEST_SOCKET || '';
if (!/^\/tmp\/smartplate-login-ux\.[A-Za-z0-9]+\/socket$/.test(socket)) throw Error('Disposable test socket required');
const db = new Pool({host:socket,port:59473,user:'smartplate-admin',database:'postgres',max:2});
const routeFile = path.resolve(process.argv[2]);
const replacements = {
  '../db': {query:(sql, params)=>db.query(sql, params)},
  '../middleware': {requireAdmin:async req=>{req.user={sub:'test-admin'};}},
  '../email': {}, '../audit': {}, '../early-access': {}
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === routeFile && Object.hasOwn(replacements, request)) return replacements[request];
  return originalLoad.call(this, request, parent, isMain);
};
const app = require('fastify')({logger:false});
(async()=>{
  try {
    await db.query(`CREATE TABLE users(id serial PRIMARY KEY, email text UNIQUE);
      CREATE TABLE audit_log(id serial PRIMARY KEY, user_id integer, email text, event text,
        detail text, ip text, created_at timestamptz NOT NULL DEFAULT now());`);
    const rows = [
      ['pending@example.com','auth_code_sent',{purpose:'registration'}],
      ['pending@example.com','auth_code_rejected',{reason:'INVALID_CODE'}],
      ['pending@example.com','auth_code_sent',{purpose:'registration'}],
      ['completed@example.com','auth_code_sent',{purpose:'registration'}],
      ['deleted@example.com','auth_code_sent',{purpose:'registration'}],
      ['deleted@example.com','register','email'],
      ['login@example.com','auth_code_sent',{purpose:'login'}],
      ['second@example.com','auth_code_sent',{purpose:'registration'}],
      ['oauth@example.com','auth_code_sent',{purpose:'registration'}],
      ['unrelated@example.com','login','non-JSON legacy detail']
    ];
    for (let i=0;i<rows.length;i++) {
      const [email,event,detail] = rows[i];
      await db.query('INSERT INTO audit_log(email,event,detail,created_at) VALUES($1,$2,$3,$4)',
        [email,event,typeof detail === 'object' ? JSON.stringify(detail) : detail,new Date(Date.UTC(2026,10,10,8,0,i))]);
    }
    await db.query("INSERT INTO users(email) VALUES('completed@example.com'),('oauth@example.com')");
    await app.register(require(routeFile));
    await app.ready();
    const pending = await app.inject('/admin/audit?event=registration_incomplete&limit=1');
    assert.equal(pending.statusCode,200,pending.body);
    assert.equal(pending.json().total,2);
    assert.equal(pending.json().hasMore,true);
    assert.deepEqual(pending.json().rows.map(r=>r.email),['second@example.com']);
    const next = (await app.inject('/admin/audit?event=registration_incomplete&limit=1&page=2')).json();
    assert.equal(next.total,2);
    assert.equal(next.hasMore,false);
    assert.equal(next.rows[0].id,3,'Resends must produce one row for the latest email');
    const sent = (await app.inject('/admin/audit?event=auth_code_sent')).json();
    assert.equal(sent.total,7);
    assert.equal((await app.inject('/admin/audit?event=not-an-event')).statusCode,400);
    await db.query("INSERT INTO users(email) VALUES('pending@example.com')");
    assert.equal((await app.inject('/admin/audit?event=registration_incomplete')).json().total,1);
    await db.query("INSERT INTO audit_log(email,event,detail) VALUES('second@example.com','register','email')");
    assert.equal((await app.inject('/admin/audit?event=registration_incomplete')).json().total,0);
    console.log('REGISTRATION_AUDIT_POSTGRES_OK: resend deduplication, pagination, existing login, deleted accounts, OAuth, later completion and legacy non-JSON events');
  } finally {
    await app.close();
    await db.end();
    Module._load = originalLoad;
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
