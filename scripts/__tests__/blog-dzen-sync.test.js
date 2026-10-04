const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { canonicalArticleUrl, matchingEvidence, findDzenLinks, syncDzenLinks } = require('../blog-dzen-sync');
const { articleCardTemplate, parseTelegramPosts } = require('../update-blog');

// Actual adapted versions differ in both titles and body wording.
const fixture = require('./fixtures/blog-dzen-match.json');
const posts = fixture.posts.filter(post => post.postNumber >= 362);
const coffeeOpening = posts[0].plainText;
const heartOpening = posts[1].plainText;
const articles = fixture.articles.filter(article => /asEVIWo6rz0pBNZ_|ar5DwS_R8QLfT4aZ/.test(article.url));
articles[0].url += '?from=channel';
articles[1].url += '#comments';

test('matches real openings despite different titles and reversed publication order', () => {
    const result = findDzenLinks(posts, articles.slice().reverse());
    assert.deepEqual(result.additions, {
        '363': 'https://dzen.ru/a/asEVIWo6rz0pBNZ_',
        '362': 'https://dzen.ru/a/ar5DwS_R8QLfT4aZ',
    });
    assert.deepEqual(result.warnings, []);
});

test('ignores punctuation and typography, but refuses mere topic similarity', () => {
    assert.equal(matchingEvidence(coffeeOpening, coffeeOpening.replace(/ё/g, 'е').replace(/[«»?.,:-]/g, '').toUpperCase()).strong, true);
    assert.equal(matchingEvidence('Можно ли детям и подросткам пить кофе?', articles[0].text).strong, false);
    assert.equal(matchingEvidence(heartOpening, coffeeOpening).strong, false);
});

test('refuses ambiguous articles and deduplicates tracking variants of one article', () => {
    const conflict = { ...articles[0], url: 'https://dzen.ru/a/anotherCoffeeArticle' };
    assert.deepEqual(findDzenLinks([posts[0]], [articles[0], conflict]).additions, {});
    assert.equal(findDzenLinks([posts[0]], [articles[0], { ...articles[0], url: articles[0].url + '&tracking=1' }]).additions['363'],
        'https://dzen.ru/a/asEVIWo6rz0pBNZ_');
});

test('refuses the same article for two Telegram posts or an already linked post', () => {
    assert.deepEqual(findDzenLinks([posts[0], { ...posts[0], postNumber: 400 }], articles).additions, {});
    assert.deepEqual(findDzenLinks([posts[0]], articles, { '400': 'https://dzen.ru/a/asEVIWo6rz0pBNZ_' }).additions, {});
});

test('preserves manually assigned links', () => {
    const existing = { '363': 'https://dzen.ru/a/manualArticle' };
    assert.deepEqual(findDzenLinks(posts, articles, existing).additions, { '362': 'https://dzen.ru/a/ar5DwS_R8QLfT4aZ' });
    assert.equal(existing['363'], 'https://dzen.ru/a/manualArticle');
});

test('accepts only canonical HTTPS Dzen article addresses', () => {
    for (const invalid of ['https://dzen.ru.evil/a/id', 'javascript:alert(1)', 'http://dzen.ru/a/id',
        'https://evil@dzen.ru/a/id', 'https://dzen.ru/a/id/other', 'https://dzen.ru/video/watch/id']) {
        assert.equal(canonicalArticleUrl(invalid), null);
    }
    assert.equal(canonicalArticleUrl(articles[0].url), 'https://dzen.ru/a/asEVIWo6rz0pBNZ_');
    assert.deepEqual(findDzenLinks(posts, [{ ...articles[0], url: 'https://other.example/a/id' }]).additions, {});
});

test('does not match shared footer text far from the opening', () => {
    const filler = Array.from({ length: 500 }, (_, i) => `word${i}`).join(' ');
    assert.equal(matchingEvidence(filler + ' ' + coffeeOpening, articles[0].text).strong, false);
});

test('matches four actual adapted posts and distinguishes two articles about soup', () => {
    assert.deepEqual(findDzenLinks(fixture.posts, fixture.articles).additions, {
        '363': 'https://dzen.ru/a/asEVIWo6rz0pBNZ_',
        '362': 'https://dzen.ru/a/ar5DwS_R8QLfT4aZ',
        '361': 'https://dzen.ru/a/aroxtEid7kHpjwdj',
        '360': 'https://dzen.ru/a/arKrDc2LLHRHIvxz',
    });
});

test('saves additions, remains idempotent, and preserves file bytes on source failures', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-dzen-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const linksFile = path.join(directory, 'links.json');
    fs.writeFileSync(linksFile, '{"340":"https://dzen.ru/a/manual"}\n');
    const logger = { log() {}, warn() {} };
    const options = { linksFile, logger, fetchArticles: async () => articles };
    await syncDzenLinks(posts, options);
    const saved = fs.readFileSync(linksFile, 'utf8');
    assert.equal(JSON.parse(saved)['340'], 'https://dzen.ru/a/manual');
    assert.equal(JSON.parse(saved)['363'], 'https://dzen.ru/a/asEVIWo6rz0pBNZ_');
    await syncDzenLinks(posts, { ...options, fetchArticles: async () => { throw new Error('should not fetch'); } });
    assert.equal(fs.readFileSync(linksFile, 'utf8'), saved);
    const failure = await syncDzenLinks([{ postNumber: 999, plainText: 'New text' }],
        { ...options, fetchArticles: async () => { throw new Error('Dzen unavailable'); } });
    assert.equal(failure.failed, true);
    assert.equal(fs.readFileSync(linksFile, 'utf8'), saved);
    fs.writeFileSync(linksFile, '{broken');
    assert.equal((await syncDzenLinks(posts, options)).failed, true);
    assert.equal(fs.readFileSync(linksFile, 'utf8'), '{broken');
});

test('renders discovered Dzen links while preserving Telegram and VK buttons', () => {
    const links = findDzenLinks(posts, articles).additions;
    const card = articleCardTemplate(posts[0], 0, { '363': 'https://vk.ru/im/channels/-232523704?cmid=250' }, links);
    assert.match(card, /href="https:\/\/dzen.ru\/a\/asEVIWo6rz0pBNZ_"/);
    assert.match(card, /href="https:\/\/t.me\/voronova_nutrition\/363"/);
    assert.match(card, /href="https:\/\/vk.ru\/im\/channels\/-232523704\?cmid=250"/);
});

test('parses Telegram messages without invoking downloads or the update command', () => {
    const html = '<div data-post="voronova_nutrition/363"><div class="tgme_widget_message_text">Coffee<br>Body</div>'
        + '<time datetime="2026-10-02T08:00:00+00:00"></time></div>';
    const parsed = parseTelegramPosts(html);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].postNumber, 363);
    assert.equal(parsed[0].plainText, 'Coffee\nBody');
});
