const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const { CHANNEL_ID, CHANNEL_URL } = require('./blog-vk-links');
const { saveVkSession } = require('./blog-vk-session');

const ROOT = path.join(__dirname, '..');
const PRIVATE_DIR = path.join(ROOT, '.blog-sync-private');
const STATE_FILE = path.join(PRIVATE_DIR, 'vk-state.json');

async function main() {
    const ignored = spawnSync('git', ['check-ignore', '-q', '.blog-sync-private/vk-state.json'], { cwd: ROOT });
    if (ignored.status !== 0) throw new Error('Private session directory must be excluded from Git first.');
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ headless: false, channel: process.env.BLOG_BROWSER_CHANNEL || 'chrome' });
    const automatic = process.argv.includes('--auto');
    const terminal = automatic ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const context = await browser.newContext({ locale: 'ru-RU',
            ...(fs.existsSync(STATE_FILE) ? { storageState: STATE_FILE } : {}),
        });
        const page = await context.newPage();
        await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        fs.writeFileSync(path.join(PRIVATE_DIR, 'vk-login-status.json'), JSON.stringify({ phase: 'awaiting-user-login' }));
        console.log('VK login window opened. Sign in directly in that window; no password is read by this script.');
        const deadline = Date.now() + 15 * 60 * 1000;
        for (;;) {
            if (Date.now() > deadline) throw new Error('VK_LOGIN_TIMEOUT');
            if (automatic) await page.waitForTimeout(1500);
            const confirmation = automatic ? 'READY'
                : await terminal.question('After signing in, type READY here (or CANCEL to stop): ');
            if (confirmation.trim().toUpperCase() === 'CANCEL') return;
            if (confirmation.trim().toUpperCase() !== 'READY') continue;
            const location = new URL(page.url());
            if (!['https://vk.ru', 'https://vk.com'].includes(location.origin)
                || location.pathname !== `/im/channels/${CHANNEL_ID}`) {
                fs.writeFileSync(path.join(PRIVATE_DIR, 'vk-login-status.json'), JSON.stringify({ phase: 'awaiting-channel-visible' }));
                if (!automatic) console.log('Open the configured channel after finishing the VK check, then confirm READY again.');
                continue;
            }
            if (automatic && !(await page.locator('.ChannelMain .ChannelPostContentWrapper').evaluateAll(nodes =>
                nodes.some(node => !node.closest('.ConvoList') && (node.innerText || '').length > 400)))) continue;
            const cookies = (await context.cookies()).filter(cookie => /(^|\.)vk\.(ru|com)$/.test(cookie.domain));
            if (!cookies.some(cookie => /^remixsid/.test(cookie.name) && cookie.value.length > 20)) {
                if (!automatic) console.log('No signed-in VK session detected yet; finish signing in in the browser.');
                continue;
            }
            // The reader needs VK session cookies, never cached conversations
            // or account localStorage / IndexedDB from the messenger.
            await saveVkSession(context, STATE_FILE);
            // Only structural metadata from the selected channel panel. Never
            // inspect sidebar conversations or save a messenger page dump.
            if (location.pathname === `/im/channels/${CHANNEL_ID}`) {
                const structure = await page.evaluate(() => [...document.querySelectorAll('[class*="Channel"], [data-cmid], [data-message-id]')]
                    .filter(node => !node.closest('.ConvoList')).slice(0, 100).map(node => ({
                        tag: node.tagName,
                        className: typeof node.className === 'string' ? node.className : '',
                        attributes: [...node.attributes].map(attribute => attribute.name),
                        cmid: node.getAttribute('data-cmid'),
                        textLength: node.innerText?.length || 0,
                        parentClasses: node.parentElement?.className,
                    })));
                fs.writeFileSync(path.join(PRIVATE_DIR, 'vk-channel-structure.json'), JSON.stringify(structure, null, 2));
            }
            fs.writeFileSync(path.join(PRIVATE_DIR, 'vk-login-status.json'), JSON.stringify({ phase: 'saved-awaiting-channel-check' }));
            console.log('VK session saved privately. Channel reading still needs to be verified.');
            return;
        }
    } finally {
        terminal?.close();
        await browser.close();
    }
}

if (require.main === module) main().catch(() => {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    fs.writeFileSync(path.join(PRIVATE_DIR, 'vk-login-status.json'), JSON.stringify({ phase: 'login-setup-stopped' }));
    console.error('VK login setup stopped. No session was printed or uploaded.');
    process.exitCode = 1;
});

module.exports = { STATE_FILE, CHANNEL_URL };
