import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const Module = require('module');
const bcrypt = require('bcrypt');
const src = path.resolve(import.meta.dirname, '../src');
const query = vi.fn();
const sendLoginCode = vi.fn();
const sendWelcome = vi.fn();
const issueSession = vi.fn(async () => 'test-session');
const queueGoal = vi.fn(async () => true);
const logLines = [];
function mock(file, exports) {
  const resolved = require.resolve(path.join(src, file));
  const module = new Module(resolved);
  module.loaded = true; module.exports = exports; require.cache[resolved] = module;
}
mock('db.js', { query });
mock('email.js', { sendLoginCode, sendWelcome, sendNewUserNotification: vi.fn(async () => {}) });
mock('audit.js', { log: vi.fn(async () => {}) });
mock('trial-guard.js', { tryGrantTrial: vi.fn(async () => ({ grant: true })) });
mock('trial-monitor.js', { inspectFingerprint: () => ({status:'missing',value:null}), reportTrialSignals() {} });
mock('refresh-sessions.js', { issueRefreshSession: issueSession });
mock('metrika-conversions.js', { queueMetrikaGoal: queueGoal, dispatchMetrikaGoals() {} });
process.env.JWT_SECRET = 'test-login-ux-secret-with-more-than-32-bytes';
let app, state, codeHash;
const user = { id: '00000000-0000-4000-8000-000000000001', email:'test@example.com', role:'user', is_blocked:false };
beforeAll(async () => {
  codeHash = await bcrypt.hash('123456', 4);
  app = require('fastify')({logger:{level:'info',stream:{write(line){logLines.push(JSON.parse(line));}}}});
  await app.register(require('@fastify/cookie'));
  await app.register(require('../src/routes/auth'));
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  vi.clearAllMocks(); logLines.length = 0;
  state = {ip:{count:'0'},email:{count:'0'},latest:{id:1,code_hash:codeHash,attempts:0,used:false,expires_at:new Date(Date.now()+600000)},user:{...user},consumed:false};
  sendLoginCode.mockResolvedValue(true);
  sendWelcome.mockResolvedValue(true);
  query.mockImplementation(async (sql, params) => {
    if (/SELECT COUNT.*login_codes.*ip=/.test(sql)) return {rows:[state.ip]};
    if (/SELECT COUNT.*login_codes.*email=/.test(sql)) return {rows:[state.email]};
    if (/INSERT INTO login_codes/.test(sql)) return {rows:[{created_at:new Date(),expires_at:new Date(Date.now()+600000)}]};
    if (/COALESCE\(SUM\(attempts\)/.test(sql)) return {rows:[{total:String(state.ipAttempts || 0)}]};
    if (/SELECT \* FROM login_codes/.test(sql)) return {rows:state.latest?[{...state.latest}]:[]};
    if (/SET attempts=COALESCE\(attempts, 0\)\+1/.test(sql)) {
      state.latest.attempts++;
      return {rows:[{attempts:state.latest.attempts}]};
    }
    if (/UPDATE login_codes SET used=true/.test(sql)) {
      if (state.consumed) return {rows:[]};
      state.consumed = true; return {rows:[{id:1}]};
    }
    if (/SELECT \* FROM users WHERE email/.test(sql)) return {rows:state.user?[state.user]:[]};
    if (/INSERT INTO users/.test(sql)) return {rows:[{...user,email:params[0]}]};
    return {rows:[]};
  });
});
const send = () => app.inject({method:'POST',url:'/auth/send-code',payload:{email:'test@example.com'}});
const verify = code => app.inject({method:'POST',url:'/auth/verify',payload:{email:'test@example.com',code}});

describe('email-code timing and rejection reasons', () => {
  it('returns real expiration and resend deadlines after successful mail submission', async () => {
    const result = await send(); const data = result.json();
    expect(result.statusCode).toBe(200);
    expect(Date.parse(data.codeExpiresAt)-Date.parse(data.serverTime)).toBeGreaterThan(590000);
    expect(Date.parse(data.resendAvailableAt)-Date.parse(data.serverTime)).toBeGreaterThan(59000);
    expect(sendLoginCode).toHaveBeenCalledTimes(1);
  });
  it('announces the longer actual wait immediately after the third email', async () => {
    state.email = {count:'2',next_limit_at:new Date(Date.now()-120000),last_at:new Date(Date.now()-61000)};
    const data = (await send()).json();
    expect(Date.parse(data.resendAvailableAt)-Date.parse(data.serverTime)).toBeGreaterThan(770000);
  });
  it('returns the remaining email limit time and Retry-After, not a fresh 15 minutes', async () => {
    state.email = {count:'3',limit_at:new Date(Date.now()-660000)};
    const result = await send();
    expect(result.statusCode).toBe(429);
    expect(result.json().reason).toBe('SEND_RATE_LIMIT');
    expect(result.json().retryAfterSeconds).toBeGreaterThanOrEqual(239);
    expect(result.json().retryAfterSeconds).toBeLessThanOrEqual(240);
    expect(Number(result.headers['retry-after'])).toBe(result.json().retryAfterSeconds);
    expect(sendLoginCode).not.toHaveBeenCalled();
  });
  it('enforces the existing per-IP email limit', async () => {
    state.ip = {count:'10',limit_at:new Date(Date.now()-600000)};
    const result = await send();
    expect(result.statusCode).toBe(429);
    expect(result.json().retryAfterSeconds).toBeLessThanOrEqual(300);
    expect(sendLoginCode).not.toHaveBeenCalled();
  });
  it('returns a short cooldown for a request made before one minute', async () => {
    state.email = {count:'1',last_at:new Date(Date.now()-30000)};
    const result = await send();
    expect(result.json().reason).toBe('SEND_COOLDOWN');
    expect(result.json().retryAfterSeconds).toBeLessThanOrEqual(30);
    expect(sendLoginCode).not.toHaveBeenCalled();
  });
  it('does not report success when SMTP fails', async () => {
    sendLoginCode.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const result = await send();
    expect(result.statusCode).toBe(500);
    expect(result.json().reason).toBe('SEND_FAILED');
    expect(queueGoal).not.toHaveBeenCalled();
  });
  it('distinguishes an invalid code from exhausted attempts', async () => {
    const results = [];
    for (let i=0;i<4;i++) results.push((await verify('654321')).json());
    expect(results.map(r=>r.reason)).toEqual(['INVALID_CODE','INVALID_CODE','CODE_ATTEMPTS_EXCEEDED','CODE_ATTEMPTS_EXCEEDED']);
    expect(state.latest.attempts).toBe(3);
    expect(issueSession).not.toHaveBeenCalled();
  });
  it('rejects malformed input without consuming a code attempt', async () => {
    for (const code of ['12345','12 345',123456,{}]) {
      expect((await verify(code)).json().reason).toBe('INVALID_CODE_FORMAT');
    }
    expect(state.latest.attempts).toBe(0);
  });
  it.each([['used','CODE_UNAVAILABLE'],['expired','CODE_EXPIRED']])('does not fall back to an older code after the latest is %s', async (condition,reason) => {
    if(condition==='used') state.latest.used=true;
    else state.latest.expires_at=new Date(Date.now()-1000);
    const result = await verify('123456');
    expect(result.json().reason).toBe(reason);
    expect(issueSession).not.toHaveBeenCalled();
    const sql = query.mock.calls.find(([sql])=>/SELECT \* FROM login_codes/.test(sql))[0];
    expect(sql).not.toContain('used=false');
    expect(sql).not.toContain('expires_at >');
  });
  it('never creates a session after a concurrent code consumption or replacement', async () => {
    state.consumed=true;
    expect((await verify('123456')).json().reason).toBe('CODE_UNAVAILABLE');
    expect(issueSession).not.toHaveBeenCalled();
  });
  it('reports verification throttling separately from sending throttling', async () => {
    state.ipAttempts=20;
    const result=await verify('123456');
    expect(result.statusCode).toBe(429);
    expect(result.json().reason).toBe('VERIFY_RATE_LIMIT');
    expect(issueSession).not.toHaveBeenCalled();
  });
  it('records a rejection reason without the email or supplied code', async () => {
    await verify('654321');
    const events=logLines.filter(row=>row.event==='auth_code_rejected');
    expect(events).toHaveLength(1);
    expect(events[0].reason).toBe('INVALID_CODE');
    expect(JSON.stringify(events)).not.toContain('test@example.com');
    expect(JSON.stringify(events)).not.toContain('654321');
  });
});
describe('successful account lifecycle remains intact', () => {
  it('logs an existing user in without creating another account', async () => {
    const result=await verify('123456');
    expect(result.statusCode).toBe(200);
    expect(result.json().isNew).toBe(false);
    expect(result.headers['set-cookie']).toContain('HttpOnly');
    expect(sendWelcome).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql])=>/INSERT INTO users/.test(sql))).toBe(false);
  });
  it('creates a new email account and preserves newsletter defaults and welcome mail', async () => {
    state.user=null;
    const result=await verify('123456');
    expect(result.statusCode).toBe(200);
    expect(result.json().isNew).toBe(true);
    const insertion=query.mock.calls.find(([sql])=>/INSERT INTO users/.test(sql));
    expect(insertion[0]).toBe('INSERT INTO users (email) VALUES ($1) RETURNING *');
    expect(sendWelcome).toHaveBeenCalledWith('test@example.com',true);
    expect(queueGoal).toHaveBeenCalledWith(expect.objectContaining({goalId:'registration_completed'}));
  });
  it('still denies blocked users even with a correct code', async () => {
    state.user.is_blocked=true;
    expect((await verify('123456')).statusCode).toBe(403);
    expect(issueSession).not.toHaveBeenCalled();
  });
});
