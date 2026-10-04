const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright-core');
const { FEED_URL, createTelegramFeed, fetchTelegramFeed } = require('../blog-telegram-source');
const { collectOnce } = require('../blog-vk-collector');
const { CHANNEL_URL } = require('../blog-vk-links');
const fixture = require('./fixtures/blog-vk-match.json');

test('relays public author text through the fixed GitHub source and rejects the wrong channel', async () => {
    const feed = createTelegramFeed(fixture.posts.map(post => ({ ...post, imageUrl: 'unused', localImage: 'unused' })));
    assert.deepEqual(Object.keys(feed.posts[0]), ['postNumber', 'plainText']);
    const read = async body => fetchTelegramFeed(async url => {
        assert.equal(url, FEED_URL);
        return new Response(JSON.stringify(body));
    });
    assert.deepEqual(await read(feed), fixture.posts.map(({ postNumber, plainText }) => ({ postNumber, plainText })));
    await assert.rejects(read({ ...feed, channel: 'another_channel' }), /VK_COLLECTOR_TELEGRAM_FEED_INVALID/);
    await assert.rejects(read({ ...feed, posts: [feed.posts[0], feed.posts[0]] }), /VK_COLLECTOR_TELEGRAM_FEED_INVALID/);
});

test('collector matches four full posts with the relayed feed and preserves links on source failure', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-vk-relay-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const linksFile = path.join(directory, 'links.json');
    fs.writeFileSync(linksFile, '{}\n');
    const browser = await chromium.launch({ headless: true, channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium' });
    try {
        const page = await browser.newPage();
        const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        const html = '<meta charset="utf-8"><div class="ChannelMain">' + fixture.publications.map(post =>
            `<div class="PostsList__item" data-itemkey="${new URL(post.url).searchParams.get('cmid')}"><div class="ChannelPostWrapper"><div class="PostText">${escape(post.text)}</div></div></div>`).join('') + '</div>';
        await page.route('https://vk.ru/**', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto(CHANNEL_URL);
        const feed = createTelegramFeed(fixture.posts);
        const options = { linksFile, readerOptions: { settleMs: 0, scrollRounds: 0 }, logger: { log() {}, warn() {}, error() {} },
            fetchPosts: () => fetchTelegramFeed(async () => new Response(JSON.stringify(feed))) };
        assert.deepEqual((await collectOnce(page, options)).additions, fixture.expectedLinks);
        const bytes = fs.readFileSync(linksFile);
        await assert.rejects(collectOnce(page, { ...options,
            fetchPosts: () => fetchTelegramFeed(async () => new Response('not a feed')) }), /VK_COLLECTOR_TELEGRAM_FEED_INVALID/);
        assert.deepEqual(fs.readFileSync(linksFile), bytes);
    } finally { await browser.close(); }
});
