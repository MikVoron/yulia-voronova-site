const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://plate.voronova.online';
const SOCIAL_IMAGE = `${ORIGIN}/images/smartplate-share-v2.jpg`;
const DEPLOYED_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'smartplate-platform');
const LOCAL_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'platform');

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function upsertMeta(document, attribute, key, value) {
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(value)}">`;
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, 'i');
  return pattern.test(document) ? document.replace(pattern, tag) : document.replace(/<\/head>/i, `${tag}\n</head>`);
}

function renderCategoryDocument(template, category, recipes = [], options = {}) {
  const search = Boolean(options.search);
  const name = search ? 'Поиск по рецептам' : category ? category.name : 'Каталог полезных рецептов';
  const title = `${name} | Умная тарелка`;
  const description = search
    ? 'Результаты поиска по каталогу полезных рецептов «Умной тарелки».'
    : category?.description || (category
      ? `Подборка рецептов категории «${name}» с расчётом КБЖУ и пошаговым приготовлением.`
      : 'Полезные рецепты от нутрициолога Юлии Вороновой: КБЖУ, замены продуктов и пошаговое приготовление.');
  const canonical = `${ORIGIN}/category.html${category && !search ? `?cat=${encodeURIComponent(category.id)}` : ''}`;
  const noindex = search || (category && recipes.length === 0);
  const schema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name, description, url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Умная тарелка', url: `${ORIGIN}/` },
  };
  if (recipes.length) schema.mainEntity = {
    '@type': 'ItemList',
    itemListElement: recipes.slice(0, 100).map((recipe, index) => ({
      '@type': 'ListItem', position: index + 1, name: recipe.name,
      url: `${ORIGIN}/recipe.html?id=${encodeURIComponent(recipe.id)}`,
    })),
  };

  let document = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  document = upsertMeta(document, 'name', 'description', description);
  document = upsertMeta(document, 'name', 'robots', noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large');
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  document = /<link\s+rel=["']canonical["'][^>]*>/i.test(document)
    ? document.replace(/<link\s+rel=["']canonical["'][^>]*>/i, canonicalTag)
    : document.replace(/<\/head>/i, `${canonicalTag}\n</head>`);
  for (const [attribute, key, value] of [
    ['property', 'og:title', title], ['property', 'og:description', description],
    ['property', 'og:url', canonical], ['property', 'og:type', 'website'],
    ['property', 'og:image', SOCIAL_IMAGE], ['name', 'twitter:title', title],
    ['name', 'twitter:description', description], ['name', 'twitter:image', SOCIAL_IMAGE],
  ]) document = upsertMeta(document, attribute, key, value);
  const schemaTag = `<script id="smartplate-page-schema" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  document = document.replace(/<\/head>/i, `${schemaTag}\n</head>`);

  if (category && !search) {
    const hero = `<div class="cat-hero" id="cat-hero"><h1 class="cat-hero-name">${escapeHtml(name)}</h1><p class="cat-hero-desc">${escapeHtml(description)}</p></div>`;
    document = document.replace('<div class="cat-hero" id="cat-hero"></div>', hero);
    const links = recipes.slice(0, 100).map(recipe =>
      `<a href="recipe.html?id=${encodeURIComponent(recipe.id)}">${escapeHtml(recipe.name)}</a>`
    ).join(' ');
    document = document.replace('<div class="recipe-card-grid anim anim-d1" id="dish-list" style="margin-top:14px"></div>',
      `<div class="recipe-card-grid anim anim-d1" id="dish-list" style="margin-top:14px">${links}</div>`);
  }
  return document;
}

async function readCategoryTemplate() {
  const directory = fsSync.existsSync(DEPLOYED_PLATFORM_DIR) ? DEPLOYED_PLATFORM_DIR : LOCAL_PLATFORM_DIR;
  return fs.readFile(path.join(directory, 'category.html'), 'utf8');
}

module.exports = { readCategoryTemplate, renderCategoryDocument };
