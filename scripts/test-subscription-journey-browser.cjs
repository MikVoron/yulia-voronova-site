'use strict';
// Real frontend with intercepted API/analytics: never sends email or changes live payments.
const { chromium } = require('playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/subscription-journey-browser');
const recipeReturn = 'recipe.html?id=fixture&from=breakfasts';
const oldPayment = {id:1,amount:190,status:'confirmed',created_at:'2026-09-01T12:00:00Z'};
const pendingPayment = {id:2,amount:690,status:'pending',created_at:'2026-10-31T12:00:00Z'};
const user = {id:'journey-fixture',email:'journey@example.test',name:'Анна',role:'user',joined:'2026-09-01'};
const errors = [];
const reports = [];
const server = http.createServer((req,res) => {
  const relative = new URL(req.url,'http://local').pathname;
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep) || !/^\/(platform|images)\//.test(relative)) {res.writeHead(404);res.end();return;}
  fs.readFile(file,(error,body)=>{
    if(error){res.writeHead(404);res.end();return;}
    const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  });
});
async function run() {
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({channel:'chrome',headless:true});
  async function create(width, options={}) {
    const context = await browser.newContext({viewport:{width,height:900}});
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror',e=>errors.push(e.message));
    const fixture = {status:'expired',payments:[],posts:[],historyReads:0,failHistory:false,postStatus:200,...options};
    await context.addInitScript(({user,guest})=>{
      if(!guest && !localStorage.getItem('hp_user')){
        localStorage.setItem('hp_user',JSON.stringify(user));
        sessionStorage.setItem('hp_st','fixture-token');
      }
      window.__goals=[];
      window.__ga=[];
      window.ym=function(id,action,goal){if(action==='reachGoal')window.__goals.push(goal);};
    },{user,guest:!!options.guest});
    await page.route('**/*',async route=>{
      const url = new URL(route.request().url());
      const p=url.pathname;
      const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
      if(url.hostname==='api.voronova.online'){
        const sub={status:fixture.status,activeUntil:fixture.status==='active'?'2027-01-01T00:00:00Z':null,daysLeft:fixture.status==='active'?60:undefined};
        if(p==='/auth/me')return json({...user,displayName:user.name,subscription:sub});
        if(p==='/auth/send-code')return json({ok:true,metrikaGoals:{registration_started:true,verification_code_sent:true}});
        if(p==='/auth/verify')return json({user:{...user,subscription:sub},accessToken:'fixture-token',isNew:false});
        if(p==='/subscription')return json(sub);
        if(p==='/subscription/early-bird')return json({prices:{1:250,3:690,12:2500},regularPrices:{1:250,3:690,12:2500},remaining:0,eligible:false});
        if(p==='/subscription/payments'){
          fixture.historyReads++;
          return fixture.failHistory ? json({error:'fixture offline'},503) : json(fixture.payments);
        }
        if(p==='/subscription/payment'&&route.request().method()==='POST'){
          fixture.posts.push(route.request().postDataJSON());
          if(fixture.postStatus!==200)return json({error:'fixture failure'},fixture.postStatus);
          fixture.payments=[{...pendingPayment},...fixture.payments];
          return json({ok:true});
        }
        if(p==='/content/categories')return json([{id:'breakfasts',name:'Завтраки'}]);
        if(p==='/content/ingredients')return json([]);
        if(p==='/content/recipes')return json([]);
        if(p==='/content/ratings')return json({});
        if(p==='/subscription/feedback/unread-count')return json({count:0});
        if(p==='/subscription/newsletter')return json({subscribed:true});
        return json([]);
      }
      if(url.origin===origin)return route.continue();
      return route.abort();
    });
    const cabinetUrl=(ret=recipeReturn,months='')=>origin+'/platform/cabinet.html?tab=subscription'+(ret?'&return='+encodeURIComponent(ret):'')+(months?'&months='+months:'');
    const open=async(ret=recipeReturn,months='')=>{
      await page.goto(cabinetUrl(ret,months),{waitUntil:'networkidle'});
      await page.waitForFunction(()=>document.querySelector('#sub-status-wrap .sub-card'));
      await page.waitForFunction(()=>document.querySelectorAll('#pay-plan-grid .pay-plan-card').length===3);
      await page.evaluate(()=>{window.SmartPlateGoogleAnalytics={event:g=>window.__ga.push(g)};});
    };
    const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const confirmations=()=>page.evaluate(()=>window.__goals.filter(g=>g==='payment_confirmed').length);
    return {context,page,fixture,open,cabinetUrl,noOverflow,confirmations};
  }
  try {
    for(const width of [390,1366]) {
      for(const ret of [recipeReturn,'index.html']) {
        const t=await create(width,{status:'active',payments:[oldPayment]});
        await t.open(ret);
        assert.equal(new URL(t.page.url()).pathname,'/platform/cabinet.html');
        assert.equal(await t.confirmations(),0);
        assert.equal(await t.page.locator('#cab-return-banner a').getAttribute('href'),ret);
        await t.page.locator('#sub-renew-btn').click();
        assert.equal(await t.page.locator('#pay-details').isVisible(),true);
        await t.noOverflow();
        reports.push({width,scenario:'active stays in cabinet; renewal available',return:ret});
        await t.context.close();
      }
      {
        const t=await create(width,{payments:[{...pendingPayment},oldPayment]});
        await t.page.clock.install();
        await t.open();
        assert.equal(await t.page.locator('#pay-details').isVisible(),false);
        assert.equal(await t.page.locator('#sub-renew-btn').isDisabled(),true);
        assert.equal(await t.page.locator('#sub-renew-btn').textContent(),'Платёж на проверке');
        assert.match(await t.page.locator('#pay-pending-block').innerText(),/Повторно отправлять заявку/);
        assert.equal(await t.confirmations(),0);
        const before=t.fixture.historyReads;
        t.fixture.failHistory=true;
        await t.page.clock.runFor(15000);
        await t.page.waitForFunction(()=>!_paymentHistoryLoading);
        assert.equal(t.fixture.historyReads,before+1);
        assert.equal(await t.page.locator('#sub-renew-btn').isDisabled(),true);
        t.fixture.failHistory=false;
        await t.page.reload({waitUntil:'networkidle'});
        await t.page.evaluate(()=>{window.SmartPlateGoogleAnalytics={event:g=>window.__ga.push(g)};});
        t.fixture.status='active';
        t.fixture.payments=[{...pendingPayment,status:'confirmed'},oldPayment];
        await t.page.clock.runFor(15000);
        await t.page.waitForFunction(()=>document.querySelector('#cab-return-banner a').textContent.includes('Открыть'));
        assert.equal(new URL(t.page.url()).pathname,'/platform/cabinet.html');
        assert.equal(await t.confirmations(),1);
        assert.equal(await t.page.evaluate(()=>window.__ga.filter(g=>g==='payment_confirmed').length),1);
        assert.equal(await t.page.locator('#sub-renew-btn').isDisabled(),false);
        await t.noOverflow();
        await t.page.screenshot({path:path.join(output,'confirmed-'+width+'.png'),fullPage:true});
        await t.page.reload({waitUntil:'networkidle'});
        assert.equal(await t.confirmations(),0);
        await t.page.locator('#cab-return-banner a').click();
        assert.equal(new URL(t.page.url()).search,'?id=fixture&from=breakfasts');
        reports.push({width,scenario:'pending; transient failure; confirmed once; explicit recipe return'});
        await t.context.close();
      }
      {
        const t=await create(width);
        await t.open('',3);
        assert.equal(await t.page.locator('.pay-plan-card.selected').getAttribute('data-months'),'3');
        assert.equal(await t.page.locator('#pay-amount').inputValue(),'690');
        await t.page.locator('[data-country="ru"]').click();
        await t.page.locator('#pay-next-0').click();
        await t.page.locator('[data-cabinet-action="go-pay-step"][data-step="2"]').click();
        await t.page.locator('#pay-submit-btn').click();
        await t.page.locator('#pay-pending-block').waitFor();
        assert.equal(t.fixture.posts.length,1);
        assert.equal(t.fixture.posts[0].amount,690);
        assert.equal(await t.page.locator('#pay-success').isVisible(),false);
        assert.equal(await t.page.locator('#pay-details').isVisible(),false);
        assert.equal(await t.page.locator('#sub-renew-btn').isDisabled(),true);
        await t.page.evaluate(()=>submitPayment());
        assert.equal(t.fixture.posts.length,1);
        await t.noOverflow();
        await t.page.screenshot({path:path.join(output,'pending-'+width+'.png'),fullPage:true});
        reports.push({width,scenario:'chosen period; actual wizard submit; single pending status; no duplicate'});
        await t.context.close();
      }
      {
        const t=await create(width,{payments:[{...pendingPayment}]});
        await t.open();
        await t.page.reload({waitUntil:'networkidle'});
        t.fixture.payments=[{...pendingPayment,status:'rejected',admin_comment:'<img src=x onerror="window.__unsafe=1">'}];
        await t.page.evaluate(()=>loadPaymentHistory());
        assert.equal(await t.confirmations(),0);
        assert.equal(await t.page.locator('#sub-renew-btn').isDisabled(),false);
        assert.equal(await t.page.locator('#pay-pending-block img').count(),0);
        await t.page.locator('#sub-renew-btn').click();
        assert.equal(await t.page.locator('#pay-details').isVisible(),true);
        reports.push({width,scenario:'rejection after reload; retry enabled; escaped comment'});
        await t.context.close();
      }
    }
    {
      const t=await create(390,{guest:true});
      await t.page.goto(origin+'/platform/how-subscription-works.html',{referer:origin+'/platform/'+recipeReturn,waitUntil:'networkidle'});
      const link=t.page.locator('#tariff-ru .choice').nth(1);
      const target=new URL(await link.getAttribute('href'),t.page.url());
      const cabinet=new URL(target.searchParams.get('return'),t.page.url());
      assert.equal(cabinet.searchParams.get('months'),'3');
      assert.equal(cabinet.searchParams.get('return'),recipeReturn);
      for (const [index,months] of [1,3,12].entries()) {
        const choice=new URL(await t.page.locator('#tariff-ru .choice').nth(index).getAttribute('href'),t.page.url());
        assert.equal(new URL(choice.searchParams.get('return'),t.page.url()).searchParams.get('months'),String(months));
      }
      await link.click();
      await t.page.locator('#email-input').fill(user.email);
      await t.page.locator('#send-code-btn').click();
      await t.page.locator('#code-input').fill('012345');
      await t.page.locator('#verify-btn').click();
      await t.page.waitForURL('**/cabinet.html?**');
      await t.page.locator('.pay-plan-card.selected').waitFor();
      assert.equal(await t.page.locator('.pay-plan-card.selected').getAttribute('data-months'),'3');
      assert.equal(await t.page.locator('#cab-return-banner a').getAttribute('href'),recipeReturn);
      assert.equal(await t.page.locator('#pay-amount').inputValue(),'690');
      reports.push({width:390,scenario:'recipe tariff page; period; email-code login; context and live price preserved'});
      await t.context.close();
    }
    {
      const t=await create(390);
      await t.page.goto(origin+'/platform/how-subscription-works.html?return='+encodeURIComponent('https://evil.test/'),{waitUntil:'networkidle'});
      const target=new URL(await t.page.locator('#tariff-ru .choice').first().getAttribute('href'),t.page.url());
      assert.equal(new URL(target.searchParams.get('return'),t.page.url()).searchParams.has('return'),false);
      await t.open('',99);
      assert.equal(await t.page.locator('.pay-plan-card.selected').count(),0);
      reports.push({width:390,scenario:'external return and unsupported period ignored'});
      await t.context.close();
    }
    for (const postStatus of [503,409]) {
      const t=await create(390,{postStatus,payments:[oldPayment]});
      await t.open('',3);
      assert.doesNotMatch(await t.page.locator('#pay-pending-block').innerText(),/Доступ по подписке открыт/);
      await t.page.locator('[data-country="ru"]').click();
      await t.page.locator('#pay-next-0').click();
      await t.page.locator('[data-cabinet-action="go-pay-step"][data-step="2"]').click();
      await t.page.locator('#pay-comment').fill('Сохранить комментарий');
      if(postStatus===409)t.fixture.payments=[{...pendingPayment},oldPayment];
      await t.page.locator('#pay-submit-btn').click();
      await t.page.waitForFunction(()=>!document.querySelector('#pay-submit-btn').disabled);
      assert.equal(await t.page.evaluate(()=>window.__goals.includes('payment_submitted')),false);
      if(postStatus===503) {
        assert.equal(await t.page.locator('#pay-comment').inputValue(),'Сохранить комментарий');
        assert.equal(await t.page.locator('#pay-amount').inputValue(),'690');
        t.fixture.postStatus=200;
        await t.page.locator('#pay-submit-btn').click();
      }
      await t.page.waitForFunction(()=>document.querySelector('#sub-renew-btn').disabled);
      assert.match(await t.page.locator('#pay-pending-block').innerText(),/Повторно отправлять заявку/);
      assert.equal(t.fixture.posts.length,postStatus===503?2:1);
      reports.push({width:390,scenario:'submission failure '+postStatus+'; safe recovery without false success'});
      await t.context.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({scenarios:reports,errors},null,2));
    console.log(JSON.stringify({scenarios:reports.length,errors,report:path.join(output,'report.json')}));
  } finally {await browser.close();server.close();}
}
run().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
