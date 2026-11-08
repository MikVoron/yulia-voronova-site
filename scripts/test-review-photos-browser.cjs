'use strict';
// Real pages and browser image compression; deterministic API fixtures, no mail.
const { chromium }=require('playwright-core');
const sharp=require('../server/node_modules/sharp');
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/photo-browser');
const server=http.createServer(async(req,res)=>{
  const relative=new URL(req.url,'http://local').pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(relative));
  if(!file.startsWith(root+path.sep)||!/^\/(platform|images)\//.test(relative)||!/\.(html|js|css|webp|png|svg|jpe?g)$/.test(file)){res.writeHead(404);res.end();return;}
  try{const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(data);}
  catch{res.writeHead(404);res.end();}
});
async function run(){
  await fs.mkdir(output,{recursive:true});
  const source=await fs.readFile(path.join(root,'images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-final.webp'));
  const original=await sharp(source).resize(2400,1800,{fit:'fill'}).jpeg({quality:95}).toBuffer();
  const preview=await sharp(source).resize(320,320,{fit:'inside'}).webp().toBuffer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-dev-shm-usage']});
  const reports=[];
  try{
    for(const scenario of [
      {view:'recipe',width:1320,newReview:true},{view:'recipe',width:390,newReview:true},{view:'recipe',width:320,newReview:true},
      {view:'category',width:320},{view:'ingredient',width:390},{view:'recipe',width:320,guest:true},{view:'admin',width:1320},{view:'admin',width:320},
    ]){
      // Playwright's SW-blocking init script throws in the existing opaque
      // sandboxed email-preview iframe on admin.html. Local admin fixtures have
      // no worker registration; all external requests are still aborted below.
      const context=await browser.newContext({viewport:{width:scenario.width,height:900},serviceWorkers:scenario.view==='admin'?'allow':'block'});
      const page=await context.newPage();page.setDefaultTimeout(15000);
      const errors=[];page.on('pageerror',error=>errors.push(error.stack || error.message));
      const user=scenario.guest?null:{id:scenario.view==='admin'?'admin':'u1',email:'fixture@example.test',name:'Анна',role:scenario.view==='admin'?'admin':'user'};
      await context.addInitScript(user=>{if(window.top!==window)return;if(user){localStorage.setItem('hp_user',JSON.stringify(user));sessionStorage.setItem('hp_st','fixture');}},user);
      const recipe={id:'fixture',name:'Паста с тунцом',cat:'breakfasts',categories:['breakfasts'],access_level:'free',is_free:true,is_published:true,ingredients:[{name:'Овсянка',amount:40,unit:'г'}],steps:[{text:'Приготовьте блюдо.'}],main_ingredients:['oatmeal'],photo:'../images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-final.webp',kcal:100};
      const reviews=[{id:2,stars:4,text:'Очень вкусно',userId:'u2',author:'Мария',createdAt:'2026-11-01T10:00:00Z',comments:[],commentCount:0}];
      if(!scenario.newReview)reviews.push({id:1,stars:5,text:'Приготовила по рецепту',userId:'u1',author:'Анна',createdAt:'2026-11-02T10:00:00Z',comments:[],commentCount:0});
      let photos=scenario.newReview?[]:[{id:randomUUID(),reviewId:1,status:scenario.view==='admin'?'pending':'approved',width:1200,height:900,createdAt:'2026-11-02T10:00:00Z',recipeName:recipe.name,recipeId:'fixture',author:'Анна'}];
      const requests=new Map();let failed=false,ratingWrites=0,uploadAttempts=0,uploadedBytes=0;
      const decorate=photo=>({...photo,url:'/content/review-photos/'+photo.id+'/main',thumbnail:'/content/review-photos/'+photo.id+'/thumb'});
      await page.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),method=request.method(),p=url.pathname.replace(/^\/api/,'');
        const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
        if(url.hostname==='api.voronova.online'||url.pathname.startsWith('/api/')){
          const payload=request.headers()['content-type']?.includes('application/json')?request.postDataJSON():null;
          if(p==='/content/review-photos/config')return json({enabled:true,maxPhotos:3,maxInputBytes:20*1024*1024});
          if(p==='/content/review-photos')return json({photos:photos.filter(photo=>photo.status==='approved'||user?.id==='u1').map(decorate)});
          const upload=p.match(/^\/content\/reviews\/(\d+)\/photos\/([^/]+)$/);
          if(upload&&method==='PUT'){
            uploadAttempts++;const bytes=request.postDataBuffer();
            if(bytes.toString()==='invalid-heic-fixture')return json({error:'Не удалось прочитать фотографию. Попробуйте другой снимок.'},422);
            uploadedBytes=bytes.length;
            const meta=await sharp(bytes).metadata();assert.ok(meta.width<=1200&&meta.height<=1200);assert.ok(bytes.length<original.length);
            let photo=requests.get(upload[2]);
            if(!photo){photo={id:randomUUID(),reviewId:Number(upload[1]),status:'pending',width:meta.width,height:meta.height,createdAt:new Date().toISOString()};requests.set(upload[2],photo);photos.push(photo);}
            if(!failed){failed=true;return route.abort('connectionfailed');}
            return json({photo:decorate(photo)},201);
          }
          if(/photo-batches\/[^/]+\/complete$/.test(p))return json({ok:true});
          if(/^\/content\/review-photos\/[^/]+\/(main|thumb)$/.test(p))return route.fulfill({contentType:'image/webp',body:preview});
          if(/^\/content\/review-photos\/[^/]+$/.test(p)&&method==='DELETE'){photos=photos.filter(photo=>photo.id!==p.split('/').at(-1));return json({ok:true});}
          if(p==='/admin/review-photos')return json({photos:photos.filter(photo=>photo.status===(url.searchParams.get('status')||'pending')).map(decorate),pendingCount:photos.filter(photo=>photo.status==='pending').length,next:null});
          if(/^\/admin\/review-photos\/[^/]+$/.test(p)&&method==='PUT'){const photo=photos.find(photo=>photo.id===p.split('/').at(-1));photo.status=payload.status;return json({photo:decorate(photo)});}
          if(p==='/auth/me')return json({...user,displayName:'Анна',subscription:{status:'active',activeUntil:'2027-01-01'}});
          if(p==='/content/recipes'||p==='/admin/recipes')return json([recipe]);
          if(p==='/content/categories'||p==='/admin/categories')return json([{id:'breakfasts',name:'Завтраки',emoji:'🍴',sort_order:0}]);
          if(p==='/content/ingredients')return json([{id:'oatmeal',name:'Овсянка',aliases:[],sort_order:0,is_active:true}]);
          if(p==='/content/reviews/fixture')return json(reviews);
          if(p==='/content/reviews'&&method==='POST'){ratingWrites++;reviews.push({id:1,userId:'u1',author:'Анна',stars:payload.stars,text:payload.text,createdAt:new Date().toISOString(),comments:[],commentCount:0});return json({id:1});}
          if(p==='/content/ratings')return json({fixture:{avg:4.5,count:reviews.length}});
          if(['/favorites','/plates','/content/news','/admin/video-requests'].includes(p))return json([]);
          if(p.startsWith('/content/video-requests'))return json({votes:0,goal:10,status:'collecting',voted:false});
          if(p==='/subscription/early-bird')return json({prices:{'1':399}});
          if(p==='/admin/feedback')return json({items:[],totalNew:0});
          return json({ok:true});
        }
        if(url.origin===origin)return route.continue();
        return route.abort();
      });
      const query=scenario.view==='recipe'?'?id=fixture':scenario.view==='category'?'?cat=breakfasts':scenario.view==='admin'?'?tab=review-photos':'?id=oatmeal';
      await page.goto(origin+'/platform/'+scenario.view+'.html'+query,{waitUntil:'networkidle'});
      if(['category','ingredient'].includes(scenario.view))await page.evaluate(()=>openComments('fixture'));
      if(scenario.newReview){
        await page.locator('#review-action-btn').click();
        await page.locator('[data-recipe-action="set-review-stars"][data-n="5"]').click();
        await page.locator('#review-text').fill('Приготовила, получилось вкусно!');
        const picker=page.locator('#review-form-wrap [data-review-photo-picker]');
        await picker.locator('input[type=file]').setInputFiles({name:'Моё блюдо.jpg',mimeType:'image/jpeg',buffer:original});
        await page.waitForFunction(()=>document.querySelector('#review-form-wrap .review-photo-status')?.textContent.includes('готовы'));
        await page.locator('#review-submit-btn').click();
        await picker.locator('.review-photo-status').filter({hasText:'Повторите отправку'}).waitFor();
        assert.equal(await page.locator('#review-text').inputValue(),'Приготовила, получилось вкусно!');
        assert.equal(ratingWrites,1);assert.equal(photos.length,1);
        await page.locator('#review-submit-btn').click();
        const gallery=page.locator('[data-review-photo-id="1"]');
        await gallery.locator('.review-photo-state').filter({hasText:'На проверке'}).waitFor();
        assert.equal(ratingWrites,1);assert.equal(photos.length,1);assert.equal(uploadAttempts,2);
        const standalone=gallery.locator('[data-review-photo-picker]');
        const file=n=>({name:'Блюдо '+n+'.jpg',mimeType:'image/jpeg',buffer:original});
        await standalone.locator('input').setInputFiles([file(2),file(3),file(4)]);
        await standalone.locator('.review-photo-status').filter({hasText:'до 3 фото'}).waitFor();
        assert.equal(await standalone.locator('.review-photo-selected-item').count(),0);
        await standalone.locator('input').setInputFiles([file(2),file(3)]);
        await page.waitForFunction(()=>document.querySelector('[data-review-photo-id="1"] .review-photo-status')?.textContent.includes('готовы'));
        await standalone.locator('[data-photo-action="send"]').click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-review-photo-id="1"] .review-photo-card').length===3);
        assert.equal(photos.length,3);
        assert.equal(await standalone.locator('[data-photo-action="choose"]').isDisabled(),true);
        await gallery.locator('[data-photo-action="view"]').first().click();
        await page.locator('dialog.review-photo-viewer img:not([hidden])').waitFor();
        await page.keyboard.press('Escape');await page.locator('dialog.review-photo-viewer').waitFor({state:'detached'});
        await page.evaluate(()=>{window.showAppConfirm=async()=>true;});
        await gallery.locator('[data-photo-action="delete"]').first().click();
        await page.waitForFunction(()=>document.querySelectorAll('[data-review-photo-id="1"] .review-photo-card').length===2);
        await standalone.locator('input').setInputFiles({name:'Повреждённое.heic',mimeType:'image/heic',buffer:Buffer.from('invalid-heic-fixture')});
        await standalone.locator('.review-photo-status').filter({hasText:'готовы'}).waitFor();
        await standalone.locator('[data-photo-action="send"]').click();
        await standalone.locator('.review-photo-status').filter({hasText:'Не удалось прочитать'}).waitFor();
        assert.equal(await standalone.locator('[data-photo-action="remove-selected"]').isDisabled(),false);
        await standalone.locator('[data-photo-action="remove-selected"]').click();
        assert.equal(await standalone.locator('.review-photo-selected-item').count(),0);
        assert.equal(photos.length,2);
        await gallery.scrollIntoViewIfNeeded();
      }else if(scenario.view==='admin'){
        const card=page.locator('.admin-photo-card');await card.waitFor();
        await card.locator('[data-admin-photo-action="view"]').click();
        await page.locator('dialog.review-photo-viewer img:not([hidden])').waitFor();await page.keyboard.press('Escape');await page.locator('dialog.review-photo-viewer').waitFor({state:'detached'});
        await card.locator('[data-admin-photo-action="approved"]').click();
        await page.locator('#admin-photo-info').filter({hasText:'одобрено'}).waitFor();
        await page.locator('#admin-photo-filter').selectOption('approved');await page.locator('.admin-photo-card').waitFor();
      }else{
        await page.locator('[data-review-photo-id="1"] .review-photo-open img').waitFor();
        if(scenario.guest)assert.equal(await page.locator('[data-review-photo-picker] .review-photo-button').count(),0);
        await page.locator('[data-review-photo-id="1"]').scrollIntoViewIfNeeded();
      }
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(overflow,false,JSON.stringify(scenario)+' overflow');assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(output,scenario.view+'-'+scenario.width+(scenario.guest?'-guest':'')+'.png'),fullPage:false});
      reports.push({...scenario,ratingWrites,uploadAttempts,originalBytes:original.length,uploadedBytes,overflow,errors});
      await context.close();
    }
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(reports,null,2));
    console.log('REVIEW_PHOTOS_BROWSER_OK '+reports.length+' scenarios');
  }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
