'use strict';
// Read-only observations, never sufficient on their own to authorize a release.
const http = require('node:http');
const https = require('node:https');
const ORIGINS = Object.freeze(['http://127.0.0.1:3000', 'https://api.voronova.online']);
const PRIVATE = Object.freeze(['/auth/me', '/plate', '/plate/history']);
const SITEMAP = 'https://plate.voronova.online/sitemap.xml';
const URLS = Object.freeze([...ORIGINS.flatMap(base => ['/health', '/content/recipes', ...PRIVATE].map(p => base + p)), SITEMAP]);
function check(ok, code) { if (!ok) throw new Error(code); }
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function health(value) { check(object(value) && value.status === 'ok' && value.db === 'ok', 'HEALTH_BODY'); }
function catalog(value) {
  check(Array.isArray(value) && value.length > 0 && value.length <= 10000, 'CATALOG_SHAPE');
  const ids = new Set(), levels = { free: 0, trial: 0, pro: 0 };
  for (const item of value) {
    check(object(item) && typeof item.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,199}$/.test(item.id) && !ids.has(item.id), 'CATALOG_ID');
    ids.add(item.id);
    check(item.access_level == null || ['free', 'trial', 'pro'].includes(item.access_level), 'CATALOG_LEVEL');
    if (item.access_level == null) check(typeof item.is_free === 'boolean', 'CATALOG_LEGACY_LEVEL');
    const level = item.access_level || (item.is_free ? 'free' : 'pro'); levels[level]++;
    if (level === 'free') {
      check(Array.isArray(item.ingredients) && item.ingredients.length > 0 &&
        Array.isArray(item.steps) && item.steps.length > 0, 'CATALOG_FREE_DETAILS');
    } else {
      check(['ingredients', 'steps', 'note'].every(k => !Object.hasOwn(item, k) || item[k] === null), 'CATALOG_PRIVATE_DETAILS');
      if (Object.hasOwn(item, 'preview_ingredients')) {
        check(Array.isArray(item.preview_ingredients) && item.preview_ingredients.length <= 3 &&
          item.preview_ingredients.every(x => object(x) && Object.keys(x).length === 1 && typeof x.name === 'string'), 'CATALOG_PREVIEW_INGREDIENTS');
      }
      if (Object.hasOwn(item, 'preview_steps')) {
        check(Array.isArray(item.preview_steps) && item.preview_steps.length <= 1 &&
          item.preview_steps.every(x => typeof x === 'string' || (object(x) && Object.keys(x).length === 1 && typeof x.text === 'string')),
        'CATALOG_PREVIEW_STEPS');
      }
    }
  }
  check(levels.free > 0 && levels.trial + levels.pro > 0, 'CATALOG_COVERAGE');
  return { count: value.length, levels, ids: [...ids].sort() };
}
function sitemap(text, ids) {
  // Deliberately accept only the grammar emitted by src/sitemap.js. No DTD,
  // external entities, scripts, alternate origins, or HTML success pages.
  check(typeof text === 'string', 'SITEMAP_BODY');
  const root = text.trim().match(/^(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">([\s\S]*)<\/urlset>$/);
  check(root, 'SITEMAP_ROOT');
  const urls = new Set();
  const rest = root[1].replace(/<url>\s*<loc>([^<>]+)<\/loc>\s*<\/url>/g, (_, encoded) => {
    check(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(encoded), 'SITEMAP_ENTITY');
    const decoded = encoded.replace(/&(amp|lt|gt|quot|apos);/g, (s, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key]);
    const url = new URL(decoded);
    check(url.origin === 'https://plate.voronova.online' && !url.username && !url.password && !url.hash &&
      url.href === decoded && !urls.has(decoded), 'SITEMAP_URL');
    urls.add(decoded); return '';
  });
  check(rest.trim() === '' && urls.has('https://plate.voronova.online/') &&
    ids.every(id => urls.has('https://plate.voronova.online/recipe.html?id=' + encodeURIComponent(id))), 'SITEMAP_COVERAGE');
  return { urls: urls.size, catalogRecipes: ids.length };
}
function request(url) {
  check(URLS.includes(url), 'HTTP_TARGET');
  return new Promise((resolve, reject) => {
    let bytes = 0, done = false;
    const chunks = [];
    const finish = (error, result) => { if (!done) { done = true; clearTimeout(deadline); error ? reject(error) : resolve(result); } };
    const req = (url.startsWith('https:') ? https : http).get(url, {
      agent: false, headers: { Accept: url === SITEMAP ? 'application/xml' : 'application/json', 'Accept-Encoding': 'identity' }
    }, res => {
      res.on('error', () => finish(new Error('HTTP_RESPONSE')));
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { finish(new Error('HTTP_BODY_LIMIT')); res.destroy(); req.destroy(); }
        else chunks.push(chunk);
      });
      res.on('end', () => finish(null, { status: res.statusCode, type: res.headers['content-type'] || '',
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    // Whole request deadline includes DNS, TLS and streaming a slow response.
    const deadline = setTimeout(() => { finish(new Error('HTTP_TIMEOUT')); req.destroy(); }, 5000);
    req.on('error', () => finish(new Error('HTTP_REQUEST')));
  });
}
function json(response) {
  check(response.status === 200 && /^application\/json(?:\s*;|$)/i.test(response.type), 'HTTP_JSON');
  try { return JSON.parse(response.body); } catch { throw new Error('HTTP_JSON_BODY'); }
}
async function collect(fetch = request) {
  const catalogs = [];
  for (const origin of ORIGINS) {
    health(json(await fetch(origin + '/health')));
    catalogs.push(catalog(json(await fetch(origin + '/content/recipes'))));
    for (const route of PRIVATE) {
      const response = await fetch(origin + route);
      check(response.status === 401 && /^application\/json(?:\s*;|$)/i.test(response.type), 'PRIVATE_ROUTE');
      let body; try { body = JSON.parse(response.body); } catch { throw new Error('PRIVATE_BODY'); }
      check(object(body) && typeof body.error === 'string' &&
        Object.keys(body).every(k => ['error', 'message', 'statusCode'].includes(k)), 'PRIVATE_BODY');
    }
  }
  check(JSON.stringify(catalogs[0]) === JSON.stringify(catalogs[1]), 'CATALOG_ORIGIN_MISMATCH');
  const response = await fetch(SITEMAP);
  check(response.status === 200 && /^(?:application|text)\/xml(?:\s*;|$)/i.test(response.type), 'SITEMAP_HTTP');
  const map = sitemap(response.body, catalogs[0].ids);
  return { checks: { localHealth: true, publicHealth: true, catalogAccess: true, privateRoutes: true, sitemap: true },
    catalog: { count: catalogs[0].count, levels: catalogs[0].levels }, sitemap: map };
}
module.exports = { ORIGINS, PRIVATE, SITEMAP, URLS, health, catalog, sitemap, request, collect };
