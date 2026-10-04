const FEED_URL = 'https://raw.githubusercontent.com/MikVoron/yulia-voronova-site/main/data/blog-telegram-posts.json';
const CHANNEL = 'voronova_nutrition';

function validateTelegramFeed(feed) {
    if (!feed || feed.version !== 1 || feed.channel !== CHANNEL || !Array.isArray(feed.posts)
        || !feed.posts.length || feed.posts.length > 6) throw new Error('VK_COLLECTOR_TELEGRAM_FEED_INVALID');
    const seen = new Set();
    return feed.posts.map(post => {
        if (!Number.isSafeInteger(post?.postNumber) || post.postNumber <= 0 || post.postNumber > 9999999999
            || seen.has(post.postNumber) || typeof post.plainText !== 'string'
            || !post.plainText.trim() || post.plainText.length > 65536) throw new Error('VK_COLLECTOR_TELEGRAM_FEED_INVALID');
        seen.add(post.postNumber);
        return { postNumber: post.postNumber, plainText: post.plainText };
    });
}

function createTelegramFeed(posts) {
    const feed = { version: 1, channel: CHANNEL, posts };
    return { ...feed, posts: validateTelegramFeed(feed) };
}

async function fetchTelegramFeed(fetchSource = fetch) {
    const response = await fetchSource(FEED_URL, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!response.ok) throw new Error('VK_COLLECTOR_TELEGRAM_UNAVAILABLE');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > 512000) throw new Error('VK_COLLECTOR_TELEGRAM_FEED_INVALID');
    let feed;
    try { feed = JSON.parse(text); } catch { throw new Error('VK_COLLECTOR_TELEGRAM_FEED_INVALID'); }
    return validateTelegramFeed(feed);
}

module.exports = { FEED_URL, createTelegramFeed, validateTelegramFeed, fetchTelegramFeed };
