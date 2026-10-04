const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');
const { CHANNEL_URL } = require('./blog-vk-links');

const PRIVATE_DIR = path.join(__dirname, '..', '.blog-sync-private');
const TOKEN = crypto.randomBytes(24).toString('hex');
const PORT = 19230;
const VIEW = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Вход в канал ВК на сервере</title>
<style>body{margin:0;background:#edf1f6;font:16px Arial}header{padding:12px 20px;display:flex;gap:20px;align-items:center}button{padding:9px 14px;cursor:pointer}img{display:block;max-width:100%;margin:auto;outline:none;background:white}span{color:#475569}</style>
<header><strong>Вход в канал ВК на сервере</strong><button id="open">Открыть канал после входа</button><span>Пройдите проверку ВК в окне ниже. Вход сохранится автоматически.</span></header>
<img id="screen" tabindex="0" draggable="false" alt="Окно ВК на сервере">
<script>
const screen=document.getElementById('screen'),token='${TOKEN}';let busy=false,oldUrl;
async function action(data){await fetch('/action',{method:'POST',headers:{'X-Blog-VK-Token':token,'Content-Type':'application/json'},body:JSON.stringify(data)});}
async function frame(){if(busy)return;busy=true;try{const response=await fetch('/frame',{headers:{'X-Blog-VK-Token':token}});if(response.ok){const url=URL.createObjectURL(await response.blob());screen.src=url;if(oldUrl)URL.revokeObjectURL(oldUrl);oldUrl=url;}}finally{busy=false;}}
screen.onclick=e=>{screen.focus();const r=screen.getBoundingClientRect();action({type:'click',x:(e.clientX-r.left)*1280/r.width,y:(e.clientY-r.top)*800/r.height});};
screen.onwheel=e=>{e.preventDefault();action({type:'wheel',y:e.deltaY});};
screen.onkeydown=e=>{if(e.ctrlKey||e.altKey||e.metaKey)return;e.preventDefault();action({type:'key',key:e.key});};
screen.onpaste=e=>{e.preventDefault();action({type:'text',text:e.clipboardData.getData('text')});};
document.getElementById('open').onclick=()=>action({type:'channel'});frame();setInterval(frame,1000);
</script></html>`;

async function main() {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const tunnel = spawn('ssh', ['-N', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30',
        '-L', '127.0.0.1:19223:127.0.0.1:9223', 'smartplate-admin@5.42.119.198'], { stdio: 'ignore', windowsHide: true });
    let localBrowser;
    let server;
    try {
        let remoteBrowser;
        for (let attempt = 0; attempt < 20; attempt++) {
            try { remoteBrowser = await chromium.connectOverCDP('http://127.0.0.1:19223', { timeout: 3000 }); break; }
            catch { await new Promise(resolve => setTimeout(resolve, 500)); }
        }
        if (!remoteBrowser) throw new Error('SERVER_BROWSER_UNAVAILABLE');
        const pages = remoteBrowser.contexts().flatMap(context => context.pages());
        const page = pages.find(candidate => ['https://vk.ru', 'https://vk.com', 'https://id.vk.ru', 'https://id.vk.com']
            .includes(new URL(candidate.url()).origin));
        if (!page || pages.length !== 1) throw new Error('SERVER_BROWSER_SCOPE_INVALID');
        await page.setViewportSize({ width: 1280, height: 800 });
        server = http.createServer(async (request, response) => {
            response.setHeader('Cache-Control', 'no-store');
            if (request.headers.host !== `127.0.0.1:${PORT}`) { response.writeHead(403).end(); return; }
            if (request.url === '/' && request.method === 'GET') {
                response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(VIEW); return;
            }
            if (request.headers['x-blog-vk-token'] !== TOKEN) { response.writeHead(403).end(); return; }
            try {
                if (request.url === '/frame' && request.method === 'GET') {
                    response.setHeader('Content-Type', 'image/jpeg');
                    response.end(await page.screenshot({ type: 'jpeg', quality: 75 })); return;
                }
                if (request.url !== '/action' || request.method !== 'POST') { response.writeHead(404).end(); return; }
                let body = '';
                for await (const part of request) { body += part; if (body.length > 8192) throw new Error(); }
                const action = JSON.parse(body);
                if (action.type === 'click' && Number.isFinite(action.x) && Number.isFinite(action.y)
                    && action.x >= 0 && action.x <= 1280 && action.y >= 0 && action.y <= 800) await page.mouse.click(action.x, action.y);
                else if (action.type === 'wheel' && Number.isFinite(action.y)) await page.mouse.wheel(0, Math.max(-800, Math.min(800, action.y)));
                else if (action.type === 'text' && typeof action.text === 'string' && action.text.length <= 1024) await page.keyboard.insertText(action.text);
                else if (action.type === 'key' && typeof action.key === 'string') {
                    if (action.key.length === 1) await page.keyboard.insertText(action.key);
                    else if (['Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(action.key)) await page.keyboard.press(action.key);
                    else throw new Error();
                } else if (action.type === 'channel') await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
                else throw new Error();
                response.end('{}');
            } catch { response.writeHead(400).end('{}'); }
        });
        await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
        localBrowser = await chromium.launch({ headless: false, channel: 'chrome' });
        const localPage = await localBrowser.newPage({ viewport: { width: 1360, height: 950 } });
        await localPage.goto(`http://127.0.0.1:${PORT}`);
        fs.writeFileSync(path.join(PRIVATE_DIR, 'server-login-window.json'), JSON.stringify({ phase: 'awaiting-server-login' }));
        const deadline = Date.now() + 20 * 60 * 1000;
        while (Date.now() < deadline) {
            if (new URL(page.url()).pathname === '/im/channels/-232523704'
                && await page.locator('.ChannelMain .ChannelPostWrapper .PostText').count()) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                fs.writeFileSync(path.join(PRIVATE_DIR, 'server-login-window.json'), JSON.stringify({ phase: 'channel-visible' }));
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } finally {
        await localBrowser?.close().catch(() => {});
        server?.close();
        tunnel.kill();
        // The remote collector owns its browser. End only this local control client.
        setTimeout(() => process.exit(), 100).unref();
    }
}

if (require.main === module) main().catch(() => {
    console.error('Server VK login viewer stopped. No session or screen contents were logged.');
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100).unref();
});
