const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { syncVkLinks } = require('../blog-vk-sync');
const { posts } = require('./fixtures/blog-dzen-match.json');

test('saves matched full-channel links and keeps manually assigned links intact on repeated runs', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-vk-sync-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const linksFile = path.join(directory, 'links.json');
    const manual = 'https://vk.com/im/channels/-232523704?cmid=999';
    fs.writeFileSync(linksFile, JSON.stringify({ '363': manual }));
    const publications = posts.map((post, index) => ({
        text: post.plainText,
        url: `https://vk.ru/im/channels/-232523704?cmid=${500 + index}`,
    }));
    let reads = 0;
    const options = { linksFile, logger: { log() {}, warn() {} }, fetchPublications: async pending => {
        reads++;
        assert.deepEqual(pending.map(post => post.postNumber), posts.slice(1).map(post => post.postNumber));
        return publications;
    } };
    const first = await syncVkLinks(posts, options);
    assert.equal(Object.keys(first.additions).length, 3);
    assert.equal(JSON.parse(fs.readFileSync(linksFile, 'utf8'))['363'], manual);
    const bytes = fs.readFileSync(linksFile);
    assert.deepEqual((await syncVkLinks(posts, options)).additions, {});
    assert.equal(reads, 1);
    assert.deepEqual(fs.readFileSync(linksFile), bytes);
});

test('preserves map bytes and reports a controlled code when the authenticated reader fails', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-vk-sync-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const linksFile = path.join(directory, 'links.json');
    const original = '{\n "old": "https://vk.ru/im/channels/-232523704?cmid=236"\n}\n';
    fs.writeFileSync(linksFile, original);
    const warnings = [];
    const options = { linksFile, logger: { log() {}, warn: message => warnings.push(message) },
        fetchPublications: async () => { throw new Error('private-session-value'); } };
    const result = await syncVkLinks(posts, options);
    assert.equal(result.failed, true);
    assert.deepEqual(result.warnings, ['VK_CHANNEL_READ_FAILED']);
    assert.equal(warnings.join(' ').includes('private-session-value'), false);
    assert.equal(fs.readFileSync(linksFile, 'utf8'), original);
    options.fetchPublications = async () => { throw new Error('VK_LOGIN_REQUIRED'); };
    assert.deepEqual((await syncVkLinks(posts, options)).warnings, ['VK_LOGIN_REQUIRED']);
    assert.equal(fs.readFileSync(linksFile, 'utf8'), original);
});
