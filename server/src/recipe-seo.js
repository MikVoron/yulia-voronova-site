const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const ORIGIN = 'https://plate.voronova.online';
const SITE_ORIGIN = 'https://voronova.online';
const SOCIAL_IMAGE = `${ORIGIN}/images/smartplate-share-v2.jpg`;
const RECIPE_CATEGORY_NAMES = {
  breakfasts: 'Завтраки',
  soups: 'Супы',
  mains: 'Горячее',
  cutlets: 'Котлеты',
  salads: 'Салаты',
  sides: 'Гарниры',
  pancakes: 'Блины и оладьи',
  spreads: 'Намазки',
  sauces: 'Соусы',
  bases: 'Основа',
  breads: 'Хлеб и крекеры',
  drinks: 'Напитки',
};
const DEPLOYED_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'smartplate-platform');
const LOCAL_PLATFORM_DIR = path.resolve(__dirname, '..', '..', 'platform');

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

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function summary(value, maxLength = 180) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength + 1).replace(/\s+\S*$/, '').replace(/[\s,;:—-]+$/, '') + '…';
}

function absoluteImage(value) {
  if (!value) return SOCIAL_IMAGE;
  if (/^https?:\/\//i.test(value)) return value;
  return `${ORIGIN}/${String(value).replace(/^\/+/, '')}`;
}

function upsertMeta(document, attribute, key, content) {
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}">`;
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  if (pattern.test(document)) return document.replace(pattern, tag);
  return document.replace(/<\/head>/i, `${tag}\n</head>`);
}

function upsertCanonical(document, canonical) {
  const tag = `<link rel="canonical" href="${escapeHtml(canonical)}">`;
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/i;
  if (pattern.test(document)) return document.replace(pattern, tag);
  return document.replace(/<\/head>/i, `${tag}\n</head>`);
}

function recipeUrl(id) {
  return `${ORIGIN}/recipe.html?id=${encodeURIComponent(id)}`;
}

function recipeDescription(recipe) {
  return summary(recipe.quote) || `${recipe.name} — рецепт с расчётом КБЖУ в сервисе «Умная тарелка».`;
}

