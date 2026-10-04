const assert = require('node:assert/strict');
const { test } = require('node:test');
const { canonicalVkChannelUrl, findVkLinks } = require('../blog-vk-links');
const { articleCardTemplate } = require('../update-blog');
const fixture = require('./fixtures/blog-dzen-match.json');
const vkFixture = require('./fixtures/blog-vk-match.json');

test('matches four actual channel posts and distinguishes the other soup article', () => {
    assert.deepEqual(findVkLinks(vkFixture.posts, vkFixture.publications).additions, vkFixture.expectedLinks);
});

test('accepts only precise message links in the configured VK channel', () => {
    assert.equal(canonicalVkChannelUrl('https://vk.com/im/channels/-232523704?cmid=236&from=feed'),
        'https://vk.ru/im/channels/-232523704?cmid=236');
    assert.equal(canonicalVkChannelUrl('https://m.vk.ru/mail/channels/-232523704?cmid=236'),
        'https://vk.ru/im/channels/-232523704?cmid=236');
    for (const value of [
        'https://vk.ru/im/channels/-232523704',
        'https://vk.ru/im/channels/-232523704?cmid=236&cmid=237',
        'https://vk.ru/im/channels/-232523704?cmid=0',
        'https://vk.ru/im/channels/-999?cmid=236',
        'https://vk.ru/wall-229107522_350',
        'https://vk.ru.evil/im/channels/-232523704?cmid=236',
        'https://evil@vk.ru/im/channels/-232523704?cmid=236',
        'javascript:alert(1)',
    ]) assert.equal(canonicalVkChannelUrl(value), null);
});

test('matches full bodies, preserves existing links, and never substitutes a wall announcement', () => {
    // Test IDs are synthetic: real VK IDs must come from the channel reader.
    const publications = fixture.posts.map((post, index) => ({
        text: post.plainText,
        url: `https://vk.ru/im/channels/-232523704?cmid=${500 + index}`,
    }));
    const result = findVkLinks(fixture.posts, publications, { '363': 'https://vk.com/im/channels/-232523704?cmid=499' });
    assert.deepEqual(result.additions, {
        '362': 'https://vk.ru/im/channels/-232523704?cmid=501',
        '361': 'https://vk.ru/im/channels/-232523704?cmid=502',
        '360': 'https://vk.ru/im/channels/-232523704?cmid=503',
    });
    assert.deepEqual(findVkLinks(fixture.posts, publications.map(publication => ({
        ...publication, url: 'https://vk.ru/wall-229107522_350',
    }))).additions, {});
    const card = articleCardTemplate(fixture.posts[1], 0, result.additions, {});
    assert.match(card, /href="https:\/\/vk.ru\/im\/channels\/-232523704\?cmid=501"/);
});

test('refuses duplicate content and previously claimed VK message addresses', () => {
    const post = fixture.posts[0];
    const publication = { text: post.plainText, url: 'https://vk.ru/im/channels/-232523704?cmid=500' };
    assert.deepEqual(findVkLinks([post], [publication, { ...publication, url: publication.url.replace('500', '501') }]).additions, {});
    assert.deepEqual(findVkLinks([post, { ...post, postNumber: 999 }], [publication]).additions, {});
    assert.deepEqual(findVkLinks([post], [publication], { '999': publication.url }).additions, {});
});
