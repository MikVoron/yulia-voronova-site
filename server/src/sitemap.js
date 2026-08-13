const fs = require('node:fs/promises');
const path = require('node:path');

const ORIGIN = 'https://app.voronova.online';
const DEFAULT_SITEMAP_PATH = path.resolve(__dirname, '..', '..', 'platform', 'sitemap.xml');

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry(url) {
  return `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`;
}

function buildSitemap({ recipes, categories, ingredients }) {
  const urls = [
    `${ORIGIN}/`,
    `${ORIGIN}/category.html`,
    `${ORIGIN}/how-subscription-works.html`,
    `${ORIGIN}/personal-data-processing-policy.html`,
    ...categories.filter(item => item && item.id).map(item => `${ORIGIN}/category.html?cat=${encodeURIComponent(item.id)}`),
    ...ingredients.filter(item => item && item.id).map(item => `${ORIGIN}/ingredient.html?id=${encodeURIComponent(item.id)}`),
    ...recipes.filter(item => item && item.id).map(item => `${ORIGIN}/recipe.html?id=${encodeURIComponent(item.id)}`),
  ];
  const uniqueUrls = [...new Set(urls)];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniqueUrls.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');
}

async function refreshSitemap(db, options = {}) {
  // Route tests use lightweight DB stubs; never let a test request overwrite
  // the checked-in sitemap with fixture data.
  if (process.env.VITEST && !options.output) return { skipped: true, urlCount: 0 };
  const [recipesResult, categoriesResult, ingredientsResult] = await Promise.all([
    db.query('SELECT id FROM recipes WHERE is_published = true ORDER BY sort_order, created_at'),
    db.query('SELECT id FROM categories ORDER BY sort_order, id'),
    db.query('SELECT id FROM ingredient_catalog ORDER BY group_id, sort_order, id'),
  ]);
  const output = options.output || process.env.SMARTPLATE_SITEMAP_PATH || DEFAULT_SITEMAP_PATH;
  const xml = buildSitemap({
    recipes: recipesResult.rows,
    categories: categoriesResult.rows,
    ingredients: ingredientsResult.rows,
  });
  const temporaryOutput = `${output}.${process.pid}.tmp`;
  await fs.writeFile(temporaryOutput, xml, 'utf8');
  await fs.rename(temporaryOutput, output);
  return { output, urlCount: (xml.match(/<loc>/g) || []).length };
}

async function refreshSitemapSafely(db, log) {
  try {
    const result = await refreshSitemap(db);
    log.info({ sitemap: result }, 'SmartPlate sitemap refreshed');
  } catch (error) {
    // Sitemap is derived SEO data. Do not roll back a successfully saved recipe
    // if filesystem publication is temporarily unavailable.
    log.error({ err: error }, 'SmartPlate sitemap refresh failed');
  }
}

module.exports = { buildSitemap, refreshSitemap, refreshSitemapSafely };
