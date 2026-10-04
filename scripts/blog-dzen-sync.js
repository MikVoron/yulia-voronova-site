const fs = require('node:fs');
const path = require('node:path');

const CHANNEL_URL = 'https://dzen.ru/voronova_nutrition';
const LINKS_FILE = path.join(__dirname, '..', 'data', 'blog-dzen-links.json');
const STOP_WORDS = new Set(('чтобы после можно нужно очень только когда которых который которые потому такой '
    + 'также свои себя самом всего имеет часто больше меньше будет будут было были быть если хотя своих '
    + 'этой этот того есть этом даже меня каждый каждом между').split(' '));

function words(text) {
    return (text || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
        .match(/[\p{L}\p{N}]+/gu) || [];
}

function canonicalArticleUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'dzen.ru'
            || url.username || url.password || url.port
            || !/^\/a\/[A-Za-z0-9_-]+$/.test(url.pathname)) return null;
        return `https://dzen.ru${url.pathname}`;
    } catch {
        return null;
    }
}

function matchingEvidence(postText, articleText) {
    // Limit to the body opening so common closing calls to action do not count.
    const post = words(postText).slice(0, 450);
    const article = words(articleText).slice(0, 450);
    const informative = list => new Set(list.filter(word =>
        (word.length >= 4 || /^\d{2,}$/.test(word)) && !STOP_WORDS.has(word)));
    const postTerms = informative(post);
    const articleTerms = informative(article);
    const sharedWords = [...postTerms].filter(word => articleTerms.has(word)).length;
    const denominator = Math.min(postTerms.size, articleTerms.size);
    const score = denominator ? sharedWords / denominator : 0;
    let sharedPassage = false;
    if (sharedWords >= 40 && score >= 0.45) {
        for (let i = 0; i <= post.length - 8 && !sharedPassage; i++) {
            for (let j = 0; j <= article.length - 8; j++) {
                const fragment = post.slice(i, i + 8);
                if (fragment.every((word, index) => word === article[j + index])
                    && new Set(fragment).size >= 6) {
                    sharedPassage = true;
                    break;
                }
            }
        }
    }
    return { score, sharedWords, strong: sharedPassage };
}

function findPublicationLinks(posts, articles, existing, normalizeUrl, platform) {
    const unique = new Map();
    for (const article of articles) {
        const url = normalizeUrl(article.url);
        if (!url || !article.text) continue;
        const previous = unique.get(url);
        if (!previous || article.text.length > previous.text.length) unique.set(url, { ...article, url });
    }
    const proposals = new Map();
    const warnings = [];
    for (const post of posts) {
        const key = String(post.postNumber);
        if (Object.hasOwn(existing, key)) continue;
        const ranked = [...unique.values()].map(article => ({
            article, ...matchingEvidence(post.plainText, article.text),
        })).sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (best?.strong) {
            if (ranked[1] && best.score - ranked[1].score < 0.15) {
                warnings.push(`Post #${key}: multiple similar ${platform} publications; skipped.`);
            } else {
                proposals.set(key, best.article.url);
            }
        }
    }
    const claimed = new Set(Object.values(existing).map(normalizeUrl).filter(Boolean));
    const additions = {};
    for (const [key, url] of proposals) {
        const competingPosts = [...proposals.values()].filter(value => value === url).length;
        if (claimed.has(url) || competingPosts > 1) {
            warnings.push(`Post #${key}: ${platform} publication matches another post; skipped.`);
        } else {
            additions[key] = url;
        }
    }
    return { additions, warnings };
}

function findDzenLinks(posts, articles, existing = {}) {
    return findPublicationLinks(posts, articles, existing, canonicalArticleUrl, 'Dzen');
}

async function fetchDzenArticles() {
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({
        headless: true,
        channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium',
    });
    try {
        const page = await browser.newPage({ locale: 'ru-RU' });
        await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const titleSelector = '[class*="channel--horizontal-card-text-content__title-"], '
            + '[class*="channel--article-card-minimal__title-"]';
        await page.locator(titleSelector).first().waitFor({ timeout: 30000 });
        // A first card can appear before the initial feed finishes rendering.
        await page.waitForTimeout(1000);
        // The channel lazy-loads its feed; include enough recent articles to
        // handle different publication times and a pinned older article.
        for (let round = 0; round < 3; round++) {
            const previousCount = await page.locator(titleSelector).count();
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            try {
                await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length > count,
                    { selector: titleSelector, count: previousCount }, { timeout: 8000 });
                await page.waitForTimeout(750);
            } catch (error) {
                if (error.name !== 'TimeoutError') throw error;
                break;
            }
        }
        const articles = await page.locator(titleSelector).evaluateAll(titles => titles.map(title => {
            const anchor = title.querySelector('a[href*="/a/"]');
            if (!anchor) return null;
            return {
                url: anchor.href,
                text: title.parentElement.innerText,
                title: title.innerText,
            };
        }).filter(Boolean));
        const valid = articles.filter(article => canonicalArticleUrl(article.url) && words(article.text).length > 0);
        if (!valid.length) throw new Error('No Dzen article cards found; existing links preserved.');
        // Read bodies even when the excerpt was rewritten or omitted. A title
        // alone cannot safely determine whether to exclude an article.
        const candidates = [...new Map(valid.map(article =>
            [canonicalArticleUrl(article.url), article])).values()].slice(0, 24);
        const complete = [];
        for (const article of candidates) {
            const url = canonicalArticleUrl(article.url);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            if (canonicalArticleUrl(page.url()) !== url) throw new Error('Unexpected Dzen article redirect.');
            const body = page.locator('[class*="content--article-render__container-"]');
            await body.waitFor({ timeout: 15000 });
            complete.push({ url, title: article.title, text: await body.innerText() });
        }
        return complete;
    } finally {
        await browser.close();
    }
}

async function syncDzenLinks(posts, options = {}) {
    const linksFile = options.linksFile || LINKS_FILE;
    const logger = options.logger || console;
    try {
        const existing = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            throw new Error('Dzen links file must contain an object.');
        }
        if (posts.every(post => Object.hasOwn(existing, String(post.postNumber)))) return { additions: {}, warnings: [] };
        const pending = posts.filter(post => !Object.hasOwn(existing, String(post.postNumber)));
        const articles = await (options.fetchArticles || fetchDzenArticles)(pending);
        const result = findDzenLinks(posts, articles, existing);
        result.warnings.forEach(message => logger.warn(`[Dzen] ${message}`));
        if (Object.keys(result.additions).length) {
            const tempFile = `${linksFile}.tmp`;
            fs.writeFileSync(tempFile, `${JSON.stringify({ ...existing, ...result.additions }, null, '\t')}\n`, 'utf8');
            fs.renameSync(tempFile, linksFile);
        }
        logger.log(`[Dzen] ${articles.length} articles read; ${Object.keys(result.additions).length} new links.`);
        return result;
    } catch (error) {
        logger.warn(`[Dzen] Sync failed: ${error.message}. Existing links preserved; Telegram update continues.`);
        return { additions: {}, warnings: [error.message], failed: true };
    }
}

module.exports = { canonicalArticleUrl, matchingEvidence, findPublicationLinks, findDzenLinks, fetchDzenArticles, syncDzenLinks };
