const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateVkSession, parseVkSession } = require('../blog-vk-session');

const cookie = {
    name: 'remixsid6', value: 'synthetic-test-session-value', domain: '.vk.ru', path: '/',
    expires: -1, httpOnly: true, secure: true, sameSite: 'None',
};

test('restores only VK cookies and discards cached conversations and extra state', () => {
    const session = validateVkSession({ cookies: [cookie], origins: [{ origin: 'https://vk.ru', localStorage: [{ name: 'chat', value: 'private' }] }] });
    assert.deepEqual(session, { cookies: [cookie], origins: [] });
});

test('rejects unrelated cookies, malformed sessions, and anonymous browser state', () => {
    for (const session of [{}, { cookies: [] }, { cookies: [{ ...cookie, domain: '.other.example' }] },
        { cookies: [{ ...cookie, value: '' }] }, { cookies: [{ ...cookie, sameSite: 'unknown' }] }]) {
        assert.throws(() => validateVkSession(session), /^Error: VK_SESSION_INVALID$/);
    }
});

test('never includes the session input or parser exception in errors', () => {
    assert.throws(() => parseVkSession('{sensitive_test_value'), /^Error: VK_SESSION_INVALID$/);
    assert.throws(() => parseVkSession('x'.repeat(65537)), /^Error: VK_SESSION_INVALID$/);
    assert.deepEqual(parseVkSession(JSON.stringify({ cookies: [cookie] })), { cookies: [cookie], origins: [] });
});
