const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = path.join(__dirname, '..', '.blog-sync-private', 'vk-state.json');
const isVkCookie = cookie => typeof cookie?.domain === 'string' && /(^|\.)vk\.(ru|com)$/.test(cookie.domain);

function validateVkSession(input) {
    if (!input || !Array.isArray(input.cookies) || !input.cookies.length) throw new Error('VK_SESSION_INVALID');
    const fields = ['name', 'value', 'domain', 'path', 'expires', 'httpOnly', 'secure', 'sameSite'];
    const cookies = input.cookies.map(cookie => {
        if (!isVkCookie(cookie) || typeof cookie.name !== 'string' || typeof cookie.value !== 'string'
            || typeof cookie.path !== 'string' || !cookie.path.startsWith('/')
            || !Number.isFinite(cookie.expires) || typeof cookie.httpOnly !== 'boolean'
            || typeof cookie.secure !== 'boolean' || !['Strict', 'Lax', 'None'].includes(cookie.sameSite)) {
            throw new Error('VK_SESSION_INVALID');
        }
        return Object.fromEntries(fields.map(field => [field, cookie[field]]));
    });
    if (!cookies.some(cookie => /^remixsid/.test(cookie.name) && cookie.value.length > 20)) {
        throw new Error('VK_SESSION_INVALID');
    }
    // Project onto cookies only: never restore cached conversations, origin
    // localStorage, IndexedDB, or additional arbitrary browser settings.
    return { cookies, origins: [] };
}

function parseVkSession(text) {
    try {
        if (Buffer.byteLength(text, 'utf8') > 65536) throw new Error();
        return validateVkSession(JSON.parse(text));
    } catch {
        throw new Error('VK_SESSION_INVALID');
    }
}

function readVkSession(file = process.env.BLOG_VK_STATE_FILE || STATE_FILE) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { throw new Error('VK_SESSION_MISSING'); }
    return parseVkSession(text);
}

async function saveVkSession(context, file = STATE_FILE) {
    const state = validateVkSession({ cookies: (await context.cookies()).filter(isVkCookie) });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, file);
}

module.exports = { STATE_FILE, validateVkSession, parseVkSession, readVkSession, saveVkSession };
