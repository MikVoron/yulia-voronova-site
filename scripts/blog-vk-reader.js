const { CHANNEL_URL } = require('./blog-vk-links');
const { readVkSession, saveVkSession } = require('./blog-vk-session');

const POST_SELECTOR = '.ChannelMain .PostsList__item[data-itemkey] .ChannelPostWrapper';

function assertChannelLocation(value) {
    const url = new URL(value);
    if (!['https://vk.ru', 'https://vk.com'].includes(url.origin)) throw new Error('VK_UNEXPECTED_REDIRECT');
    if (url.pathname === '/challenge.html') throw new Error('VK_CHALLENGE_REQUIRED');
    if (url.pathname !== new URL(CHANNEL_URL).pathname) throw new Error('VK_LOGIN_REQUIRED');
}

async function readVkChannelPage(page, options = {}) {
    assertChannelLocation(page.url());
    try {
        await page.waitForFunction(selector => document.querySelector(selector)
            || location.pathname === '/challenge.html'
            || location.pathname !== '/im/channels/-232523704', POST_SELECTOR, { timeout: 25000 });
    } catch { throw new Error('VK_CHANNEL_LAYOUT_CHANGED'); }
    assertChannelLocation(page.url());
    // A first post appears before the virtual feed finishes loading.
    await page.waitForTimeout(options.settleMs ?? 1500);
    const limit = options.maxPublications || 24;
    const publications = new Map();
    for (let round = 0; round <= (options.scrollRounds ?? 4); round++) {
        assertChannelLocation(page.url());
        const visible = await page.locator(POST_SELECTOR).evaluateAll(nodes => nodes.map(node => ({
            cmid: node.closest('.PostsList__item').getAttribute('data-itemkey'),
            text: node.querySelector('.PostText')?.innerText || '',
        })));
        if (!visible.length || visible.some(post => !/^[1-9]\d{0,14}$/.test(post.cmid))) {
            throw new Error('VK_CHANNEL_LAYOUT_CHANGED');
        }
        let additions = 0;
        for (const publication of visible) {
            if (!publication.text.trim() || publications.has(publication.cmid)) continue;
            publications.set(publication.cmid, { url: `${CHANNEL_URL}?cmid=${publication.cmid}`, text: publication.text });
            additions++;
        }
        if (publications.size >= limit || (round > 0 && !additions)) break;
        const scrolled = await page.locator('.ChannelMain').evaluate(panel => {
            const candidates = [panel, ...panel.querySelectorAll('*')].filter(node =>
                node.clientHeight > 100 && node.scrollHeight > node.clientHeight + 100
                && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY));
            const target = candidates.sort((a, b) => b.clientHeight - a.clientHeight)[0];
            if (!target || target.scrollTop === 0) return false;
            target.scrollTop = Math.max(0, target.scrollTop - target.clientHeight * 0.8);
            return true;
        });
        if (!scrolled) break;
        await page.waitForTimeout(options.scrollSettleMs ?? 1000);
    }
    if (!publications.size) throw new Error('VK_CHANNEL_LAYOUT_CHANGED');
    return [...publications.values()].sort((a, b) =>
        Number(new URL(b.url).searchParams.get('cmid')) - Number(new URL(a.url).searchParams.get('cmid'))).slice(0, limit);
}

async function fetchVkPublications() {
    const state = readVkSession();
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ headless: true, channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium' });
    try {
        const context = await browser.newContext({ storageState: state, locale: 'ru-RU' });
        const page = await context.newPage();
        await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const publications = await readVkChannelPage(page);
        await saveVkSession(context, process.env.BLOG_VK_STATE_FILE);
        return publications;
    } finally { await browser.close(); }
}

module.exports = { assertChannelLocation, readVkChannelPage, fetchVkPublications };
