'use strict';
// Run only against a disposable PostgreSQL instance supplied by the companion runner.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const { Pool } = require('pg');
const routeFile = path.resolve(process.argv[2]);
const socket = process.env.LOGIN_UX_TEST_SOCKET || '';
if (!/^\/tmp\/smartplate-login-ux\.[A-Za-z0-9]+\/socket$/.test(socket)) throw Error('Disposable socket directory required');
const db = new Pool({host:socket,port:59473,user:'smartplate-admin',database:'postgres',max:4});
const originalLoad = Module._load;
const sent=[];
let sequence=100000;
const replacements={
  '../db':{query:(sql,params)=>db.query(sql,params)},
  '../auth':{generateAccessToken:()=> 'isolated-access-token',generateRefreshToken:()=>crypto.randomBytes(24).toString('hex'),hashToken:v=>v,verifyAccessToken:()=>({}),generateLoginCode:()=>String(++sequence)},
  '../refresh-sessions':{issueRefreshSession:async()=> 'isolated-session'},
  '../email':{sendLoginCode:async(email,code)=>{sent.push({email,code});},sendWelcome:async()=>{},sendNewUserNotification:async()=>{}},
  '../middleware':{authenticate:async()=>{}},
  '../trial-guard':{tryGrantTrial:async()=>({grant:true})},
  '../trial-monitor':{inspectFingerprint:()=>({status:'missing',value:null}),reportTrialSignals(){}},
  '../audit':{log:async()=>{}},
  '../totp':{verifyTotp:(code,secret)=>code==='111111'&&secret==='isolated-test-secret'},
  '../metrika-conversions':{queueMetrikaGoal:async()=>false,dispatchMetrikaGoals(){}}
};
Module._load=function(request,parent,isMain){
  if(parent?.filename===routeFile && Object.hasOwn(replacements,request))return replacements[request];
  return originalLoad.call(this,request,parent,isMain);
};
const app=require('fastify')({logger:false});
const email='isolated@example.com';
const send=()=>app.inject({method:'POST',url:'/auth/send-code',payload:{email}});
const verify=(code,extra={})=>app.inject({method:'POST',url:'/auth/verify',payload:{email,code,...extra}});
const latestCode=()=>sent.at(-1).code;
const reports=[];
async function reset(){await db.query('TRUNCATE login_codes, auth_accounts, users RESTART IDENTITY');sent.length=0;}
(async()=>{
  try {
    await db.query(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text UNIQUE,display_name text,role text NOT NULL DEFAULT 'user',
      is_blocked boolean NOT NULL DEFAULT false,avatar text,weight_kg numeric,created_at timestamptz DEFAULT now(),
      newsletter_subscribed boolean NOT NULL DEFAULT true);
      CREATE TABLE auth_accounts(user_id uuid,provider text,provider_id text);
      CREATE TABLE login_codes(id bigserial PRIMARY KEY,email text NOT NULL,code_hash text NOT NULL,expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),ip text,attempts integer DEFAULT 0,used boolean DEFAULT false);`);
    await app.register(require('@fastify/cookie'));
    await app.register(require(routeFile));await app.ready();
    assert.equal((await send()).statusCode,200);
    const oldCode=latestCode();
    const cooldown=await send();assert.equal(cooldown.statusCode,429);assert.equal(cooldown.json().reason,'SEND_COOLDOWN');
    await db.query("UPDATE login_codes SET created_at=now()-interval '2 minutes'");
    assert.equal((await send()).statusCode,200);const newCode=latestCode();assert.notEqual(oldCode,newCode);
    assert.equal((await verify(oldCode)).json().reason,'INVALID_CODE');
    assert.equal((await verify('999999')).json().reason,'INVALID_CODE');
    assert.equal((await verify('999998')).json().reason,'CODE_ATTEMPTS_EXCEEDED');
    assert.equal((await verify(oldCode)).json().reason,'CODE_ATTEMPTS_EXCEEDED');
    assert.equal(Number((await db.query('SELECT count(*) FROM users')).rows[0].count),0);
    reports.push('real SQL cooldown, latest-code selection, exhausted code cannot revive previous code');
    await db.query("UPDATE login_codes SET created_at=created_at-interval '2 minutes'");
    const third=await send();assert.equal(third.statusCode,200);
    assert.ok(Date.parse(third.json().resendAvailableAt)-Date.parse(third.json().serverTime)>600000);
    assert.equal((await verify(latestCode())).statusCode,200);
    assert.equal((await db.query('SELECT newsletter_subscribed FROM users')).rows[0].newsletter_subscribed,true);
    assert.equal((await verify(oldCode)).json().reason,'CODE_UNAVAILABLE');
    const limited=await send();assert.equal(limited.statusCode,429);assert.equal(limited.json().reason,'SEND_RATE_LIMIT');
    assert.ok(limited.json().retryAfterSeconds<900);
    reports.push('third-send real wait, new account retains newsletter default, consumed latest code never falls back');

    await reset();await db.query('INSERT INTO users(email) VALUES($1)',[email]);await send();
    const simultaneous=await Promise.all([verify(latestCode()),verify(latestCode())]);
    assert.deepEqual(simultaneous.map(x=>x.statusCode).sort(),[200,400]);
    assert.equal(Number((await db.query('SELECT count(*) FROM users')).rows[0].count),1);
    reports.push('two concurrent correct-code requests create only one successful session');

    await reset();await send();
    await db.query("UPDATE login_codes SET expires_at=now()-interval '1 second'");
    assert.equal((await verify(latestCode())).json().reason,'CODE_EXPIRED');
    reports.push('expired latest challenge rejected');

    await reset();await db.query("INSERT INTO users(email,role) VALUES($1,'admin')",[email]);
    process.env.ADMIN_TOTP_SECRET='isolated-test-secret';await send();
    const mfa=await verify(latestCode(),{context:'admin',mfaCode:'000000'});
    assert.equal(mfa.statusCode,403);assert.equal(mfa.json().mfaRequired,true);
    const admin=await verify(latestCode(),{context:'admin',mfaCode:'111111'});
    assert.equal(admin.statusCode,200);assert.equal(admin.json().user.role,'admin');
    reports.push('MFA refusal and corrected second factor preserve the email challenge');
    console.log(JSON.stringify({passed:true,isolated:true,reports}));
  } finally {Module._load=originalLoad;await app.close();await db.end();}
})().catch(err=>{console.error(err);process.exitCode=1;});
