const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { listStaticIngredients } = require('./ingredient-seo');

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function imageUrl(value) {
  const clean = String(value || '').replace(/\\/g, '/');
  if (!clean) return '';
  const url = new URL(clean, 'https://voronova.online/');
  return url.protocol === 'https:' ? url.href : '';
}

function recipeCount(value) {
  const n = Number(value) || 0;
  const word = n % 10 === 1 && n % 100 !== 11 ? 'рецепт'
    : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'рецепта' : 'рецептов';
  return `${n} ${word}`;
}

async function readHomeTemplate() {
  const deployed = path.resolve(__dirname, '..', '..', 'smartplate-platform');
  const directory = fsSync.existsSync(deployed) ? deployed : path.resolve(__dirname, '..', '..', 'platform');
  return fs.readFile(path.join(directory, 'index.html'), 'utf8');
}

async function loadIngredientLinks(db) {
  const [used, catalog, defaults] = await Promise.all([
    db.query('SELECT DISTINCT unnest(main_ingredients) AS id FROM recipes WHERE is_published=true'),
    db.query('SELECT id, name FROM ingredient_catalog ORDER BY id'),
    listStaticIngredients(),
  ]);
  const names = new Map([...defaults, ...catalog.rows].map(item => [item.id, item.name]));
  return used.rows.filter(item => names.has(item.id))
    .map(item => ({ id: item.id, name: names.get(item.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function renderIngredientLinks(document, ingredients) {
  const groups = [];
  for (let i = 0; i < ingredients.length; i += 8) {
    groups.push('<div class="sp-nav-group">' + ingredients.slice(i, i + 8).map(item =>
      `<a role="menuitem" href="ingredient.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>`
    ).join('') + '</div>');
  }
  return document.replace(/(<div class="sp-nav-panel sp-nav-panel--ingredients" role="menu">)\s*<\/div>/,
    (_, prefix) => `${prefix}<div class="sp-nav-groups">${groups.join('')}</div></div>`);
}

async function loadHomeData(db) {
  const [categories, popular, ingredients] = await Promise.all([
    db.query(`SELECT c.id, c.name, c.description, c.emoji, cover.photo,
                     COUNT(r.id)::int AS recipe_count
                FROM categories c
                JOIN recipe_categories rc ON rc.category_id=c.id
                JOIN recipes r ON r.id=rc.recipe_id AND r.is_published=true
                LEFT JOIN recipes cover ON cover.id=c.cover_recipe_id AND cover.is_published=true
               GROUP BY c.id, cover.photo ORDER BY c.sort_order, c.name`),
    db.query(`SELECT r.id, r.name, r.photo, r.time_min, r.time_label, r.difficulty,
                     r.kcal, r.access_level, r.is_free,
                     ROUND(AVG(v.stars)::numeric, 1) AS rating, COUNT(v.id)::int AS review_count
                FROM recipes r JOIN reviews v ON v.recipe_id=r.id
               WHERE r.is_published=true
               GROUP BY r.id HAVING AVG(v.stars)>0
               ORDER BY rating DESC, review_count DESC, r.created_at DESC, r.id LIMIT 8`),
    loadIngredientLinks(db),
  ]);
  return { categories: categories.rows, popular: popular.rows, ingredients };
}

function recipeCard(recipe) {
  const name = escapeHtml(recipe.name);
  const photo = imageUrl(recipe.photo);
  const free = recipe.access_level === 'free' || recipe.is_free === true;
  const access = free ? 'Бесплатно' : recipe.access_level === 'trial' ? 'Пробный' : 'Подписка';
  const difficulty = { easy: 'Легкая', medium: 'Средняя', hard: 'Сложная' }[recipe.difficulty] || '';
  return `<a class="sp-card${free ? '' : ' locked'}" href="recipe.html?id=${encodeURIComponent(recipe.id)}" aria-label="${name}. ${access}">
    <div class="sp-card-media">${photo ? `<img src="${escapeHtml(photo)}" alt="${name}" loading="lazy">` : ''}
      <span class="sp-card-tag">${access}</span></div>
    <div class="sp-card-body"><h3 class="sp-card-title">${name}</h3>
      <div class="sp-card-rating"><span class="sp-card-rating-value">${Number(recipe.rating).toFixed(1)}</span><span>(${Number(recipe.review_count)})</span></div>
      <div class="sp-card-meta"><span>${escapeHtml(recipe.time_label || `${Number(recipe.time_min)} мин`)}</span><span>${difficulty}</span></div>
      <div class="sp-card-foot"><span class="lbl">В порции</span><span class="val">${Number(recipe.kcal)}<small>ккал</small></span></div></div></a>`;
}

function renderHomeDocument(template, data) {
  let document = renderIngredientLinks(template, data.ingredients);
  document = document.replace('</head>', '<noscript><style>body{visibility:visible!important}.anim{opacity:1!important;transform:none!important}</style></noscript>\n</head>');
  const categories = data.categories.map(item => {
    const photo = imageUrl(item.photo);
    return `<a class="cat-card" data-category-id="${encodeURIComponent(item.id)}" href="category.html?cat=${encodeURIComponent(item.id)}">
      <div class="cat-icon-wrap">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(item.name)}" loading="lazy">` : ''}</div>
      <div class="cat-body"><div class="cat-name">${escapeHtml(item.name)}</div>
      <div class="cat-desc">${escapeHtml(item.description)}</div><div class="cat-count">${recipeCount(item.recipe_count)}</div></div></a>`;
  }).join('');
  document = document.replace('<div class="cat-grid" id="cat-grid"></div>', `<div class="cat-grid" id="cat-grid">${categories}</div>`);
  return document.replace('<div class="sp-grid" id="recommended-grid"></div>',
    `<div class="sp-grid" id="recommended-grid">${data.popular.map(recipeCard).join('')}</div>`);
}

module.exports = { readHomeTemplate, loadHomeData, loadIngredientLinks, renderIngredientLinks, renderHomeDocument };
