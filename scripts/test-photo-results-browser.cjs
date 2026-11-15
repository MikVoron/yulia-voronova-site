'use strict';
const {chromium}=require('playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/photo-result-browser');
async function main(){
  await fs.mkdir(output,{recursive:true});
  const source=await fs.readFile(path.join(root,'platform/data-v2.js'),'utf8');
  const start=source.indexOf('const ContentUpdates =');
  const client=source.slice(start,source.indexOf('\ndocument.addEventListener',start));
  const style=await fs.readFile(path.join(root,'platform/style-v4.css'),'utf8');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const reports=[];
  try{
    for(const width of [320,1440]){
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      await context.route('**/*',route=>route.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<main style="padding:12px"><div id="user-wrap" style="display:flex;justify-content:flex-end"><button id="user-badge">Кабинет</button></div></main>');
      await page.addStyleTag({content:style});
      await page.evaluate(()=>{
        window.calls=[];
        window.Auth={getToken:()=> 'fixture',api:async(url,options)=>{
          window.calls.push({url,options});
          const photos={items:[{id:1,approved:1,total:2,title:'Опубликовано 1 из 2 ваших фото',recipe_name:'Томатная овсяная каша',recipe_id:'recipe',review_id:17,reasons:['На фотографии видны личные данные <script>alert(1)</script>'],created_at:'2026-11-15T09:00:00Z'}]};
          return {ok:true,json:async()=>url.includes('/review-photo-results')?photos:url.includes('/review-like-notifications')?{items:[{id:1,actor:'Участник',recipe_name:'Томатная овсяная каша',recipe_id:'recipe',review_id:17,created_at:'2026-11-15T08:00:00Z'}]}:[{id:1,type:'news',title:'Новость',text:'Текст новости',created_at:'2026-11-14T08:00:00Z'}]};
        }};
      });
      await page.addScriptTag({content:client+'\nwindow.ContentUpdates=ContentUpdates;'});
      await page.evaluate(()=>window.ContentUpdates.refresh());
      assert.equal(await page.locator('#sp-updates-count').textContent(),'3');
      await page.locator('#sp-updates-btn').click();
      const photo=page.locator('[data-update-type="review_photo"]');
      assert.match(await photo.textContent(),/Причина: На фотографии видны личные данные/);
      assert.equal(await photo.locator('script').count(),0);
      assert.equal(await photo.getAttribute('href'),'recipe.html?id=recipe#review-17');
      const box=await page.locator('#sp-updates-panel').boundingBox();
      assert.ok(box.x>=0 && box.x+box.width<=width+1,JSON.stringify(box));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(output,'bell-'+width+'.png')});
      await page.locator('.sp-updates-done').click();
      const writes=await page.evaluate(()=>window.calls.filter(c=>c.options));
      assert.equal(writes.length,3);assert.ok(writes.some(c=>c.url==='/content/review-photo-results/read'));
      assert.deepEqual(errors,[]);reports.push({width,bell:true,overflow:false,errors});
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:320,height:900},serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();page.on('dialog',d=>d.accept());
    await page.setContent('<main style="padding:12px"><span id="review-photos-badge"></span><p id="admin-photo-info"></p><select id="admin-photo-filter"><option value="pending">На проверке</option></select><button id="admin-photo-refresh">Обновить</button><div id="admin-photo-list"></div><button id="admin-photo-more">Ещё</button></main>');
    await page.addStyleTag({content:style+'\n'+await fs.readFile(path.join(root,'platform/review-photos.css'),'utf8')});
    await page.evaluate(()=>{
      window.decisions=[];
      window.Auth={isLoggedIn:()=>true,getUser:()=>({role:'admin'}),api:async(url,options)=>{
        if(options)window.decisions.push(options.body);
        return {ok:true,json:async()=>options?{ok:true}:{photos:[{id:'photo-fixture',status:'pending',recipeName:'Каша',author:'Анна',recipeId:'recipe',createdAt:'2026-11-15T09:00:00Z'}],pendingCount:1}};
      }};
      window.ReviewPhotos={ready:Promise.resolve({enabled:true}),loadImages:()=>{},view:()=>{}};
    });
    await page.addScriptTag({content:await fs.readFile(path.join(root,'platform/admin-review-photos.js'),'utf8')});
    await page.evaluate(()=>window.AdminReviewPhotos.load());
    await page.locator('[data-admin-photo-action="rejected"]').click();
    assert.match(await page.locator('.review-photo-error').textContent(),/Укажите причину/);
    assert.equal(await page.evaluate(()=>window.decisions.length),0);
    const reason='На фотографии видны личные данные';
    await page.locator('textarea').fill(reason);
    await page.screenshot({path:path.join(output,'admin-320.png')});
    await page.locator('[data-admin-photo-action="rejected"]').click();
    assert.deepEqual(await page.evaluate(()=>window.decisions),[{status:'rejected',reason}]);
    reports.push({adminReasonRequired:true});await context.close();
  }finally{await browser.close();}
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2));
  console.log('PHOTO_RESULTS_BROWSER_OK '+JSON.stringify(reports));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
