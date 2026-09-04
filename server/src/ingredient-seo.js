const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ORIGIN = 'https://plate.voronova.online';
const SOCIAL_IMAGE = `${ORIGIN}/images/smartplate-share-v2.jpg`;
const DEPLOYED_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'smartplate-platform');
const LOCAL_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'platform');
let staticCatalogPromise;

function platformDir() {
  return fsSync.existsSync(DEPLOYED_PLATFORM_DIR) ? DEPLOYED_PLATFORM_DIR : LOCAL_PLATFORM_DIR;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function upsertMeta(document, attribute, key, content) {
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}">`;
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  return pattern.test(document) ? document.replace(pattern, tag) : document.replace(/<\/head>/i, `${tag}\n</head>`);
}

function upsertCanonical(document, canonical) {
  const tag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  return /<link\s+rel=["']canonical["'][^>]*>/i.test(document)
    ? document.replace(/<link\s+rel=["']canonical["'][^>]*>/i, tag)
    : document.replace(/<\/head>/i, `${tag}\n</head>`);
}

function ingredientUrl(id) {
  return `${ORIGIN}/ingredient.html?id=${encodeURIComponent(id)}`;
}

async function readStaticCatalog() {
  if (!staticCatalogPromise) {
    staticCatalogPromise = fs.readFile(path.join(platformDir(), 'ingredients.js'), 'utf8').then(source => {
      const sandbox = { window: {} };
      vm.runInNewContext(source, sandbox, { timeout: 1000 });
      const items = sandbox.window.SP_INGREDIENTS?.items;
      if (!Array.isArray(items)) throw new Error('Static ingredient catalogue was not loaded');
      return new Map(items.map(item => [item.id, { id: item.id, name: item.name }]));
    });
  }
  return staticCatalogPromise;
}

async function getStaticIngredient(id) {
  return (await readStaticCatalog()).get(id) || null;
}

function ingredientDescription(name) {
  return `Подборка полезных рецептов с ингредиентом «${name}» и расчётом КБЖУ.`;
}

function renderIngredientDocument(template, ingredient, recipes) {
  const canonical = ingredientUrl(ingredient.id);
  const collectionName = `Рецепты с ингредиентом «${ingredient.name}»`;
  const title = `${collectionName} | Умная тарелка`;
  const description = ingredientDescription(ingredient.name);
  const items = (recipes || []).slice(0, 100).map((recipe, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: recipe.name,
    url: `${ORIGIN}/recipe.html?id=${encodeURIComponent(recipe.id)}`,
  }));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: collectionName,
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Умная тарелка', url: `${ORIGIN}/` },
  };
  if (items.length) schema.mainEntity = { '@type': 'ItemList', itemListElement: items };

  let document = template.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  document = upsertMeta(document, 'name', 'description', description);
  document = upsertCanonical(document, canonical);
  document = upsertMeta(document, 'property', 'og:title', title);
  document = upsertMeta(document, 'property', 'og:description', description);
  document = upsertMeta(document, 'property', 'og:url', canonical);
  document = upsertMeta(document, 'property', 'og:type', 'website');
  document = upsertMeta(document, 'property', 'og:image', SOCIAL_IMAGE);
  document = upsertMeta(document, 'property', 'og:image:secure_url', SOCIAL_IMAGE);
  document = upsertMeta(document, 'property', 'og:image:type', 'image/jpeg');
  document = upsertMeta(document, 'property', 'og:image:alt', collectionName);
  document = upsertMeta(document, 'name', 'twitter:title', title);
  document = upsertMeta(document, 'name', 'twitter:description', description);
  document = upsertMeta(document, 'name', 'twitter:image', SOCIAL_IMAGE);
  document = upsertMeta(document, 'name', 'twitter:image:alt', collectionName);
  const schemaTag = `<script id="smartplate-page-schema" type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  return document.replace(/<\/head>/i, `${schemaTag}\n</head>`);
}

async function readIngredientTemplate() {
  return fs.readFile(path.join(platformDir(), 'ingredient.html'), 'utf8');
}

module.exports = {
  getStaticIngredient,
  ingredientDescription,
  readIngredientTemplate,
  renderIngredientDocument,
};
