const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');
const { createViewerServer, isVkPage } = require('./blog-vk-login-viewer');

const PRIVATE_DIR = path.join(__dirname, '..', '.blog-sync-private');
const TOKEN = crypto.randomBytes(24).toString('hex');
const PORT = 19230;

async function main() {
    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const statusFile = path.join(PRIVATE_DIR, 'server-login-window.json');
    const setPhase = phase => fs.writeFileSync(statusFile, JSON.stringify({ phase }));
    const tunnel = spawn('ssh', ['-N', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30',
        '-L', '127.0.0.1:19223:127.0.0.1:9223', 'smartplate-admin@5.42.119.198'], { stdio: 'ignore', windowsHide: true });
    let localBrowser;
    let server;
    try {
        let remoteBrowser;
        for (let attempt = 0; attempt < 20; attempt++) {
            try { remoteBrowser = await chromium.connectOverCDP('http://127.0.0.1:19223', { timeout: 3000 }); break; }
            catch { await new Promise(resolve => setTimeout(resolve, 500)); }
        }
        if (!remoteBrowser) throw new Error('SERVER_BROWSER_UNAVAILABLE');
        const contexts = remoteBrowser.contexts();
        if (contexts.length !== 1) throw new Error('SERVER_BROWSER_SCOPE_INVALID');
        const page = contexts[0].pages().find(candidate => isVkPage(candidate) && new URL(candidate.url()).origin.startsWith('https://vk.'));
        if (!page) throw new Error('SERVER_BROWSER_SCOPE_INVALID');
        server = createViewerServer({ page, token: TOKEN, port: PORT });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolve); });
        localBrowser = await chromium.launch({ headless: false, channel: 'chrome' });
        const localPage = await localBrowser.newPage({ viewport: { width: 1360, height: 950 } });
        await localPage.goto(`http://127.0.0.1:${PORT}`);
        setPhase('awaiting-server-login');
        // The user decides when to close the window. Login has no time limit.
        while (!localPage.isClosed() && localBrowser.isConnected()) {
            if (isVkPage(page) && new URL(page.url()).pathname === '/im/channels/-232523704'
                && await page.locator('.ChannelMain .ChannelPostWrapper .PostText').count()) {
                setPhase('channel-visible');
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        setPhase('window-closed');
    } catch (error) {
        setPhase('viewer-error');
        throw error;
    } finally {
        await localBrowser?.close().catch(() => {});
        server?.close();
        tunnel.kill();
        // The remote collector owns its browser. End only this local control client.
        setTimeout(() => process.exit(), 100).unref();
    }
}

if (require.main === module) main().catch(() => {
    console.error('Server VK login viewer stopped. No session or screen contents were logged.');
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 100).unref();
});
