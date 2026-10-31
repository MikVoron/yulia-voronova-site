'use strict';
// Serves the working files at production origins with the configured CSP.
// Uses the real Jivo widget; never sends a message or calls production APIs.
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mainOnly = process.argv.includes('--live-main');
const live = mainOnly || process.argv.includes('--live');
const output = path.join(root, 'tmp/jivo-20261030', live ? 'live' : 'preview');
const csp = fs.readFileSync(path.join(root, 'server/nginx/plate.voronova.online'), 'utf8').match(/add_header Content-Security-Policy "([^"]+)"/)[1];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const reports = [];
    async function context(mobile = false, blocked = false) {
        const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, ...(mobile ? {userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'} : {}), isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
        const requests = [], errors = [];
        ctx.on('request', r => requests.push(r.url()));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', msg => { if (msg.text().includes('Content Security Policy') || msg.text().includes('violates the following')) errors.push(msg.text()); });
        await ctx.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (/tawk\.(?:to|link)/i.test(url.hostname)) throw new Error('Unexpected Tawk request');
            if (url.hostname === 'api.voronova.online') {
                if (live) return ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"providers":[]}' });
            }
            if (/mc\.yandex|google-analytics|googletagmanager/.test(url.hostname)) return route.abort();
            if (url.hostname === 'code.jivosite.com' && blocked) return route.fulfill({status:200,contentType:'text/javascript',body:'/* stalled widget */'});
            if (live) return route.continue();
            if (!['voronova.online', 'plate.voronova.online'].includes(url.hostname)) return route.continue();
            if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"recipes":[],"categories":[],"ingredients":[]}' });
            const base = url.hostname === 'plate.voronova.online' ? path.join(root, 'platform') : root;
            const file = path.resolve(base, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
            assert(file.startsWith(base + path.sep));
            if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
            const headers = {};
            if (url.hostname === 'plate.voronova.online') headers['Content-Security-Policy'] = csp;
            return route.fulfill({ status: 200, headers, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
        });
        return { ctx, page, requests, errors };
    }
    try {
        for (const mobile of [false, true]) {
            const { ctx, page, requests, errors } = await context(mobile);
            await page.goto('https://voronova.online/', { waitUntil: 'domcontentloaded' });
            assert(!requests.some(u => u.includes('jivosite.com')));
            await page.locator('#chatLauncherBtn').click();
            await page.locator('#supportOpenBtn').click();
            await page.waitForFunction(() => document.documentElement.classList.contains('jivo-support-open'), { timeout: 30000 });
            await page.locator('textarea[placeholder="Введите сообщение"]:visible').waitFor({ state: 'visible', timeout: 30000 });
            await page.locator('textarea[placeholder="Введите сообщение"]:visible').click();
            await page.waitForTimeout(750); // Let the vendor's opening transition finish.
            const header = await page.locator('jdiv[class^="headerBox"]:visible').first().evaluate(el => ({top:el.getBoundingClientRect().top,parentTop:el.parentElement.getBoundingClientRect().top,scrollTop:el.parentElement.scrollTop,scrollHeight:el.parentElement.scrollHeight,height:el.parentElement.clientHeight}));
            assert(header.top >= header.parentTop, 'The Jivo header must remain visible: '+JSON.stringify(header));
            await page.screenshot({ path: path.join(output, mobile ? 'main-mobile.png' : 'main-desktop.png') });
            await page.evaluate(() => window.jivo_api.close());
            await page.waitForFunction(() => !document.documentElement.classList.contains('jivo-support-open'));
            await page.locator('#chatLauncherBtn').click();
            await page.locator('#supportOpenBtn').click();
            await page.waitForFunction(() => document.documentElement.classList.contains('jivo-support-open'));
            assert.equal(requests.filter(u => u === 'https://code.jivosite.com/widget/dQilQUP0Lq').length, 1);
            reports.push({ scenario: 'main '+(mobile?'mobile':'desktop')+': open, close, reopen; one lazy widget', errors });
            assert.equal(errors.length, 0, errors.join('\n'));
            await ctx.close();
        }
        if (mainOnly) {
            fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(reports, null, 2));
            console.log(JSON.stringify(reports, null, 2));
            return;
        }
        for (const mobile of [false, true]) {
            const { ctx, page, requests, errors } = await context(mobile);
            await page.goto('https://plate.voronova.online/login.html', { waitUntil: 'domcontentloaded' });
            assert(!requests.some(u => u.includes('jivosite.com')));
            const trigger = mobile ? '.lp-support-line [data-support-open]' : '#support-fab';
            await page.locator(trigger).click();
            assert.equal(await page.locator('.support-chat-title').innerText(), 'Чат с Юлией');
            assert.equal(await page.locator('.support-chat-header a').count(), 0);
            assert.equal(await page.locator('.support-chat-overlay').getAttribute('aria-label'), 'Чат с Юлией');
            await page.locator('.support-chat-loading').waitFor({ state: 'hidden', timeout: 30000 });
            if (await page.locator('.support-chat-fallback').isVisible()) {
                console.log(JSON.stringify({errors, requests: requests.filter(u => /jivo|support-chat/.test(u)), frames: await Promise.all(page.frames().map(async f => ({url:f.url(), state:await f.evaluate(() => ({referrer:document.referrer, open:document.documentElement.className, ready:typeof window.jivo_api, initialized:window.__jivoSupportInitialized, status:document.body.innerText.slice(0,200)}))})))}, null, 2));
                await page.screenshot({path: path.join(output, 'failure.png')});
                throw new Error('Jivo did not report readiness');
            }
            const frame = page.frames().find(f => f.url().startsWith('https://voronova.online/support-chat.html'));
            assert(frame);
            await frame.locator('textarea[placeholder="Введите сообщение"]:visible').waitFor({ state: 'visible', timeout: 30000 });
            await frame.locator('textarea[placeholder="Введите сообщение"]:visible').click();
            await page.waitForTimeout(750);
            const size = await page.locator('.support-chat-frame').boundingBox();
            fs.writeFileSync(path.join(output, mobile ? 'plate-mobile-dom.html' : 'plate-desktop-dom.html'), await frame.content());
            assert(size.width >= (mobile ? 380 : 400), JSON.stringify(size));
            const input = await frame.locator('textarea[placeholder="Введите сообщение"]:visible').boundingBox();
            const viewport = page.viewportSize();
            assert(input.x >= 0 && input.y >= 0 && input.x + input.width <= viewport.width + 1 && input.y + input.height <= viewport.height + 1, JSON.stringify(input));
            await page.screenshot({ path: path.join(output, mobile ? 'plate-mobile.png' : 'plate-desktop.png'), animations: 'disabled' });
            await page.locator('.support-chat-close').click();
            assert.equal(await page.locator('.support-chat-overlay').count(), 0);
            assert(await page.locator(trigger).evaluate(el => document.activeElement === el));
            await page.locator('.lp-support-line [data-support-open]').click();
            await page.locator('.support-chat-loading').waitFor({ state: 'hidden', timeout: 30000 });
            assert(await page.locator('.support-chat-fallback').isHidden());
            const reopened = page.frames().find(f => f.url().startsWith('https://voronova.online/support-chat.html'));
            await reopened.evaluate(() => window.jivo_api.close());
            await page.locator('.support-chat-overlay').waitFor({ state: 'detached' });
            reports.push({ scenario: mobile ? 'plate mobile: button, help link, close and focus' : 'plate desktop: button, help link, close and focus', size, errors });
            assert.equal(errors.length, 0, errors.join('\n'));
            await ctx.close();
        }
        {
            const { ctx, page, errors } = await context(true, true);
            await page.goto('https://plate.voronova.online/login.html', { waitUntil: 'domcontentloaded' });
            await page.locator('.lp-support-line [data-support-open]').click();
            await page.frameLocator('.support-chat-frame').locator('html').waitFor();
            await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {origin:'https://voronova.online',source:window,data:{type:'jivo-support-ready'}})));
            assert(await page.locator('.support-chat-loading').isVisible(), 'Neither iframe load nor a message from another window proves chat readiness');
            await page.locator('.support-chat-fallback').waitFor({ state: 'visible', timeout: 20000 });
            assert.equal(await page.locator('.support-chat-fallback a').getAttribute('href'), 'mailto:hello@voronova.online');
            await page.screenshot({ path: path.join(output, 'plate-blocked.png') });
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.support-chat-overlay').count(), 0);
            reports.push({ scenario: 'blocked vendor: email fallback and Escape', errors });
            await ctx.close();
        }
        fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(reports, null, 2));
        console.log(JSON.stringify(reports, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
