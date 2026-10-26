'use strict';
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/review-discussions-20261026/browser');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req,res) => {
    const relative = decodeURIComponent(new URL(req.url,'http://local').pathname);
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep) || !/^\/(platform|images)\//.test(relative) || !/\.(html|js|css|svg|webp|png|jpe?g)$/.test(file)) { res.writeHead(404); res.end(); return; }
    fs.readFile(file,(error,body)=>{
        if(error){res.writeHead(404);res.end();return;}
        const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}); res.end(body);
    });
});
async function run() {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const errors = [];
    const reports = [];
    try {
        for (const scenario of [
            {view:'recipe',width:1366,id:'u1'}, {view:'recipe',width:390,id:'u1'},
            {view:'category',width:390,id:'u1'}, {view:'ingredient',width:390,id:'u1'},
            {view:'recipe',width:390,id:null}, {view:'recipe',width:390,id:'u3'}, {view:'recipe',width:390,id:'admin'},
        ]) {
            const context = await browser.newContext({viewport:{width:scenario.width,height:900}});
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror',error=>errors.push(scenario.view+': '+error.message));
            const fixture = {
                posts:[], ratingWrites:[], failOnce:true, saved:new Map(),
                comments:Array.from({length:23},(_,i)=>({id:i+1,userId:i===0?'u1':'u2',author:i===0?'Анна':'Мария',text:i===1?'<img src=x onerror="window.__xss=1">':'Дополнение '+(i+1),createdAt:new Date(Date.UTC(2026,9,1,10,i)).toISOString(),isAuthor:false})),
            };
            const currentUser = scenario.id ? {id:scenario.id,email:'fixture@example.test',name:'Анна',role:scenario.id==='admin'?'admin':'user'} : null;
            await context.addInitScript(user=>{if(user){localStorage.setItem('hp_user',JSON.stringify(user));sessionStorage.setItem('hp_st','fixture');}},currentUser);
            const recipe = {id:'fixture',name:'Тестовый рецепт',cat:'breakfasts',categories:['breakfasts'],access_level:'free',is_free:true,is_published:true,ingredients:[{name:'Овсянка',amount:40,unit:'г'}],steps:[{text:'Приготовьте кашу.'}],main_ingredients:['oatmeal'],photo:'images/YV-blog.webp',kcal:100};
            const reviews = [{id:1,stars:4,text:'Первый опыт',userId:'u1',author:'Анна',createdAt:'2026-09-30T10:00:00.000Z',reply:{text:'Попробуйте сократить время.',createdAt:'2026-10-01T10:05:30.000Z',helpfulCount:2,helpfulByCurrentUser:false}},{id:2,stars:5,text:'Отлично',userId:'u2',author:'Мария',createdAt:'2026-09-30T11:00:00.000Z',reply:null,comments:[],commentCount:0}];
            await page.route('**/*',async route=>{
                const url = new URL(route.request().url());
                const method = route.request().method();
                const payload = route.request().postDataJSON();
                const json = (data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
                const p = url.pathname.replace(/^\/api/,'');
                if(url.hostname==='api.voronova.online'||url.pathname.startsWith('/api/')) {
                    if(p==='/auth/me')return json({...currentUser,displayName:'Анна',subscription:{status:'active',activeUntil:'2027-01-01'}});
                    if(p==='/content/recipes')return json([recipe]);
                    if(p==='/content/categories')return json([{id:'breakfasts',name:'Завтраки',emoji:'🍴',sort_order:0}]);
                    if(p==='/content/ingredients')return json([{id:'oatmeal',name:'Овсянка',aliases:[],sort_order:0,is_active:true}]);
                    if(p==='/content/reviews/fixture')return json(reviews.map(rv=>rv.id===1?{...rv,comments:fixture.comments.slice(0,5),commentCount:fixture.comments.length}:rv));
                    if(p==='/content/reviews/1/comments'&&method==='GET') {const items=fixture.comments.filter(c=>c.id>Number(url.searchParams.get('after')||0));return json({comments:items.slice(0,20),hasMore:items.length>20});}
                    if(p==='/content/reviews/1/comments'&&method==='POST') {
                        fixture.posts.push(payload);
                        let comment = fixture.saved.get(payload.requestId);
                        if(!comment){comment={id:100,userId:scenario.id,author:'Анна',text:payload.text,createdAt:'2026-10-26T10:00:00.000Z',isAuthor:scenario.id==='admin'};fixture.saved.set(payload.requestId,comment);fixture.comments.push(comment);}
                        if(fixture.failOnce){fixture.failOnce=false;return route.abort('connectionfailed');}
                        return json({comment},201);
                    }
                    if(/^\/content\/review-comments\/\d+$/.test(p)) {
                        const id = Number(p.split('/').at(-1));
                        if(method==='PATCH'){fixture.comments.find(c=>c.id===id).text=payload.text;return json({ok:true});}
                        if(method==='DELETE'){fixture.comments=fixture.comments.filter(c=>c.id!==id);return json({ok:true});}
                    }
                    if(p==='/content/reviews'&&method==='POST'){fixture.ratingWrites.push(payload);reviews[0].stars=payload.stars;if(payload.text!==undefined)reviews[0].text=payload.text;return json({id:1});}
                    if(p==='/content/ratings')return json({fixture:{avg:4.5,count:2}});
                    if(p==='/favorites'||p==='/plates'||p==='/content/news')return json([]);
                    if(p.startsWith('/content/video-requests'))return json({votes:0,goal:10,status:'collecting',voted:false});
                    if(p==='/subscription/early-bird')return json({prices:{'1':399}});
                    return json({ok:true});
                }
                if(url.origin===origin)return route.continue();
                return route.abort();
            });
            const query=scenario.view==='recipe'?'?id=fixture':scenario.view==='category'?'?cat=breakfasts':'?id=oatmeal';
            await page.goto(origin+'/platform/'+scenario.view+'.html'+query,{waitUntil:'networkidle'});
            if(scenario.view!=='recipe') await page.evaluate(()=>openComments('fixture'));
            const thread = page.locator('.review-discussion[data-discussion-id="1"]');
            await thread.waitFor();
            assert.equal(await thread.locator('.discussion-message[data-comment-id]').count(),5);
            assert.equal(await page.evaluate(()=>window.__xss||0),0);
            assert.equal(await thread.locator('.discussion-text img').count(),0);
            if(!scenario.id){assert.equal(await thread.locator('.discussion-form').isVisible(),false);assert.match(await thread.locator('a').getAttribute('href'),/login.html/);}
            else {
                const first=thread.locator('[data-comment-id="1"]').first();
                assert.equal(await first.locator('[data-discussion-action="edit"]').count(),scenario.id==='u1'?1:0);
                assert.equal(await first.locator('[data-discussion-action="delete"]').count(),['u1','admin'].includes(scenario.id)?1:0);
                await thread.locator('[data-discussion-action="open"]').click();
                const textarea=thread.locator('textarea');
                await textarea.fill('Приготовила ещё раз — получилось!');
                await thread.locator('.discussion-send').click();
                await thread.locator('.discussion-error:not(:empty)').waitFor();
                assert.equal(await textarea.inputValue(),'Приготовила ещё раз — получилось!');
                await thread.locator('.discussion-send').click();
                await thread.locator('.discussion-form[hidden]').waitFor({state:'attached'});
                assert.equal(fixture.posts.length,2); assert.equal(fixture.posts[0].requestId,fixture.posts[1].requestId);
                assert.equal(await thread.locator('.discussion-message[data-comment-id="100"]').count(),1);
                assert.equal(fixture.ratingWrites.length,0);
                await thread.locator('[data-discussion-action="more"]').click();
                await thread.locator('.discussion-more[hidden]').waitFor({state:'attached'});
                assert.equal(await thread.locator('.discussion-message[data-comment-id]').count(),24);
                const sequence = await thread.locator('.discussion-messages').innerText();
                assert.ok(sequence.indexOf('Дополнение 6')<sequence.indexOf('Попробуйте сократить время.'));
                assert.ok(sequence.indexOf('Попробуйте сократить время.')<sequence.indexOf('Дополнение 7'));
                const own = thread.locator('.discussion-message[data-comment-id="100"]');
                await own.locator('[data-discussion-action="edit"]').click();
                await textarea.fill('Уточнение: пекла на 5 минут меньше.');
                await thread.locator('.discussion-send').click();
                await thread.locator('.discussion-form[hidden]').waitFor({state:'attached'});
                assert.equal(await own.locator('.discussion-text').innerText(),'Уточнение: пекла на 5 минут меньше.');
                await page.evaluate(()=>{window.showAppConfirm=async()=>true;});
                await own.locator('[data-discussion-action="delete"]').click();
                await own.waitFor({state:'detached'});
                assert.equal(fixture.ratingWrites.length,0);
                if(scenario.id==='u1') {
                    const edit = page.locator('[data-'+(scenario.view==='recipe'?'recipe':scenario.view)+'-action="edit-own-review"]');
                    await edit.click();
                    const field=page.locator(scenario.view==='recipe'?'#review-text':'#c-text');
                    assert.equal(await field.inputValue(),'Первый опыт');
                    await field.fill('Теперь получается отлично');
                    await page.locator(scenario.view==='recipe'?'#review-submit-btn':'#c-submit-btn').click();
                    await page.waitForFunction(()=>!document.querySelector('.discussion-form:not([hidden])'));
                    assert.equal(fixture.ratingWrites.length,1);
                    assert.equal(fixture.ratingWrites[0].stars,4);
                    await page.waitForFunction(()=>document.body.innerText.includes('Теперь получается отлично'));
                    assert.ok(await thread.locator('.discussion-message').count()>0);
                }
            }
            if(scenario.view==='recipe'){assert.equal(await page.locator('#recipe-voter-count').innerText(),'(2)');assert.equal(await page.locator('#recipe-rating-val').innerText(),'4.5');}
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
            await page.evaluate(view => {
                document.documentElement.style.scrollBehavior='auto';
                const target=document.querySelector(view==='recipe'?'#reviews-section':'#comments-body');
                window.scrollTo({top:scrollY+target.getBoundingClientRect().top-110,behavior:'instant'});
            },scenario.view);
            await page.screenshot({path:path.join(output,scenario.view+'-'+scenario.width+'-'+(scenario.id||'guest')+'.png')});
            reports.push({...scenario,ok:true});
            await context.close();
        }
        assert.deepEqual(errors,[]);
        fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({reports,errors},null,2));
        console.log('REVIEW_DISCUSSIONS_BROWSER_OK',JSON.stringify(reports));
    } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
