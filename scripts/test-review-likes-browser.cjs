'use strict';
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'tmp/review-likes/browser');fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep)||!/^\/(platform|images)\//.test(relative)||!/\.(html|js|css|svg|webp|png|jpe?g)$/.test(file)){res.writeHead(404);res.end();return;}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});res.end(body);});
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const errors=[],reports=[];
  try {
    const scenarios=['recipe','category','ingredient'].flatMap(view=>[320,390,1366].map(width=>({view,width,id:'u1'}))).concat([{view:'recipe',width:320,id:null},{view:'recipe',width:390,id:'admin'},{view:'cabinet',width:320,id:'u1'},{view:'cabinet',width:1366,id:'u1'}]);
    for(const scenario of scenarios){
      const context=await browser.newContext({viewport:{width:scenario.width,height:900},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(8000);
      page.on('pageerror',error=>errors.push(scenario.view+': '+error.message));
      const user=scenario.id?{id:scenario.id,email:'fixture@example.test',name:'Анна',role:scenario.id==='admin'?'admin':'user'}:null;
      await context.addInitScript(user=>{if(user){localStorage.setItem('hp_user',JSON.stringify(user));sessionStorage.setItem('hp_st','fixture');}},user);
      const fixture={writes:[],reads:[],settings:{enabled:true,email:false},failLike:false,failSettings:false};
      const recipe={id:'fixture',name:'Тестовый рецепт',cat:'breakfasts',categories:['breakfasts'],access_level:'free',is_free:true,is_published:true,ingredients:[{name:'Овсянка',amount:40,unit:'г'}],steps:[{text:'Приготовьте кашу.'}],main_ingredients:['oatmeal'],photo:'images/YV-blog.webp',kcal:100};
      const review={id:1,stars:4,text:'Отличный рецепт',userId:'u2',author:'Мария',createdAt:'2026-11-01T10:00:00Z',likeCount:2,likedByCurrentUser:false,reply:{text:'Спасибо за отзыв!',createdAt:'2026-11-02T10:00:00Z',likeCount:3,likedByCurrentUser:false},comments:[{id:7,userId:'u3',author:'Анна',text:'А можно с другой крупой?',createdAt:'2026-11-03T10:00:00Z',likeCount:1,likedByCurrentUser:false}],commentCount:1};
      const notification={id:9,created_at:'2026-11-08T10:00:00Z',read_at:null,actor:'Мария <img src=x>',recipe_id:'fixture',recipe_name:'Каша <script>x</script>',review_id:1,comment_id:null,reply_id:null};
      await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),p=url.pathname.replace(/^\/api/,''),method=request.method();
        const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
        if(url.hostname==='api.voronova.online'||url.pathname.startsWith('/api/')){
          if(p==='/auth/me')return json({...user,displayName:'Анна',subscription:{status:'active',activeUntil:'2027-01-01'}});
          if(p==='/content/recipes')return json([recipe]);
          if(p==='/content/categories')return json([{id:'breakfasts',name:'Завтраки',emoji:'🍴',sort_order:0}]);
          if(p==='/content/ingredients')return json([{id:'oatmeal',name:'Овсянка',aliases:[],sort_order:0,is_active:true}]);
          if(p==='/content/reviews/fixture')return json([review]);
          if(p.startsWith('/content/review-likes/')){
            const body=request.postDataJSON();fixture.writes.push({url:p,...body});
            if(fixture.failLike){fixture.failLike=false;return route.abort('connectionfailed');}
            const type=p.split('/')[3],item=type==='review'?review:type==='reply'?review.reply:review.comments[0];
            if(item.likedByCurrentUser!==body.active)item.likeCount+=body.active?1:-1;item.likedByCurrentUser=body.active;
            return json({likeCount:item.likeCount,likedByCurrentUser:item.likedByCurrentUser});
          }
          if(p==='/auth/review-like-settings'){
            if(method==='PUT'){if(fixture.failSettings){fixture.failSettings=false;return json({error:'Не удалось сохранить'},500);}fixture.settings=request.postDataJSON();}
            return json(fixture.settings);
          }
          if(p==='/content/review-like-notifications')return json({items:fixture.settings.enabled&&(!url.searchParams.has('unread')||!notification.read_at)?[notification]:[],hasMore:false});
          if(p==='/content/review-like-notifications/9/read'){fixture.reads.push(9);notification.read_at='now';return json({ok:true});}
          if(p==='/content/updates')return json([{id:5,type:'news',text:'Новость платформы',created_at:'2026-11-07T10:00:00Z'}]);
          if(p==='/content/review-photos/config')return json({enabled:false});
          if(p==='/content/ratings')return json({fixture:{avg:4,count:1}});
          if(['/favorites','/plates','/content/news','/feedback','/payments','/notes'].includes(p))return json([]);
          if(p.startsWith('/content/video-requests'))return json({votes:0,goal:10,status:'collecting',voted:false});
          if(p==='/subscription/early-bird')return json({prices:{'1':399}});
          if(p==='/subscription')return json({status:'active',activeUntil:'2027-01-01',daysLeft:30});
          if(p==='/subscription/dietary-preferences')return json({excluded_flags:[],allow_swaps:true});
          if(p==='/subscription/newsletter')return json({subscribed:true});
          return json({ok:true});
        }
        if(url.origin===origin)return route.continue();return route.abort();
      });
      const query=scenario.view==='recipe'?'?id=fixture':scenario.view==='category'?'?cat=breakfasts':scenario.view==='ingredient'?'?id=oatmeal':'?tab=settings';
      await page.goto(origin+'/platform/'+scenario.view+'.html'+query,{waitUntil:'networkidle'});
      if(scenario.view==='cabinet'){
        const enabled=page.locator('#review-likes-toggle'),mail=page.locator('#review-likes-email-toggle');
        await page.waitForFunction(()=>!document.getElementById('review-likes-toggle').disabled);
        assert.equal(await enabled.isChecked(),true);assert.equal(await mail.isChecked(),false);
        assert.equal(await page.locator('#review-likes-list img,#review-likes-list script').count(),0);
        await mail.check({force:true});await page.waitForFunction(()=>document.getElementById('review-likes-status').textContent==='Настройки сохранены');assert.equal(fixture.settings.email,true);
        await enabled.uncheck({force:true});await page.waitForFunction(()=>document.getElementById('review-likes-email-toggle').disabled);assert.equal(fixture.settings.enabled,false);
        await page.waitForFunction(()=>!document.querySelector('.cab-like-notification'));
        assert.equal(await page.locator('.cab-like-notification').count(),0);
        await enabled.check({force:true});await page.waitForFunction(()=>!document.getElementById('review-likes-email-toggle').disabled);
        fixture.failSettings=true;await mail.uncheck({force:true});await page.waitForFunction(()=>document.getElementById('review-likes-status').textContent.includes('Не удалось сохранить'));
        assert.equal(await mail.isChecked(),true);assert.equal(fixture.settings.email,true);
        await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!document.getElementById('review-likes-email-toggle').disabled);assert.equal(await mail.isChecked(),true);
        await page.locator('.cab-like-history').scrollIntoViewIfNeeded();
      } else {
        if(scenario.view!=='recipe')await page.evaluate(()=>openComments('fixture'));
        const thread=page.locator('.review-discussion[data-discussion-id="1"]');await thread.waitFor();
        assert.equal((await thread.innerText()).includes('Полезный ответ'),false);
        assert.equal(await thread.locator('[data-discussion-action="like"]').count(),3);
        if(scenario.id){
          for(const [type,id,count] of [['review',1,2],['reply',1,3],['comment',7,1]]){
            const control=thread.locator(`[data-like-type="${type}"][data-like-id="${id}"]`);
            await control.click();await page.waitForFunction(({type,id})=>document.querySelector(`[data-like-type="${type}"][data-like-id="${id}"]`).getAttribute('aria-pressed')==='true',{type,id});
            assert.equal(await control.locator('.discussion-like-count').innerText(),String(count+1));
            await control.click();await page.waitForFunction(({type,id})=>document.querySelector(`[data-like-type="${type}"][data-like-id="${id}"]`).getAttribute('aria-pressed')==='false',{type,id});
            assert.equal(await control.locator('.discussion-like-count').innerText(),String(count));
          }
          fixture.failLike=true;const control=thread.locator('[data-like-type="review"]');await control.click();await thread.locator('.discussion-status:not(:empty)').waitFor();assert.equal(await control.getAttribute('aria-pressed'),'false');
          await control.click();await page.waitForFunction(()=>document.querySelector('[data-like-type="review"]').getAttribute('aria-pressed')==='true');
          assert.equal(fixture.writes.at(-1).active,fixture.writes.at(-2).active);
          if(scenario.view==='recipe'){
            await page.locator('#sp-updates-btn').click();assert.equal(await page.locator('[data-update-type="review_like"]').count(),1);assert.equal(await page.locator('#sp-updates-panel script,#sp-updates-panel img[src="x"]').count(),0);
            await page.locator('#sp-updates-btn').click();
          }
        } else {
          assert.match(await thread.locator('[data-like-type="review"]').getAttribute('aria-label'),/Войти/);assert.equal(fixture.writes.length,0);
        }
        await thread.scrollIntoViewIfNeeded();
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'overflow '+JSON.stringify(scenario));
      await page.screenshot({path:path.join(output,`${scenario.view}-${scenario.width}-${scenario.id||'guest'}.png`)});
      if(scenario.view==='cabinet'){
        await page.locator('.cab-like-notification').click();await page.waitForURL('**/recipe.html?id=fixture#review-1');assert.deepEqual(fixture.reads,[9]);await page.locator('#review-1').waitFor();
      }
      reports.push({...scenario,ok:true});await context.close();
    }
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({reports,errors},null,2));console.log('REVIEW_LIKES_BROWSER_OK',JSON.stringify(reports));
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