function ingredientName(item) {
  return cleanText(typeof item === 'string' ? item : item && item.name).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function stepText(step) {
  return cleanText(typeof step === 'string' ? step : step && step.text);
}

function stepImage(step) {
  if (!step || typeof step !== 'object') return '';
  const photo = Array.isArray(step.photo)
    ? step.photo.find(item => typeof item === 'string' && item)
    : step.photo;
  return typeof photo === 'string' && photo ? absoluteImage(photo) : '';
}

function stepName(text, index) {
  const firstSentence = cleanText(text).match(/^.*?[.!?](?:\s|$)/);
  return summary(firstSentence ? firstSentence[0] : text, 90) || `Шаг ${index + 1}`;
}

function recipeCategories(recipe) {
  const ids = Array.isArray(recipe.categories) && recipe.categories.length
    ? recipe.categories
    : (recipe.cat ? [recipe.cat] : []);
  return ids.map(id => RECIPE_CATEGORY_NAMES[id]).filter(Boolean).join(', ');
}

function buildSchema(recipe) {
  const isFree = recipe.access_level === 'free' || recipe.is_free === true;
  const schema = {
    '@context': 'https://schema.org',
    '@type': isFree ? 'Recipe' : 'WebPage',
    name: recipe.name,
    description: recipeDescription(recipe),
    url: recipeUrl(recipe.id),
    image: [absoluteImage(recipe.photo)],
    author: { '@type': 'Person', name: 'Юлия Воронова', url: `${SITE_ORIGIN}/` },
    isAccessibleForFree: isFree,
  };
  if (!isFree) return schema;

  const ingredients = (recipe.ingredients || []).map(ingredientName).filter(Boolean);
  const instructions = (recipe.steps || []).map((step, index) => {
    const text = stepText(step);
    if (!text) return null;
    const instruction = {
      '@type': 'HowToStep',
      name: stepName(text, index),
      text,
      url: `${recipeUrl(recipe.id)}#recipe-step-${index + 1}`,
    };
    const image = stepImage(step);
    if (image) instruction.image = image;
    return instruction;
  }).filter(Boolean);
  const category = recipeCategories(recipe);
  const keywords = (recipe.tags || []).map(cleanText).filter(Boolean);
  if (recipe.servings) schema.recipeYield = `${recipe.servings} порций`;
  if (Number(recipe.time_min) > 0) schema.totalTime = `PT${Number(recipe.time_min)}M`;
  if (ingredients.length) schema.recipeIngredient = ingredients;
  if (instructions.length) schema.recipeInstructions = instructions;
  if (category) schema.recipeCategory = category;
  if (keywords.length) schema.keywords = keywords.join(', ');
  schema.nutrition = {
    '@type': 'NutritionInformation',
    calories: `${Number(recipe.kcal || 0)} ккал`,
    proteinContent: `${Number(recipe.protein || 0)} г`,
    fatContent: `${Number(recipe.fat || 0)} г`,
    carbohydrateContent: `${Number(recipe.carbs || 0)} г`,
    fiberContent: `${Number(recipe.fiber || 0)} г`,
  };
  return schema;
}

function buildArticle(recipe) {
  const isFree = recipe.access_level === 'free' || recipe.is_free === true;
  const tags = (recipe.tags || []).map(tag => `<li>${escapeHtml(tag)}</li>`).join('');
  const ingredients = isFree
    ? (recipe.ingredients || []).map(ingredientName).filter(Boolean).map(item => `<li>${escapeHtml(item)}</li>`).join('')
    : '';
  const steps = isFree
    ? (recipe.steps || []).map(stepText).map((item, index) => item ? `<li id="recipe-step-${index + 1}">${escapeHtml(item)}</li>` : '').join('')
    : '';
  return `
<article id="seo-recipe-content" class="seo-recipe-content">
  <div class="seo-recipe-inner">
    <p class="seo-recipe-kicker">Умная тарелка · рецепт</p>
    <h1>${escapeHtml(recipe.name)}</h1>
    <img src="${escapeHtml(absoluteImage(recipe.photo))}" alt="${escapeHtml(recipe.name)}" width="1200" height="630">
    <p class="seo-recipe-description">${escapeHtml(recipeDescription(recipe))}</p>
    <dl class="seo-recipe-nutrition"><div><dt>Время</dt><dd>${Number(recipe.time_min || 0)} мин.</dd></div><div><dt>Калорийность</dt><dd>${Number(recipe.kcal || 0)} ккал</dd></div><div><dt>Белки</dt><dd>${Number(recipe.protein || 0)} г</dd></div><div><dt>Жиры</dt><dd>${Number(recipe.fat || 0)} г</dd></div><div><dt>Углеводы</dt><dd>${Number(recipe.carbs || 0)} г</dd></div></dl>
    ${tags ? `<ul class="seo-recipe-tags">${tags}</ul>` : ''}
    ${ingredients ? `<h2>Ингредиенты</h2><ul>${ingredients}</ul>` : ''}
    ${steps ? `<h2>Приготовление</h2><ol>${steps}</ol>` : ''}
    ${isFree ? '' : '<p>Полный список ингредиентов и пошаговое приготовление доступны участникам сервиса.</p>'}
    <p><a href="${escapeHtml(recipeUrl(recipe.id))}#recipe">Открыть рецепт в «Умной тарелке»</a></p>
  </div>
</article>`;
}

function renderRecipeDocument(template, recipe) {
  const canonical = recipeUrl(recipe.id);
  const description = recipeDescription(recipe);
  const title = `${recipe.name} — рецепт | Умная тарелка`;
  const schema = JSON.stringify(buildSchema(recipe)).replace(/</g, '\\u003c');
  const head = `
<script id="smartplate-page-schema" type="application/ld+json">${schema}</script>
<style>body{visibility:visible!important}.seo-recipe-content{max-width:1040px;margin:0 auto;padding:112px 24px 64px;background:#fff;color:#1f2720;font:16px/1.6 Montserrat,Arial,sans-serif}.seo-recipe-inner{max-width:760px}.seo-recipe-kicker{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a481f}.seo-recipe-content h1,.seo-recipe-content h2{font-family:"Cormorant Garamond",Georgia,serif;line-height:1.05}.seo-recipe-content h1{font-size:clamp(42px,7vw,70px);margin:0 0 24px}.seo-recipe-content h2{font-size:32px;margin:36px 0 12px}.seo-recipe-content img{display:block;width:100%;height:auto;max-height:500px;object-fit:cover;margin:24px 0}.seo-recipe-description{font-size:19px}.seo-recipe-nutrition{display:flex;flex-wrap:wrap;gap:8px 24px;margin:24px 0}.seo-recipe-nutrition div{display:flex;gap:6px}.seo-recipe-nutrition dt{font-weight:700}.seo-recipe-nutrition dd{margin:0}.seo-recipe-tags{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.seo-recipe-tags li{padding:3px 8px;border:1px solid #d9c9bc;font-size:13px}.seo-recipe-content a{color:#7c3b1c;font-weight:700}</style>`;
  let document = template
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  document = upsertMeta(document, 'name', 'description', description);
  document = upsertCanonical(document, canonical);
  document = upsertMeta(document, 'property', 'og:title', title);
  document = upsertMeta(document, 'property', 'og:description', description);
  document = upsertMeta(document, 'property', 'og:url', canonical);
  document = upsertMeta(document, 'property', 'og:type', recipe.access_level === 'free' || recipe.is_free === true ? 'article' : 'website');
  document = upsertMeta(document, 'property', 'og:image', SOCIAL_IMAGE);
  document = upsertMeta(document, 'property', 'og:image:url', SOCIAL_IMAGE);
  document = upsertMeta(document, 'property', 'og:image:secure_url', SOCIAL_IMAGE);
  document = upsertMeta(document, 'property', 'og:image:type', 'image/jpeg');
  document = upsertMeta(document, 'property', 'og:image:alt', recipe.name);
  document = upsertMeta(document, 'name', 'twitter:title', title);
  document = upsertMeta(document, 'name', 'twitter:description', description);
  document = upsertMeta(document, 'name', 'twitter:image', SOCIAL_IMAGE);
  document = upsertMeta(document, 'name', 'twitter:image:alt', recipe.name);
  return document
    .replace(/<\/head>/i, `${head}\n</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${buildArticle(recipe)}`);
}

async function readRecipeTemplate() {
  return fs.readFile(path.join(platformDir(), 'recipe.html'), 'utf8');
}

module.exports = { buildSchema, renderRecipeDocument, readRecipeTemplate };
