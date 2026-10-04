const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { prepareState, cleanupState } = require('../prepare-blog-vk-state');

const state = JSON.stringify({ cookies: [{
    name: 'remixsid6', value: 'synthetic-test-session-value', domain: '.vk.ru', path: '/',
    expires: -1, httpOnly: true, secure: true, sameSite: 'None',
}], origins: [] });

test('keeps session contents out of the checkout and GitHub environment file', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-vk-state-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const envFile = path.join(directory, 'github-env');
    const env = { BLOG_VK_STATE: state, RUNNER_TEMP: directory, GITHUB_ENV: envFile };
    const file = prepareState(env);
    assert.equal(path.dirname(file), directory);
    assert.equal(fs.readFileSync(file, 'utf8'), state);
    const environment = fs.readFileSync(envFile, 'utf8');
    assert.equal(environment, `BLOG_VK_STATE_FILE=${file}\n`);
    assert.equal(environment.includes('synthetic-test-session-value'), false);
    cleanupState({ ...env, BLOG_VK_STATE_FILE: file });
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(envFile), true);
});

test('does not create state files for invalid input or missing configuration', () => {
    assert.throws(() => prepareState({}), /VK_SESSION_SECRET_MISSING/);
    assert.throws(() => prepareState({ BLOG_VK_STATE: state }), /GITHUB_ACTIONS_ENV_REQUIRED/);
    assert.throws(() => prepareState({ BLOG_VK_STATE: '{invalid-secret', RUNNER_TEMP: 'unused', GITHUB_ENV: 'unused' }),
        /^Error: VK_SESSION_INVALID$/);
});

test('refuses to remove unrelated files or paths outside the runner temp directory', () => {
    assert.throws(() => cleanupState({ RUNNER_TEMP: '/runner/temp', BLOG_VK_STATE_FILE: '/other/blog-vk-state-123.json' }),
        /VK_SESSION_CLEANUP_PATH_INVALID/);
    assert.throws(() => cleanupState({ RUNNER_TEMP: '/runner/temp', BLOG_VK_STATE_FILE: '/runner/temp/unrelated.json' }),
        /VK_SESSION_CLEANUP_PATH_INVALID/);
});
