const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const { createViewerServer } = require('../blog-vk-login-viewer');
const { CHANNEL_URL } = require('../blog-vk-links');

test('login viewer delivers input in order, controls the VK popup, and returns to the channel', async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium' });
    let server;
    try {
        const remote = await browser.newContext();
        // Synthetic forms only: no real VK requests, account data, screenshots on disk, or session files.
        await remote.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body:
            '<input id="phone" style="position:absolute;left:40px;top:40px" onkeydown="this.dataset.keys=Number(this.dataset.keys||0)+1"><button style="position:absolute;left:40px;top:120px" onclick="window.open(\'https://id.vk.com/login\')">Sign in</button>' }));
        await remote.route('https://id.vk.com/**', route => route.fulfill({ contentType: 'text/html', body:
            '<input id="code" style="position:absolute;left:40px;top:40px">' }));
        const page = await remote.newPage();
        await page.goto('https://vk.ru/login');
        server = createViewerServer({ page, token: 'synthetic-test-token', port: 19231 });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(19231, '127.0.0.1', resolve); });
        const local = await browser.newPage({ viewport: { width: 1360, height: 950 } });
        await local.goto('http://127.0.0.1:19231');
        await local.waitForFunction(() => document.getElementById('screen').naturalWidth === 1280);
        async function clickRemote(x, y) {
            const box = await local.locator('#screen').boundingBox();
            await local.mouse.click(box.x + x * box.width / 1280, box.y + y * box.height / 800);
        }
        await clickRemote(60, 50);
        await local.locator('#entry').fill('12345');
        await local.locator('#typing button').click();
        await page.waitForFunction(() => document.getElementById('phone').value === '12345');
        assert.equal(await page.locator('#phone').getAttribute('data-keys'), '5');
        assert.equal(await local.locator('#entry').inputValue(), '');
        await local.locator('#screen').focus();
        await local.keyboard.press('Backspace');
        await page.waitForFunction(() => document.getElementById('phone').value === '1234');
        const popupPromise = remote.waitForEvent('page');
        await clickRemote(60, 130);
        const popup = await popupPromise;
        await popup.waitForURL('https://id.vk.com/login');
        await clickRemote(60, 50);
        await local.locator('#entry').fill('67890');
        await local.locator('#typing button').click();
        await popup.waitForFunction(() => document.getElementById('code').value === '67890');
        const closed = popup.waitForEvent('close');
        await local.locator('#open').click();
        await page.waitForURL(CHANNEL_URL);
        await closed;
        assert.equal(popup.isClosed(), true);
        const denied = await fetch('http://127.0.0.1:19231/action', { method: 'POST', body: '{}' });
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get('cache-control'), 'no-store');
    } finally {
        await browser.close();
        if (server) await new Promise(resolve => server.close(resolve));
    }
});
