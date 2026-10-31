'use strict';
// Real frontend code with synthetic accounts and intercepted API. No live sign-in.
const { chromium } = require('../node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = process.env.ACCOUNT_SWITCH_EVIDENCE || path.join(root, 'tmp/account-switch');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const reports = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      await context.addInitScript(() => {
        if (!sessionStorage.getItem('fixture-seeded')) {
          localStorage.setItem('hp_user', JSON.stringify({ email: 'first@example.test', name: 'First fixture', id: 'fixture-first' }));
          sessionStorage.setItem('hp_st', 'fixture-access');
          sessionStorage.setItem('fixture-seeded', '1');
        }
      });
      const page = await context.newPage();
      const errors = [];
      let calls = 0, allowLogout = false, release;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': 'https://plate.voronova.online', 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify(value) });
        if (url.hostname === 'api.voronova.online') {
          if (url.pathname === '/auth/logout') {
            calls++;
            if (!allowLogout) return json({ error: 'fixture failure' }, 503);
            await new Promise(resolve => { release = resolve; });
            return json({ ok: true });
          }
          if (url.pathname === '/auth/oauth/providers') return json({ vk: false, yandex: false, vkOneTap: false });
          return json({}, 401);
        }
        if (url.hostname !== 'plate.voronova.online') return route.abort();
        if (url.pathname === '/switch-fixture.html') return route.fulfill({ contentType: 'text/html', body:
          '<html><head><meta charset="utf-8"><link rel="stylesheet" href="/style-v4.css"></head><body><main>Fixture</main><script src="/data-v2.js"></script></body></html>' });
        const file = path.join(root, 'platform', url.pathname.slice(1));
        if (!file.startsWith(path.join(root, 'platform') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      await page.goto('https://plate.voronova.online/switch-fixture.html');
      assert.deepEqual(errors, []);
      await page.evaluate(() => Auth._showPaywall('trial_not_granted'));
      const button = page.locator('[data-shared-action="switch-account"]');
      await button.waitFor({ state: 'visible' });
      assert.equal(await button.evaluate(element => element.tagName), 'BUTTON');
      assert.ok((await button.boundingBox()).height >= 50);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, 'paywall-' + width + '.png'), fullPage: true });
      await button.click();
      await button.filter({ hasText: 'Попробовать ещё раз' }).waitFor();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hp_user')).id), 'fixture-first');
      assert.equal(page.url(), 'https://plate.voronova.online/switch-fixture.html');
      allowLogout = true;
      await button.click();
      await page.waitForFunction(() => document.querySelector('[data-shared-action="switch-account"]').getAttribute('aria-disabled') === 'true');
      await button.dispatchEvent('click');
      assert.equal(calls, 2);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('hp_user')).id), 'fixture-first');
      assert.equal(page.url(), 'https://plate.voronova.online/switch-fixture.html');
      release();
      await page.waitForURL('**/login.html?return=*');
      await page.locator('#email-input').waitFor({ state: 'visible' });
      await page.waitForTimeout(850);
      assert.equal(await page.evaluate(() => localStorage.getItem('hp_user')), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('hp_st')), null);
      assert.equal(new URL(page.url()).pathname, '/login.html');
      assert.equal(new URL(page.url()).searchParams.get('return'), 'switch-fixture.html');
      await page.locator('#email-input').fill('second@example.test');
      assert.equal(await page.locator('#email-input').inputValue(), 'second@example.test');
      assert.deepEqual(errors, []);
      reports.push({ width, logoutRequests: calls, failedLogoutRetainsAccount: true, waitsForServerLogout: true,
        duplicateClickSuppressed: true, loginStaysVisible: true, returnPreserved: true, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ marker: 'ACCOUNT_SWITCH_BROWSER_OK', reports }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
