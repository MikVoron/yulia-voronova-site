'use strict';
const { chromium } = require('../node_modules/playwright-core');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { loginPreview, callbackPreview } = require('./preview-oauth-login.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'tmp/oauth-preview-20261031');
fs.mkdirSync(output, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const files = new Set(['login.css','login.js','oauth-login.css','oauth-login.js','vk-one-tap.js','vendor/vkid/sdk-2.6.1.js','auth-callback.css','auth-callback.js','plate-favicon.svg']);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  if (pathname === '/platform/login.html') { res.writeHead(200, { 'Content-Type': types['.html'] }); res.end(loginPreview()); return; }
  if (pathname === '/platform/auth-callback.html') { res.writeHead(200, { 'Content-Type': types['.html'] }); res.end(callbackPreview()); return; }
  if (pathname === '/index.html' || pathname === '/recipe.html') { res.end('<h1>Destination fixture</h1>'); return; }
  const name = pathname.replace(/^\/platform\//, '');
  if (!files.has(name) && !/^images\/login-[\w-]+\.webp$/.test(name)) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, 'platform', name), (error, data) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream' }); res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const reports = [];
  const pageErrors = [];
  async function create(options = {}) {
    const context = await browser.newContext({ viewport: { width: options.width || 390, height: 900 } });
    const page = await context.newPage();
    const requests = { providers: 0, refresh: 0, start: [], widgetCallback: [], widgetConfig: 0 };
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.pathname === '/platform/data-v2.js') return route.fulfill({ contentType: 'text/javascript', body: `
        var API_BASE=${JSON.stringify(origin + '/api')};
        var Auth={isLoggedIn:function(){return false},login:function(){sessionStorage.setItem('test.login',JSON.stringify(Array.from(arguments)))},api:function(){return Promise.resolve({})}};
        window.SmartPlateMetrika={getClientId:function(){return Promise.resolve(null)},goal:function(name){var list=JSON.parse(sessionStorage.getItem('test.goals')||'[]');list.push(name);sessionStorage.setItem('test.goals',JSON.stringify(list))}};
      ` });
      if (url.pathname === '/api/auth/oauth/providers') { requests.providers++; return json(options.ready || { vk: true, yandex: true, vkOneTap: !!options.oneTap }, options.providerStatus || 200); }
      if (url.pathname === '/api/auth/oauth/vk/config') {
        requests.widgetConfig++;
        return json({ appId: 54502528, redirectUrl: origin + '/api/auth/oauth/vk/callback', state: 'a'.repeat(48), codeChallenge: 'b'.repeat(43), expiresIn: 600 });
      }
      if (url.pathname === '/api/auth/oauth/vk/callback') {
        requests.widgetCallback.push(url.toString());
        return route.fulfill({ contentType: 'text/html', body: '<h1>Server callback fixture</h1>' });
      }
      if (url.pathname === '/platform/vendor/vkid/sdk-2.6.1.js' && options.oneTap === 'blocked') return route.fulfill({ status: 404, body: '' });
      if (url.pathname === '/platform/vendor/vkid/sdk-2.6.1.js' && options.oneTap && options.oneTap !== 'actual') return route.fulfill({ contentType: 'text/javascript', body: `
        window.VKIDSDK={Config:{init:function(c){window.__vkConfig=c}},ConfigResponseMode:{Callback:'callback'},ConfigAuthMode:{InNewTab:'new_tab'},WidgetEvents:{LOAD:'load',ERROR:'error'},OneTapInternalEvents:{START_AUTHORIZE:'start',LOGIN_SUCCESS:'success'},Auth:{exchangeCode:function(){throw new Error('Browser token exchange must not be used')}},OneTap:function(){
          this.events={};this.on=function(e,fn){this.events[e]=fn;return this};this.close=function(){};
          this.render=function(options){window.__vkRender=options;var self=this;
            options.container.innerHTML='<button type="button" id="test-onetap" style="width:100%;height:46px;border:0;border-radius:12px;background:#0077ff;color:white;font:600 14px Arial">Войти с VK ID</button><button type="button" style="width:100%;height:40px;border:0;border-radius:12px;background:#f2f3f5;color:#0077ff;margin-top:8px">Войти в другой аккаунт</button>';
            options.container.querySelector('#test-onetap').addEventListener('click',function(){self.events.start();self.events.success({code:'onetap-code',device_id:'onetap-device',state:${JSON.stringify(options.oneTap === 'mismatch' ? 'wrong-state' : 'a'.repeat(48))}})});
            if(options.oauthList.length){
              var caption=document.createElement('p');caption.textContent='или войти через VK ID с использованием данных из сервиса';caption.style.cssText='text-align:center;font:11px/1.5 Arial;color:#77818d;margin:16px 0 10px';options.container.appendChild(caption);
              var row=document.createElement('div');row.style.cssText='display:flex;gap:12px';options.container.appendChild(row);
              options.oauthList.forEach(function(provider){var button=document.createElement('button');button.type='button';button.id='test-'+provider;button.setAttribute('aria-label',provider==='mail_ru'?'Войти через Mail':'Войти через Одноклассники');button.style.cssText='flex:1;height:44px;border:1px solid #dce0e5;border-radius:8px;background:white;display:grid;place-items:center';
                button.innerHTML=provider==='mail_ru'?'<span style="font:bold 31px Arial;color:#0077ff">@</span>':'<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#f7931e"/><circle cx="12" cy="7" r="3" fill="none" stroke="white" stroke-width="2"/><path d="M7 12q5 4 10 0M12 14v3m0 0-3 4m3-4 3 4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
                button.addEventListener('click',function(){self.events.start();self.events.success({code:'onetap-'+provider+'-code',device_id:'onetap-device',state:'a'.repeat(48)})});row.appendChild(button);
              });
            }
            setTimeout(function(){if(self.events[${JSON.stringify(options.oneTap === 'error' ? 'error' : 'load')}])self.events[${JSON.stringify(options.oneTap === 'error' ? 'error' : 'load')}]()},10);
            return this;};
        }};
      ` });
      if (/^\/api\/auth\/oauth\/(vk|yandex)$/.test(url.pathname)) {
        requests.start.push(url.toString());
        return route.fulfill({ contentType: 'text/html', body: '<h1>Provider navigation fixture</h1>' });
      }
      if (url.pathname === '/api/auth/refresh') {
        requests.refresh++;
        return json({ accessToken: 'isolated-access', user: { id: 'same-existing-user', email: 'reaom@yandex.ru', displayName: 'Existing name', subscription: { status: 'active' }, avatar: 'existing-avatar', role: 'user' } }, options.refreshStatus || 200);
      }
      if (url.origin !== origin && ['fetch', 'xhr'].includes(route.request().resourceType())) return json({});
      if (url.origin !== origin || /google-analytics|metrika\.js|jivo/.test(url.pathname)) return route.fulfill({ status: 200, body: '' });
      return route.continue();
    });
    await page.goto(origin + '/platform/login.html' + (options.search || ''));
    await page.waitForFunction(() => !!window.SmartPlateOAuth);
    return { context, page, requests };
  }

  try {
    if (!process.argv.includes('--native-only')) {
    for (const width of [320, 390, 1440]) {
      const item = await create({ width });
      await item.page.locator('#lp-oauth').waitFor({ state: 'visible' });
      assert.equal(await item.page.locator('[data-oauth-provider]:visible').count(), 2);
      assert.ok(await item.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width !== 320) await item.page.screenshot({ path: path.join(output, width === 1440 ? 'desktop.png' : 'mobile.png'), fullPage: true, animations: 'disabled' });
      reports.push('both_providers_fit_' + width);
      await item.context.close();
    }
    if (process.argv.includes('--screenshots-only')) {
      console.log(JSON.stringify({ marker: 'OAUTH_SCREENSHOTS_READY', output }));
      return;
    }
    for (const options of [{ ready: { vk: false, yandex: false } }, { providerStatus: 404 }]) {
      const item = await create(options);
      await item.page.waitForTimeout(80);
      assert.equal(await item.page.locator('#lp-oauth').isVisible(), false);
      assert.equal(await item.page.locator('#send-code-btn').isEnabled(), true);
      reports.push(options.providerStatus ? 'missing_capability_keeps_email_login' : 'disabled_providers_hidden');
      await item.context.close();
    }
    {
      const item = await create({ ready: { vk: false, yandex: true } });
      await item.page.locator('[data-oauth-provider="yandex"]').waitFor({ state: 'visible' });
      assert.equal(await item.page.locator('[data-oauth-provider="vk"]').isVisible(), false);
      reports.push('only_ready_provider_is_visible');
      await item.context.close();
    }
    {
      const item = await create({ search: '?return=admin.html' });
      assert.equal(await item.page.locator('#lp-oauth').isVisible(), false);
      assert.equal(item.requests.providers, 0);
      reports.push('admin_entry_has_email_only');
      await item.context.close();
    }
    {
      const item = await create({ search: '?return=' + encodeURIComponent('recipe.html?id=existing#ingredients') });
      await item.page.locator('[data-oauth-provider="yandex"]').waitFor({ state: 'visible' });
      await item.page.locator('[data-oauth-provider="yandex"]').click();
      await item.page.waitForURL('**/api/auth/oauth/yandex?*');
      assert.match(new URL(item.requests.start[0]).searchParams.get('fingerprint'), /^[a-f0-9]{64}$/);
      await item.page.goto(origin + '/platform/auth-callback.html');
      await item.page.waitForURL('**/recipe.html?id=existing#ingredients');
      const login = await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.login')));
      assert.equal(login[7], 'same-existing-user');
      assert.equal(login[3].status, 'active');
      const goals = await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.goals')));
      assert.ok(goals.includes('oauth_yandex_started'));
      assert.ok(goals.includes('oauth_yandex_completed'));
      assert.equal(goals.includes('registration_completed'), false);
      reports.push('existing_user_keeps_id_subscription_and_recipe_return');
      await item.context.close();
    }
    {
      const item = await create({ refreshStatus: 401, search: '?return=recipe.html%3Fid%3Dexisting' });
      await item.page.locator('[data-oauth-provider="vk"]').waitFor({ state: 'visible' });
      await item.page.locator('[data-oauth-provider="vk"]').click();
      await item.page.waitForURL('**/api/auth/oauth/vk?*');
      await item.page.goto(origin + '/platform/auth-callback.html');
      await item.page.locator('.cb-error-link').waitFor({ state: 'visible' });
      assert.match(await item.page.locator('.cb-error-link').getAttribute('href'), /return=%2Frecipe.html%3Fid%3Dexisting/);
      reports.push('failed_refresh_offers_retry_with_recipe_context');
      await item.context.close();
    }
    {
      const item = await create();
      const rejected = await item.page.evaluate(() => ['https://evil.test/', '//evil.test', '\\evil.test', 'javascript:alert(1)', ' /recipe.html'].map(window.SmartPlateOAuth.safeReturn));
      assert.deepEqual(rejected, [null, null, null, null, null]);
      await item.page.evaluate(() => sessionStorage.setItem('smartplate.oauth.pending.v1', JSON.stringify({ provider: 'yandex', startedAt: Date.now(), returnUrl: 'https://evil.test/' })));
      assert.equal(await item.page.evaluate(() => window.SmartPlateOAuth.consumePending().returnUrl), '/index.html');
      reports.push('external_return_targets_rejected');
      await item.context.close();
    }
    for (const width of [390, 1440]) {
      const item = await create({ oneTap: 'success', width, search: '?return=recipe.html%3Fid%3Dexisting' });
      await item.page.locator('#lp-vk-one-tap').waitFor({ state: 'visible' });
      assert.equal(await item.page.locator('[data-oauth-provider="vk"]').isVisible(), false);
      assert.equal(await item.page.evaluate(() => window.__vkConfig.scope), 'email');
      assert.equal(await item.page.evaluate(() => window.__vkConfig.codeVerifier), undefined);
      assert.deepEqual(await item.page.evaluate(() => window.__vkRender.oauthList), ['mail_ru', 'ok_ru']);
      assert.equal(await item.page.locator('#test-mail_ru').isVisible(), true);
      assert.equal(await item.page.locator('#test-ok_ru').isVisible(), true);
      assert.ok(await item.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await item.page.screenshot({ path: path.join(output, width === 1440 ? 'desktop-onetap.png' : 'mobile-onetap.png'), fullPage: true, animations: 'disabled' });
      await item.page.locator('#test-onetap').click();
      await item.page.waitForURL('**/api/auth/oauth/vk/callback?*');
      assert.equal(new URL(item.requests.widgetCallback[0]).searchParams.get('code'), 'onetap-code');
      assert.equal(new URL(item.requests.widgetCallback[0]).searchParams.get('state'), 'a'.repeat(48));
      await item.page.goto(origin + '/platform/auth-callback.html');
      await item.page.waitForURL('**/recipe.html?id=existing');
      assert.equal(await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.login'))[7]), 'same-existing-user');
      reports.push('onetap_server_callback_and_same_account_' + width);
      await item.context.close();
    }
    for (const provider of ['mail_ru', 'ok_ru']) {
      const item = await create({ oneTap: 'success', search: '?return=recipe.html%3Fid%3Dexisting' });
      await item.page.locator('#test-' + provider).waitFor({ state: 'visible' });
      await item.page.locator('#test-' + provider).click();
      await item.page.waitForURL('**/api/auth/oauth/vk/callback?*');
      assert.equal(new URL(item.requests.widgetCallback[0]).searchParams.get('code'), 'onetap-' + provider + '-code');
      assert.equal(new URL(item.requests.widgetCallback[0]).searchParams.get('state'), 'a'.repeat(48));
      await item.page.goto(origin + '/platform/auth-callback.html');
      await item.page.waitForURL('**/recipe.html?id=existing');
      const login = await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.login')));
      assert.equal(login[7], 'same-existing-user');
      assert.equal(login[3].status, 'active');
      const goals = await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.goals')));
      assert.equal(goals.includes('registration_completed'), false);
      reports.push(provider + '_uses_server_callback_and_preserves_existing_subscription');
      await item.context.close();
    }
    for (const mode of ['error', 'blocked', 'mismatch']) {
      const item = await create({ oneTap: mode });
      if (mode === 'mismatch') {
        await item.page.locator('#test-onetap').waitFor({ state: 'visible' });
        await item.page.locator('#test-onetap').click();
      } else await item.page.waitForTimeout(350);
      await item.page.locator('[data-oauth-provider="vk"]').waitFor({ state: 'visible' });
      assert.equal(item.requests.widgetCallback.length, 0);
      assert.equal(await item.page.locator('#send-code-btn').isEnabled(), true);
      reports.push('onetap_' + mode + '_keeps_fallback');
      await item.context.close();
    }
    }
    for (const [width, provider] of [[390, 'mail_ru'], [1440, 'ok_ru']]) {
      const item = await create({ oneTap: 'actual', width, search: '?return=recipe.html%3Fid%3Dexisting' });
      await item.page.waitForFunction(() => !!window.VKIDSDK && document.querySelector('#lp-vk-one-tap iframe'));
      const frameUrl = await item.page.locator('#lp-vk-one-tap iframe').first().getAttribute('src');
      assert.match(frameUrl, /^https:\/\/id\.vk\.ru\//);
      assert.equal(new URL(frameUrl).searchParams.get('providers'), 'mail_ru,ok_ru');
      assert.equal(await item.page.evaluate(() => window.VKIDSDK.Config.get().codeChallenge), 'b'.repeat(43));
      assert.equal(await item.page.locator('#lp-vk-one-tap').evaluate(node => node.hidden), false);
      // Preview the SDK's own local template without a real VK session.
      await item.page.evaluate(() => {
        const container = document.getElementById('lp-vk-one-tap');
        container.querySelector('[data-test-id="oneTap"]').setAttribute('data-state', 'not_loaded');
        const auth = window.VKIDSDK.Auth;
        auth.login = async function (parameters) {
          sessionStorage.setItem('test.sdkProvider', parameters.provider);
          return { code: 'native-' + parameters.provider + '-code', state: window.VKIDSDK.Config.get().state, device_id: 'native-device' };
        };
      });
      await item.page.locator('#lp-vk-one-tap [data-oauth="mail_ru"] svg').waitFor({ state: 'visible' });
      await item.page.locator('#lp-vk-one-tap [data-oauth="ok_ru"] svg').waitFor({ state: 'visible' });
      await item.page.waitForFunction(() => {
        const text = document.querySelector('#lp-vk-one-tap [data-test-id="oneTap"] [class*="button_text_"]');
        return text && text.getBoundingClientRect().width > 10;
      });
      assert.equal(await item.page.locator('#lp-vk-one-tap [data-oauth="mail_ru"] svg').count(), 1);
      assert.equal(await item.page.locator('#lp-vk-one-tap [data-oauth="ok_ru"] svg').count(), 1);
      assert.ok(await item.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await item.page.screenshot({ path: path.join(output, width === 1440 ? 'desktop-onetap.png' : 'mobile-onetap.png'), fullPage: true, animations: 'disabled' });
      await item.page.locator('#lp-vk-one-tap [data-oauth="' + provider + '"]').click();
      await item.page.waitForURL('**/api/auth/oauth/vk/callback?*');
      assert.equal(new URL(item.requests.widgetCallback[0]).searchParams.get('code'), 'native-' + provider + '-code');
      await item.page.goto(origin + '/platform/auth-callback.html');
      await item.page.waitForURL('**/recipe.html?id=existing');
      const login = await item.page.evaluate(() => JSON.parse(sessionStorage.getItem('test.login')));
      assert.equal(login[7], 'same-existing-user');
      assert.equal(login[3].status, 'active');
      assert.equal(await item.page.evaluate(() => sessionStorage.getItem('test.sdkProvider')), provider);
      reports.push('official_sdk_' + provider + '_icons_callback_and_subscription_' + width);
      await item.context.close();
    }
    assert.deepEqual(pageErrors, []);
    fs.writeFileSync(path.join(output, process.argv.includes('--native-only') ? 'native-sdk-report.json' : 'report.json'), JSON.stringify({ marker: 'OAUTH_BROWSER_OK', count: reports.length, reports, pageErrors, realProviderCalls: false }, null, 2));
    console.log(JSON.stringify({ marker: 'OAUTH_BROWSER_OK', count: reports.length, reports, pageErrors }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
