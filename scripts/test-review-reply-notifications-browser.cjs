'use strict';
const { chromium }=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/reply-notifications-browser');
async function main(){
  await fs.mkdir(output,{recursive:true});
  const data=await fs.readFile(path.join(root,'platform/data-v2.js'),'utf8');
  const start=data.indexOf('const ContentUpdates ='),client=data.slice(start,data.indexOf('\ndocument.addEventListener',start));
  const cabinet=await fs.readFile(path.join(root,'platform/cabinet.html'),'utf8');
  const settings=cabinet.slice(cabinet.indexOf('<div id="review-replies-settings">'),cabinet.indexOf('<label class="cab-setting-row" for="review-likes-toggle"'));
  const css=await fs.readFile(path.join(root,'platform/style-v4.css'),'utf8')+'\n'+Array.from(cabinet.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g),m=>m[1]).join('\n');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const reports=[];
  try {
    for(const width of [320,1440]){
      const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
      await context.route('**/*',r=>r.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<main style="padding:16px;max-width:760px;margin:auto"><div id="user-wrap" style="display:flex;justify-content:flex-end"><button id="user-badge">Кабинет</button></div><div class="cab-settings">'+settings+'</div></main>');
      await page.addStyleTag({content:css});
      await page.evaluate(()=>{
        window.calls=[];window.failSave=false;window.fixtureSettings={enabled:true,email:true};
        window.fixtureReply={id:1,review_id:65,recipe_id:'side-tomato-oatmeal',actor:'Юлия <script>alert(1)</script>',recipe_name:'Томатная овсянка',text:'Мишель, на здоровье! <img onerror="alert(1)" src="x">',created_at:'2026-11-15T13:06:00Z',read_at:null};
        window.Auth={isLoggedIn:()=>true,getToken:()=> 'fixture',api:async(url,options)=>{
          window.calls.push({url,options});
          const body=typeof options?.body==='string'?JSON.parse(options.body):options?.body;
          if(url==='/auth/review-reply-settings'){
            if(options && window.failSave)return {ok:false,json:async()=>({error:'Fixture save failure'})};
            if(options)window.fixtureSettings=body;
            return {ok:true,json:async()=>window.fixtureSettings};
          }
          if(url.includes('/review-reply-notifications'))return {ok:true,json:async()=>options?{ok:true}:{items:window.fixtureSettings.enabled?[window.fixtureReply]:[],hasMore:false}};
          return {ok:true,json:async()=>url.includes('/content/updates')?[]:{items:[]}};
        }};
      });
      await page.addScriptTag({content:client+'\nwindow.ContentUpdates=ContentUpdates;'});
      await page.addScriptTag({path:path.join(root,'platform/review-reply-settings.js')});
      await page.waitForFunction(()=>!document.getElementById('review-replies-email-toggle').disabled);
      await page.locator('#review-replies-list a').waitFor();
      assert.equal(await page.locator('#review-replies-toggle').isChecked(),true);
      assert.equal(await page.locator('#review-replies-email-toggle').isChecked(),true);
      assert.equal(await page.locator('#review-replies-list script, #review-replies-list img').count(),0);
      assert.equal(await page.locator('#review-replies-list a').getAttribute('href'),'recipe.html?id=side-tomato-oatmeal#review-65');
      await page.locator('label[for="review-replies-email-toggle"]').click();
      await page.waitForFunction(()=>window.fixtureSettings.email===false);
      assert.equal(await page.locator('#review-replies-toggle').isChecked(),true);
      await page.evaluate(()=>window.failSave=true);
      await page.locator('label[for="review-replies-email-toggle"]').click();
      await page.waitForFunction(()=>document.getElementById('review-replies-status').textContent.includes('Не удалось сохранить'));
      assert.equal(await page.locator('#review-replies-email-toggle').isChecked(),false);
      await page.evaluate(()=>window.failSave=false);
      await page.locator('label[for="review-replies-toggle"]').click();
      await page.waitForFunction(()=>window.fixtureSettings.enabled===false);
      assert.equal(await page.locator('#review-replies-email-toggle').isDisabled(),true);
      await page.locator('label[for="review-replies-toggle"]').click();
      await page.waitForFunction(()=>window.fixtureSettings.enabled===true);
      await page.evaluate(()=>{window.fixtureReply.actor='Юлия';window.fixtureReply.text='Мишель, на здоровье! Меня тоже такая овсянка хорошо насыщает.';});
      await page.locator('label[for="review-replies-email-toggle"]').click();
      await page.waitForFunction(()=>window.fixtureSettings.email===true);
      await page.waitForFunction(()=>document.getElementById('review-replies-email-toggle').checked && !document.getElementById('review-replies-email-toggle').disabled);
      await page.locator('#review-replies-list').getByText('Мишель, на здоровье!',{exact:false}).waitFor();
      await page.screenshot({path:path.join(output,'settings-'+width+'.png')});
      await page.evaluate(()=>ContentUpdates.refresh());
      assert.equal(await page.locator('#sp-updates-count').textContent(),'1');
      await page.locator('#sp-updates-btn').click();
      const reply=page.locator('[data-update-type="review_reply"]');await reply.waitFor();
      assert.equal(await reply.locator('script,img').count(),0);
      assert.match(await reply.textContent(),/Томатная овсянка/);
      const box=await page.locator('#sp-updates-panel').boundingBox();
      assert.ok(box.x>=0&&box.x+box.width<=width+1,JSON.stringify(box));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(output,'cabinet-'+width+'.png')});
      await page.locator('.sp-updates-done').click();
      const writes=await page.evaluate(()=>window.calls.filter(c=>c.options));
      assert.ok(writes.some(c=>c.url==='/content/review-reply-notifications/read'));
      assert.ok(writes.every(c=>!c.url.includes('review-like')));
      assert.deepEqual(errors,[]);reports.push({width,settings:true,emailOptOut:true,saveRollback:true,bell:true,escaped:true,overflow:false});
      await context.close();
    }
  }finally{await browser.close();}
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2));
  console.log('REVIEW_REPLY_NOTIFICATIONS_BROWSER_OK '+JSON.stringify(reports));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
