const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chromium } = require('playwright-core');
const { CHANNEL_URL } = require('../blog-vk-links');
const { assertChannelLocation, readVkChannelPage } = require('../blog-vk-reader');

test('rejects challenges, wrong channels, and unrelated sites before reading account content', () => {
    assert.doesNotThrow(() => assertChannelLocation(`${CHANNEL_URL}?cmid=501`));
    assert.throws(() => assertChannelLocation('https://vk.ru/challenge.html'), /VK_CHALLENGE_REQUIRED/);
    assert.throws(() => assertChannelLocation('https://vk.ru/im/channels/-999'), /VK_LOGIN_REQUIRED/);
    assert.throws(() => assertChannelLocation('https://unrelated.example/'), /VK_UNEXPECTED_REDIRECT/);
});

test('reads actual channel DOM attributes and ignores sidebar posts and referenced-message links', async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium' });
    try {
        const page = await browser.newPage();
        let html = `<div class="ConvoList"><div class="PostsList__item" data-itemkey="999"><div class="ChannelPostWrapper"><div class="PostText">sidebar</div></div></div></div>
            <div class="ChannelMain"><div class="PostsList__item" data-itemkey="501"><div class="ChannelPostWrapper"><div class="PostText">Full channel post. <a href="${CHANNEL_URL}?cmid=500">Earlier article</a></div></div></div></div>`;
        await page.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto(CHANNEL_URL);
        assert.deepEqual(await readVkChannelPage(page, { settleMs: 0, scrollRounds: 0 }), [{
            url: `${CHANNEL_URL}?cmid=501`, text: 'Full channel post. Earlier article',
        }]);
        html = html.replace('data-itemkey="501"', 'data-itemkey="unknown"');
        await page.reload();
        await assert.rejects(readVkChannelPage(page, { settleMs: 0, scrollRounds: 0 }), /VK_CHANNEL_LAYOUT_CHANGED/);
    } finally { await browser.close(); }
});
