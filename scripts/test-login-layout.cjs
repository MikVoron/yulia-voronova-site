'use strict';
// Slow optional sign-in resources must not move the email form or photo.
const { chromium } = require('../node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const reports = [];
  try {
    for (const [width, mode] of [[1440, 'guest'], [1280, 'returning'], [390, 'returning'], [320, 'returning'], [1440, 'blocked'], [390, 'error'], [1440, 'wrapper-blocked']]) {
      const context = await browser.newContext({ viewport: { width, height: 960 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
        if (url.pathname === '/data-v2.js') return route.fulfill({ contentType: 'text/javascript', body:
          "var API_BASE=location.origin; var Auth={isLoggedIn:function(){return false}};" });
        if (url.pathname === '/auth/oauth/providers') {
          await new Promise(resolve => setTimeout(resolve, 450));
          return json({ vk: true, yandex: true, vkOneTap: true });
        }
        if (url.pathname === '/auth/oauth/vk/config') {
          await new Promise(resolve => setTimeout(resolve, 350));
          return json({ appId: 54502528, redirectUrl: 'https://plate.voronova.online/auth/oauth/vk/callback', state: 'a'.repeat(48), codeChallenge: 'b'.repeat(43) });
        }
        if (url.pathname === '/vk-one-tap.js' && mode === 'wrapper-blocked') return route.fulfill({ status: 404, body: '' });
        if (url.pathname === '/vendor/vkid/sdk-2.6.1.js') {
          await new Promise(resolve => setTimeout(resolve, 450));
          if (mode === 'blocked') return route.fulfill({ status: 404, body: '' });
          return route.fulfill({ contentType: 'text/javascript', body: `
            window.VKIDSDK={Config:{init:function(){}},ConfigResponseMode:{Callback:1},ConfigAuthMode:{InNewTab:1},WidgetEvents:{ERROR:'error',LOAD:'load'},OneTapInternalEvents:{START_AUTHORIZE:'start',LOGIN_SUCCESS:'success'},OneTap:function(){
              this.events={}; this.on=function(name,fn){this.events[name]=fn}; this.close=function(){};
              this.render=function(options){
                var content=document.createElement('div');
                content.style.height=(innerWidth<=480?156:140)+${mode === 'returning' ? 52 : 0}+'px';
                content.textContent='VK / Mail / OK fixture'; options.container.appendChild(content);
                var self=this; setTimeout(function(){self.events[${JSON.stringify(mode === 'error' ? 'error' : 'load')}]()},50);
              };
            }};
          ` });
        }
        if (url.hostname !== 'plate.voronova.online') return route.abort();
        const file = path.join(root, 'platform', url.pathname.slice(1));
        if (!file.startsWith(path.join(root, 'platform') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
        if (file.endsWith('.webp')) await new Promise(resolve => setTimeout(resolve, 600));
        return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      await page.goto('https://plate.voronova.online/login.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        window.layoutSamples = [];
        window.layoutTimer = setInterval(() => {
          const row = {};
          for (const selector of ['.lp-card', '.lp-media', '.lp-h2', '#email-input', '#send-code-btn']) {
            const box = document.querySelector(selector).getBoundingClientRect();
            row[selector] = [box.x, box.y, box.width, box.height];
          }
          layoutSamples.push(row);
        }, 20);
      });
      await page.waitForTimeout(2300);
      const samples = await page.evaluate(() => { clearInterval(layoutTimer); return layoutSamples; });
      const first = samples[0];
      let maxMovement = 0;
      for (const sample of samples) for (const selector of Object.keys(first)) for (let axis = 0; axis < 4; axis++) {
        maxMovement = Math.max(maxMovement, Math.abs(sample[selector][axis] - first[selector][axis]));
      }
      assert.ok(maxMovement <= 1, JSON.stringify({ width, mode, maxMovement, first, last: samples.at(-1) }));
      assert.equal(await page.locator('#send-code-btn').isEnabled(), true);
      assert.equal(await page.locator('[data-oauth-provider="yandex"]').isVisible(), true);
      assert.equal(await page.locator('#lp-oauth-loading').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      reports.push({ width, mode, maxMovement, emailFormUsable: true, yandexVisible: true, errors });
      await context.close();
    }
    console.log(JSON.stringify({ marker: 'LOGIN_LAYOUT_STABLE', reports }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
