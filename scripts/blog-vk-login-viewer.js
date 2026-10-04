const http = require('node:http');
const { CHANNEL_URL } = require('./blog-vk-links');
const LOGIN_ORIGINS = new Set(['https://vk.ru', 'https://vk.com', 'https://id.vk.ru', 'https://id.vk.com']);

function isVkPage(page) {
    if (page.isClosed()) return false;
    try { return LOGIN_ORIGINS.has(new URL(page.url()).origin); }
    catch { return false; }
}

function createView(token) {
    return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход в канал ВК на сервере</title>
<style>body{margin:0;background:#edf1f6;font:16px Arial}header{padding:12px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,input{padding:9px 14px}button{cursor:pointer}img{display:block;max-width:100%;margin:auto;outline:none;background:white}p{margin:0 20px 10px;color:#475569}#entry{min-width:220px}</style>
<header><strong>Вход в канал ВК на сервере</strong><button id="open">Открыть канал после входа</button>
<form id="typing" autocomplete="off"><input id="entry" type="password" autocomplete="off" aria-label="Номер телефона или код" placeholder="Номер телефона или код"><button>Ввести в выбранное поле ВК</button></form></header>
<p>Нажмите на нужное поле в окне ВК ниже. Можно печатать прямо в нём или ввести номер/код в поле сверху и нажать кнопку. Когда откроются посты, сборщик сохранит вход автоматически. Окно можно закрыть самостоятельно.</p>
<p id="status" role="status">Соединение с окном ВК…</p><img id="screen" tabindex="0" draggable="false" alt="Окно ВК на сервере">
<script>
const display=document.getElementById('screen'),entry=document.getElementById('entry'),status=document.getElementById('status'),token='${token}';let busy=false,oldUrl,queue=Promise.resolve();
function action(data){queue=queue.then(async()=>{const response=await fetch('/action',{method:'POST',headers:{'X-Blog-VK-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});if(!response.ok)throw new Error();status.textContent='Действие выполнено.';}).catch(()=>{status.textContent='Не удалось передать действие. Дождитесь изображения и повторите.';});return queue;}
async function frame(){if(busy)return;busy=true;try{const response=await fetch('/frame',{headers:{'X-Blog-VK-Token':token}});if(!response.ok)throw new Error();const url=URL.createObjectURL(await response.blob());display.src=url;if(oldUrl)URL.revokeObjectURL(oldUrl);oldUrl=url;if(status.textContent==='Соединение с окном ВК…')status.textContent='Окно ВК подключено.';}catch{status.textContent='Окно ВК временно недоступно. Повторяем соединение…';}finally{busy=false;}}
display.onclick=e=>{display.focus();const r=display.getBoundingClientRect();action({type:'click',x:(e.clientX-r.left)*display.naturalWidth/r.width,y:(e.clientY-r.top)*display.naturalHeight/r.height});};
display.onwheel=e=>{e.preventDefault();action({type:'wheel',y:e.deltaY});};
display.onkeydown=e=>{if(e.ctrlKey||e.altKey||e.metaKey)return;e.preventDefault();action({type:'key',key:e.key});};
display.onpaste=e=>{e.preventDefault();action({type:'text',text:e.clipboardData.getData('text')});};
document.getElementById('typing').onsubmit=e=>{e.preventDefault();const text=entry.value;entry.value='';if(text)action({type:'text',text});};
document.getElementById('open').onclick=()=>action({type:'channel'});frame();setInterval(frame,1000);
</script></html>`;
}

function createViewerServer({ page, token, port = 19230 }) {
    const configured = new WeakSet();
    let actionQueue = Promise.resolve();
    async function activePage() {
        // VK sign-in popups share the collector's context. Show their form while it is open.
        const selected = page.context().pages().filter(isVkPage).at(-1);
        if (!selected) throw new Error('SERVER_BROWSER_SCOPE_INVALID');
        if (!configured.has(selected)) {
            await selected.setViewportSize({ width: 1280, height: 800 });
            configured.add(selected);
        }
        return selected;
    }
    async function perform(action) {
        if (action.type === 'channel') {
            if (page.isClosed()) throw new Error();
            await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
            for (const popup of page.context().pages()) {
                if (popup !== page && isVkPage(popup)) await popup.close();
            }
            return;
        }
        const target = await activePage();
        if (action.type === 'click' && Number.isFinite(action.x) && Number.isFinite(action.y)
            && action.x >= 0 && action.x <= 1280 && action.y >= 0 && action.y <= 800) await target.mouse.click(action.x, action.y);
        else if (action.type === 'wheel' && Number.isFinite(action.y)) await target.mouse.wheel(0, Math.max(-800, Math.min(800, action.y)));
        else if (action.type === 'text' && typeof action.text === 'string' && action.text.length <= 1024) await target.keyboard.type(action.text);
        else if (action.type === 'key' && typeof action.key === 'string') {
            if (action.key.length === 1) await target.keyboard.type(action.key);
            else if (['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(action.key)) await target.keyboard.press(action.key);
            else throw new Error();
        } else throw new Error();
    }
    return http.createServer(async (request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        if (request.headers.host !== `127.0.0.1:${port}`) { response.writeHead(403).end(); return; }
        if (request.url === '/' && request.method === 'GET') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(createView(token)); return;
        }
        if (request.headers['x-blog-vk-token'] !== token) { response.writeHead(403).end(); return; }
        try {
            if (request.url === '/frame' && request.method === 'GET') {
                const target = await activePage();
                response.setHeader('Content-Type', 'image/jpeg');
                response.end(await target.screenshot({ type: 'jpeg', quality: 75 })); return;
            }
            if (request.url !== '/action' || request.method !== 'POST') { response.writeHead(404).end(); return; }
            let body = '';
            for await (const part of request) { body += part; if (body.length > 8192) throw new Error(); }
            const action = JSON.parse(body);
            const pending = actionQueue.then(() => perform(action));
            actionQueue = pending.catch(() => {});
            await pending;
            response.end('{}');
        } catch { response.writeHead(400).end('{}'); }
    });
}

module.exports = { createViewerServer, isVkPage };
