const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseVkSession } = require('./blog-vk-session');

function prepareState(env = process.env) {
    if (!env.BLOG_VK_STATE) throw new Error('VK_SESSION_SECRET_MISSING');
    if (!env.RUNNER_TEMP || !env.GITHUB_ENV) throw new Error('GITHUB_ACTIONS_ENV_REQUIRED');
    const state = parseVkSession(env.BLOG_VK_STATE);
    const file = path.join(env.RUNNER_TEMP, `blog-vk-state-${crypto.randomUUID()}.json`);
    fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    fs.appendFileSync(env.GITHUB_ENV, `BLOG_VK_STATE_FILE=${file}\n`);
    return file;
}

function cleanupState(env = process.env) {
    if (!env.BLOG_VK_STATE_FILE || !env.RUNNER_TEMP) return;
    const file = path.resolve(env.BLOG_VK_STATE_FILE);
    const root = path.resolve(env.RUNNER_TEMP);
    if (!file.startsWith(root + path.sep) || !/^blog-vk-state-[a-f0-9-]+\.json$/.test(path.basename(file))) {
        throw new Error('VK_SESSION_CLEANUP_PATH_INVALID');
    }
    for (const target of [file, `${file}.tmp`]) {
        if (fs.existsSync(target)) fs.unlinkSync(target);
    }
}

if (require.main === module) {
    try {
        if (process.argv.includes('--cleanup')) cleanupState();
        else prepareState();
    } catch (error) {
        // All messages are fixed codes; never print JSON or file contents.
        console.error(['VK_SESSION_SECRET_MISSING', 'GITHUB_ACTIONS_ENV_REQUIRED', 'VK_SESSION_INVALID',
            'VK_SESSION_CLEANUP_PATH_INVALID'].includes(error.message) ? error.message : 'VK_SESSION_STATE_FAILED');
        process.exitCode = 1;
    }
}

module.exports = { prepareState, cleanupState };
