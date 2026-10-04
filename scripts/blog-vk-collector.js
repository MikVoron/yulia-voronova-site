const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { CHANNEL_URL } = require('./blog-vk-links');
const { readVkChannelPage, assertChannelLocation } = require('./blog-vk-reader');
const { readVkSession, saveVkSession } = require('./blog-vk-session');
const { syncVkLinks } = require('./blog-vk-sync');
const { parseTelegramPosts } = require('./update-blog');

const REMOTE = 'git@github.com:MikVoron/yulia-voronova-site.git';

function repositoryCommand(repository, args) {
    try {
        return execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
    } catch { throw new Error('VK_COLLECTOR_GIT_FAILED'); }
}

function refreshRepository(repository) {
    if (repositoryCommand(repository, ['remote', 'get-url', 'origin']) !== REMOTE) throw new Error('VK_COLLECTOR_REPOSITORY_INVALID');
    if (repositoryCommand(repository, ['status', '--porcelain'])) throw new Error('VK_COLLECTOR_WORKTREE_DIRTY');
    repositoryCommand(repository, ['fetch', 'origin', 'main']);
    repositoryCommand(repository, ['rebase', 'origin/main']);
}

function publishLinks(repository, expectedRemote = REMOTE) {
    if (repositoryCommand(repository, ['remote', 'get-url', 'origin']) !== expectedRemote) throw new Error('VK_COLLECTOR_REPOSITORY_INVALID');
    const status = repositoryCommand(repository, ['status', '--porcelain']);
    if (status.split('\n').some(line => line && line.slice(3) !== 'data/blog-vk-links.json')) {
        throw new Error('VK_COLLECTOR_WORKTREE_DIRTY');
    }
    if (status) {
        repositoryCommand(repository, ['add', '--', 'data/blog-vk-links.json']);
        repositoryCommand(repository, ['-c', 'user.name=blog-vk-collector', '-c', 'user.email=blog-vk-collector@users.noreply.github.com',
            'commit', '-m', 'Auto-discover full VK channel links']);
    }
    // Retry an earlier unsuccessful push even if this pass found no new posts.
    if (repositoryCommand(repository, ['rev-list', '--count', 'origin/main..HEAD']) !== '0') {
        repositoryCommand(repository, ['push', 'origin', 'HEAD:main']);
    }
}

async function collectOnce(page, options = {}) {
    const repository = options.repository || path.join(__dirname, '..');
    const linksFile = options.linksFile || path.join(repository, 'data/blog-vk-links.json');
    const publications = await readVkChannelPage(page, options.readerOptions);
    const response = await (options.fetchTelegram || fetch)('https://t.me/s/voronova_nutrition', { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('VK_COLLECTOR_TELEGRAM_UNAVAILABLE');
    const posts = parseTelegramPosts(await response.text());
    if (!posts.length) throw new Error('VK_COLLECTOR_TELEGRAM_UNAVAILABLE');
    const result = await syncVkLinks(posts, { linksFile, fetchPublications: async () => publications, logger: options.logger || console });
    if (result.failed) throw new Error('VK_COLLECTOR_MATCH_FAILED');
    return { ...result, publications: publications.length, posts: posts.length };
}

async function main() {
    const repository = path.join(__dirname, '..');
    const stateFile = process.env.BLOG_VK_STATE_FILE;
    const healthFile = process.env.BLOG_VK_HEALTH_FILE;
    if (!stateFile || !healthFile) throw new Error('VK_COLLECTOR_CONFIG_REQUIRED');
    const preview = process.argv.includes('--preview');
    const previewFile = path.join(path.dirname(stateFile), 'vk-links-preview.json');
    if (preview && !fs.existsSync(previewFile)) {
        fs.copyFileSync(path.join(repository, 'data/blog-vk-links.json'), previewFile);
    }
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({
        headless: true, channel: process.env.BLOG_BROWSER_CHANNEL || 'chromium',
        args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9223'],
    });
    let stopping = false;
    const stop = () => { stopping = true; browser.close().catch(() => {}); };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    try {
        const context = await browser.newContext({
            storageState: fs.existsSync(stateFile) ? readVkSession(stateFile) : { cookies: [], origins: [] },
            locale: 'ru-RU',
        });
        const page = await context.newPage();
        await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        let previousCode;
        let lastRefresh = Date.now();
        let lastSuccess = null;
        while (!stopping) {
            let code = null;
            try {
                assertChannelLocation(page.url());
                // Preserve the same live browser between passes. The channel
                // updates through VK's normal connection; refresh at most every 6h.
                if (Date.now() - lastRefresh >= 6 * 60 * 60 * 1000) {
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
                    lastRefresh = Date.now();
                }
                if (!preview) refreshRepository(repository);
                const result = await collectOnce(page, preview ? { linksFile: previewFile } : {});
                await saveVkSession(context, stateFile);
                if (!preview) publishLinks(repository);
                lastSuccess = new Date().toISOString();
                fs.writeFileSync(healthFile, JSON.stringify({ ok: true, mode: preview ? 'preview' : 'published', lastSuccess, publications: result.publications,
                    additions: Object.keys(result.additions).length }));
            } catch (error) {
                code = /^VK_[A-Z_]+$/.test(error.message) ? error.message : 'VK_COLLECTOR_FAILED';
                fs.writeFileSync(healthFile, JSON.stringify({ ok: false, lastSuccess, code }));
                if (previousCode !== code) console.warn(`[VK collector] ${code}`);
            }
            previousCode = code;
            if (process.argv.includes('--once')) {
                if (code) process.exitCode = 1;
                break;
            }
            // Poll a pending human login without reloading or solving its challenge.
            await new Promise(resolve => setTimeout(resolve,
                ['VK_CHALLENGE_REQUIRED', 'VK_LOGIN_REQUIRED', 'VK_CHANNEL_LAYOUT_CHANGED'].includes(code) ? 5000 : 5 * 60 * 1000));
        }
    } finally { await browser.close(); }
}

if (require.main === module) main().catch(() => {
    console.error('VK_COLLECTOR_START_FAILED');
    process.exitCode = 1;
});

module.exports = { collectOnce, refreshRepository, publishLinks };
