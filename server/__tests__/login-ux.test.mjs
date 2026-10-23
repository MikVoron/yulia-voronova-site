import fs from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const source = fs.readFileSync(new URL('../../platform/login.js', import.meta.url), 'utf8');
const key='smartplate.login.pending.v1.email';
function browser({storage=new Map(),search='',blockedStorage=false}={}) {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)) {
      const classes=new Set(['step-code','mfa-field'].includes(id)?['is-hidden']:[]);
      const events=new Map();
      const attrs=new Map();
      elements.set(id,{
        value:'',dataset:{},disabled:false,textContent:id==='verify-btn'?'Войти →':'Получить код →',hidden:false,
        classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:v=>classes.has(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)},
        setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),
        addEventListener:(name,fn)=>events.set(name,fn),focus:vi.fn(),trigger(name,event={}){return events.get(name)?.call(this,event);}
      });
    }
    return elements.get(id);
  };
  const fetch=vi.fn();
  const sessionStorage={
    getItem(name){if(blockedStorage)throw Error('Storage blocked');return storage.get(name)||null;},
    setItem(name,value){if(blockedStorage)throw Error('Storage blocked');storage.set(name,value);},
    removeItem(name){if(blockedStorage)throw Error('Storage blocked');storage.delete(name);}
  };
  const context=vm.createContext({
    Date,setTimeout,clearTimeout,setInterval,clearInterval,URLSearchParams,sessionStorage,
    location:{search},API_BASE:'https://api.test',fetch,
    Auth:{isLoggedIn:()=>false,login:vi.fn(),api:vi.fn(async()=>({ok:true,json:async()=>({})}))},
    document:{getElementById:element,querySelector:()=>null,addEventListener(){},createElement(){throw Error('No canvas');}},
    requestAnimationFrame:fn=>fn(),SmartPlateMetrika:{getClientId:async()=>null,goal:vi.fn()}
  });
  context.window=context;
  vm.runInContext(source,context);
  return {context,element,fetch,storage};
}
function response(status,data,headers={}) {return {ok:status>=200&&status<300,status,json:async()=>data,headers:{get:k=>headers[k]||null}};}
function sent(resendSeconds=60) {return response(200,{ok:true,serverTime:new Date().toISOString(),codeExpiresAt:new Date(Date.now()+600000).toISOString(),resendAvailableAt:new Date(Date.now()+resendSeconds*1000).toISOString()});}
async function start(b,resendSeconds=60) {
  b.element('email-input').value='test@example.com';
  b.fetch.mockResolvedValueOnce(sent(resendSeconds));
  await b.context.sendCode();
  b.fetch.mockClear();
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-23T06:00:00Z'));});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});

describe('recoverable email login',()=>{
  it('restores the code screen after a reload without sending another email or storing the code',async()=>{
    const b=browser();await start(b);
    b.element('code-input').value='123456';
    await vi.advanceTimersByTimeAsync(20000);
    const reloaded=browser({storage:b.storage});
    expect(reloaded.element('step-code').classList.contains('is-hidden')).toBe(false);
    expect(reloaded.element('email-show-text').textContent).toBe('test@example.com');
    expect(reloaded.element('code-input').value).toBe('');
    expect(reloaded.element('resend-code-btn').textContent).toContain('00:40');
    expect(reloaded.fetch).not.toHaveBeenCalled();
    expect(JSON.parse(b.storage.get(key))).not.toHaveProperty('code');
  });
  it('expires the code instead of restarting its lifetime on reload',async()=>{
    const b=browser();await start(b);
    await vi.advanceTimersByTimeAsync(601000);
    const reloaded=browser({storage:b.storage});
    expect(reloaded.element('code-expiry').textContent).toContain('закончился');
    expect(reloaded.element('verify-btn').disabled).toBe(true);
    reloaded.element('code-input').value='123456';
    await reloaded.context.verifyCode();
    expect(reloaded.fetch).not.toHaveBeenCalled();
  });
  it('uses the server resend deadline including a long rate-limit wait',async()=>{
    const b=browser();await start(b,780);
    expect(b.element('resend-code-btn').textContent).toContain('13:00');
    expect(b.element('resend-help').textContent).toContain('только на отправку');
    await b.context.resendCode();
    expect(b.fetch).not.toHaveBeenCalled();
    b.element('code-input').value='123456';
    b.fetch.mockResolvedValueOnce(response(200,{user:{email:'test@example.com'},accessToken:'test-token'}));
    await b.context.verifyCode();
    expect(b.context.Auth.login).toHaveBeenCalledTimes(1);
  });
  it('does not spend another request on an unchanged rejected code',async()=>{
    const b=browser();await start(b);
    b.element('code-input').value='654321';
    b.fetch.mockResolvedValue(response(400,{reason:'INVALID_CODE',error:'Неверный код'}));
    await b.context.verifyCode();await b.context.verifyCode();
    expect(b.fetch).toHaveBeenCalledTimes(1);
    expect(b.element('code-error').textContent).toContain('уже проверяли');
    b.element('code-input').value='654322';await b.context.verifyCode();
    expect(b.fetch).toHaveBeenCalledTimes(2);
  });
  it('allows retrying the same code after a network failure',async()=>{
    const b=browser();await start(b);b.element('code-input').value='123456';
    b.fetch.mockRejectedValueOnce(new Error('Offline'));
    await b.context.verifyCode();
    expect(b.element('code-error').textContent).toContain('тот же код');
    b.fetch.mockResolvedValueOnce(response(200,{user:{email:'test@example.com'},accessToken:'test-token'}));
    await b.context.verifyCode();
    expect(b.fetch).toHaveBeenCalledTimes(2);
    expect(b.context.Auth.login).toHaveBeenCalledTimes(1);
    expect(b.storage.has(key)).toBe(false);
  });
  it('normalizes pasted spaces and preserves leading zeros without auto-verifying',async()=>{
    const b=browser();await start(b);
    const preventDefault=vi.fn();
    b.element('code-input').trigger('paste',{preventDefault,clipboardData:{getData:()=> '01 23 45'}});
    expect(b.element('code-input').value).toBe('012345');
    expect(preventDefault).toHaveBeenCalled();
    expect(b.fetch).not.toHaveBeenCalled();
  });
  it('keeps sending and verifying mutually exclusive',async()=>{
    const b=browser();await start(b);await vi.advanceTimersByTimeAsync(61000);
    let resolve;
    b.fetch.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    const first=b.context.resendCode();
    await Promise.resolve();await Promise.resolve();
    await b.context.resendCode();
    b.element('code-input').value='123456';await b.context.verifyCode();
    expect(b.fetch).toHaveBeenCalledTimes(1);
    resolve(sent());await first;
  });
  it('applies a sending 429 to the resend timer without blocking code verification',async()=>{
    const b=browser();await start(b);await vi.advanceTimersByTimeAsync(61000);
    b.fetch.mockResolvedValueOnce(response(429,{reason:'SEND_RATE_LIMIT',retryAfterSeconds:240}));
    await b.context.resendCode();
    expect(b.element('resend-code-btn').textContent).toContain('04:00');
    expect(b.element('resend-code-btn').disabled).toBe(true);
    expect(b.element('verify-btn').disabled).toBe(false);
  });
  it('uses Retry-After when the rate-limiter response has no custom metadata',async()=>{
    const b=browser();await start(b);await vi.advanceTimersByTimeAsync(61000);
    b.fetch.mockResolvedValueOnce(response(429,{error:'Too many requests'},{'Retry-After':'42'}));
    await b.context.resendCode();
    expect(b.element('resend-code-btn').textContent).toContain('00:42');
  });
  it('separately blocks verification after verification throttling',async()=>{
    const b=browser();await start(b);b.element('code-input').value='123456';
    b.fetch.mockResolvedValueOnce(response(429,{reason:'VERIFY_RATE_LIMIT',retryAfterSeconds:120}));
    await b.context.verifyCode();
    expect(b.element('verify-btn').disabled).toBe(true);
    expect(b.element('code-expiry').textContent).toContain('02:00');
    await vi.advanceTimersByTimeAsync(120000);
    expect(b.element('verify-btn').disabled).toBe(false);
  });
  it('resets an exhausted challenge only after successful resending',async()=>{
    const b=browser();await start(b);b.element('code-input').value='654321';
    b.fetch.mockResolvedValueOnce(response(400,{reason:'CODE_ATTEMPTS_EXCEEDED',error:'Получите новый код'}));
    await b.context.verifyCode();
    expect(b.element('verify-btn').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(61000);
    b.fetch.mockResolvedValueOnce(sent());await b.context.resendCode();
    expect(b.element('code-input').value).toBe('');
    expect(b.element('verify-btn').disabled).toBe(false);
    expect(b.element('code-error').textContent).toContain('предыдущий код больше не действует');
  });
  it('preserves MFA and permits the same email code with a corrected authenticator code',async()=>{
    const b=browser({search:'?return=admin.html'});await start(b);
    b.element('code-input').value='123456';
    await b.context.verifyCode();expect(b.fetch).not.toHaveBeenCalled();
    b.element('mfa-code-input').value='000000';
    b.fetch.mockResolvedValueOnce(response(403,{reason:'MFA_INVALID',mfaRequired:true}));
    await b.context.verifyCode();await b.context.verifyCode();
    expect(b.fetch).toHaveBeenCalledTimes(1);
    b.element('mfa-code-input').value='111111';
    b.fetch.mockResolvedValueOnce(response(200,{user:{email:'admin@example.com'},accessToken:'test-token'}));
    await b.context.verifyCode();expect(b.context.Auth.login).toHaveBeenCalledTimes(1);
    expect(JSON.parse(b.fetch.mock.calls[1][1].body).context).toBe('admin');
  });
  it('works when sessionStorage is unavailable',async()=>{
    const b=browser({blockedStorage:true});await start(b);
    expect(b.element('step-code').classList.contains('is-hidden')).toBe(false);
  });
  it('updates the initial email rate-limit message as its wait expires',async()=>{
    const b=browser();b.element('email-input').value='test@example.com';
    b.fetch.mockResolvedValueOnce(response(429,{reason:'SEND_RATE_LIMIT',retryAfterSeconds:3}));
    await b.context.sendCode();
    expect(b.element('send-code-btn').disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.element('email-error').textContent).toContain('00:02');
    await vi.advanceTimersByTimeAsync(2000);
    expect(b.element('send-code-btn').disabled).toBe(false);
    expect(b.element('email-error').classList.contains('is-visible')).toBe(false);
  });
  it('resets inferred admin context when changing to an ordinary email',async()=>{
    const b=browser();await start(b);b.element('code-input').value='123456';
    b.fetch.mockResolvedValueOnce(response(403,{reason:'MFA_INVALID',mfaRequired:true}));
    await b.context.verifyCode();b.context.goBack();
    b.element('email-input').value='another@example.com';
    b.fetch.mockResolvedValueOnce(sent());await b.context.sendCode();
    expect(JSON.parse(b.fetch.mock.calls.at(-1)[1].body).context).toBeUndefined();
  });
  it('clears saved code context when explicitly changing the address',async()=>{
    const b=browser();await start(b);b.context.goBack();
    expect(b.storage.has(key)).toBe(false);
    expect(b.element('step-email').classList.contains('is-hidden')).toBe(false);
    expect(b.element('email-input').value).toBe('test@example.com');
  });
});
