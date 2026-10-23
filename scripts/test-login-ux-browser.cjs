'use strict';
// Exercises the production HTML/CSS/JS against local fixtures. No live auth/email calls.
const { chromium } = require('../node_modules/playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/auth-preview-20261023/implementation');
fs.mkdirSync(output, { recursive: true });
const allowed = new Set(['login.html','login.css','login.js','metrika.js','google-analytics.js','tawk-chat-modal.js','tawk-chat-modal.css','plate-favicon.svg']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.replace(/^\/platform\//,'');
  if(!allowed.has(name)&&!/^images\/login-[\w-]+\.webp$/.test(name)){res.writeHead(404);res.end();return;}
  fs.readFile(path.join(root,'platform',name),(err,data)=>{
    if(err){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});res.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const errors=[];
  const reports=[];
  async function create(search=''){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const page=await context.newPage();
    const fixture={sends:0,verifies:0,resendSeconds:60,sendStatus:200,verifyStatus:400,isNew:false};
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      if(url.pathname==='/platform/data-v2.js')return route.fulfill({contentType:'text/javascript',body:`var API_BASE=${JSON.stringify(origin+'/api')}; var Auth={isLoggedIn:function(){return false},login:function(){window.__loggedIn=true},api:function(p){return fetch(API_BASE+p)}};`});
      if(url.pathname==='/api/auth/send-code'){
        fixture.sends++;
        if(fixture.sendStatus===429)return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({reason:'SEND_RATE_LIMIT',retryAfterSeconds:240})});
        return json({ok:true,metrikaGoals:{registration_started:true,verification_code_sent:true},serverTime:new Date().toISOString(),codeExpiresAt:new Date(Date.now()+600000).toISOString(),resendAvailableAt:new Date(Date.now()+fixture.resendSeconds*1000).toISOString()});
      }
      if(url.pathname==='/api/auth/verify'){
        fixture.verifies++;
        if(fixture.verifyStatus===403)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({reason:'MFA_INVALID',mfaRequired:true})});
        if(fixture.verifyStatus===400)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({reason:'INVALID_CODE',error:'Неверный код'})});
        return json({isNew:fixture.isNew,user:{email:'preview@example.com'},accessToken:'local-test-token',metrikaGoals:{registration_completed:true}});
      }
      if(url.pathname==='/api/auth/me')return json({subscription:{status:'trial',trialEndsAt:new Date(Date.now()+7*86400000).toISOString()}});
      if(url.origin===origin)return route.continue();
      if(['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))return route.continue();
      return route.abort();
    });
    await page.goto(origin+'/platform/login.html'+search,{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const send=async()=>{
      await page.locator('#email-input').fill('preview@example.com');
      await page.locator('#send-code-btn').click();
      await page.locator('#step-code:not(.is-hidden)').waitFor();
      await page.locator('#verify-btn:enabled').waitFor();
    };
    return {context,page,fixture,send};
  }
  try {
    const b=await create();
    await b.page.setViewportSize({width:1366,height:900});
    await b.page.screenshot({path:path.join(output,'desktop-entry.png'),fullPage:true});
    await b.send();
    await b.page.setViewportSize({width:390,height:844});
    await b.page.locator('#code-input').blur();
    await b.page.screenshot({path:path.join(output,'mobile-code.png'),fullPage:true});
    assert.equal(b.fixture.sends,1);
    await b.page.reload({waitUntil:'networkidle'});
    assert.equal(await b.page.locator('#step-code:not(.is-hidden)').isVisible(),true);
    assert.equal(b.fixture.sends,1);
    await b.page.locator('#code-input').evaluate(input=>{
      const clipboardData=new DataTransfer();clipboardData.setData('text/plain','01 23 45');
      input.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
    });
    assert.equal(await b.page.locator('#code-input').inputValue(),'012345');
    assert.equal(b.fixture.verifies,0);
    await b.page.locator('#verify-btn').click();
    await b.page.waitForFunction(()=>document.getElementById('code-error').textContent.includes('Код не подошёл'));
    await b.page.locator('#verify-btn').click();
    assert.equal(b.fixture.verifies,1);
    await b.page.locator('#code-input').blur();
    await b.page.screenshot({path:path.join(output,'mobile-error.png'),fullPage:true});
    await b.page.setViewportSize({width:1366,height:900});
    await b.page.screenshot({path:path.join(output,'desktop-error.png'),fullPage:true});
    for(const width of [320,360,390,768,1024,1440]){
      await b.page.setViewportSize({width,height:844});
      assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow at '+width);
    }
    b.fixture.verifyStatus=200;
    await b.page.locator('#code-input').fill('123456');
    await b.page.locator('#verify-btn').click();
    await b.page.waitForFunction(()=>window.__loggedIn===true);
    assert.equal(await b.page.evaluate(()=>sessionStorage.getItem('smartplate.login.pending.v1.email')),null);
    reports.push('existing login, recovery, paste, duplicate rejection, viewport widths');
    await b.context.close();

    const rate=await create();rate.fixture.resendSeconds=0;await rate.send();
    rate.fixture.sendStatus=429;await rate.page.locator('#resend-code-btn').click();
    await rate.page.waitForFunction(()=>document.getElementById('resend-code-btn').textContent.includes('04:'));
    assert.equal(await rate.page.locator('#verify-btn').isEnabled(),true);
    await rate.page.screenshot({path:path.join(output,'mobile-wait.png'),fullPage:true});
    await rate.context.close();reports.push('sending limit leaves verification available');

    const fresh=await create('?return=recipe.html%3Fid%3Dexample&entry=pro-recipe');
    assert.equal(await fresh.page.locator('#lp-recipe-context').isVisible(),true);
    fresh.fixture.isNew=true;fresh.fixture.verifyStatus=200;await fresh.send();
    await fresh.page.locator('#code-input').fill('123456');await fresh.page.locator('#verify-btn').click();
    await fresh.page.waitForFunction(()=>document.getElementById('success-title').textContent==='Вы зарегистрированы');
    assert.equal(await fresh.page.locator('#success-primary').getAttribute('href'),'recipe.html?id=example');
    assert.equal(await fresh.page.locator('[data-social], #newsletter, #consent').count(),0);
    await fresh.context.close();reports.push('new account, recipe return context, no OAuth/newsletter step');

    const admin=await create('?return=admin.html');await admin.send();
    assert.equal(await admin.page.locator('#mfa-field').isVisible(),true);
    await admin.page.locator('#code-input').fill('123456');await admin.page.locator('#verify-btn').click();
    assert.equal(admin.fixture.verifies,0);
    admin.fixture.verifyStatus=403;await admin.page.locator('#mfa-code-input').fill('000000');
    await admin.page.locator('#verify-btn').click();
    await admin.page.waitForFunction(()=>document.getElementById('code-error').textContent.includes('приложения'));
    await admin.page.locator('#verify-btn').click();assert.equal(admin.fixture.verifies,1);
    admin.fixture.verifyStatus=200;await admin.page.locator('#mfa-code-input').fill('111111');
    await admin.page.locator('#verify-btn').click();await admin.page.waitForFunction(()=>window.__loggedIn===true);
    await admin.context.close();reports.push('admin MFA entry, duplicate protection, corrected authenticator code');

    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify({passed:true,reports,errors},null,2));
    console.log(JSON.stringify({passed:true,reports,errors}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
