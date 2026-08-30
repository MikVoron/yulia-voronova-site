const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const platform = path.join(root, 'platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

const index = read('index.html');
assert.match(index, /<link rel="canonical" href="https:\/\/plate\.voronova\.online\/">/);
assert.match(index, /rel="image_src" href="https:\/\/plate\.voronova\.online\/images\/smartplate-share\.jpg"/);
assert.match(index, /property="og:image" content="https:\/\/plate\.voronova\.online\/images\/smartplate-share\.jpg"/);
assert.match(index, /property="og:image:url" content="https:\/\/plate\.voronova\.online\/images\/smartplate-share\.jpg"/);
assert.match(index, /property="og:image:type" content="image\/jpeg"/);
assert.match(index, /name="twitter:card" content="summary_large_image"/);
assert.match(index, /src="seo\.js\?v=20260817-broth-yield"/);
assert.match(index, /src="index-seo\.js\?v=20260830-clean-social-preview"/);
assert.match(read('index-seo.js'), /'@type': 'WebSite'/);
assert.match(read('index-seo.js'), /image: 'https:\/\/plate\.voronova\.online\/images\/smartplate-share\.jpg'/);

for (const file of ['recipe.html', 'category.html', 'ingredient.html']) {
    const html = read(file);
    assert.match(html, /meta name="description"/, `${file} description is missing`);
    assert.match(html, /meta name="robots" content="index, follow, max-image-preview:large"/, `${file} index rule is missing`);
    const seoVersion = file === 'recipe.html' ? '20260817-broth-yield' : '20260731-seo';
    assert.match(html, new RegExp('src="seo\\.js\\?v=' + seoVersion + '"'), `${file} SEO runtime is missing`);
}

const technicalPages = [
    'admin.html', 'auth-callback.html', 'cabinet.html', 'login.html',
    'recipe-editor.html', 'loader-preview.html', 'popup-preview.html', 'toggle-variants.html'
];
for (const file of technicalPages) {
    assert.match(read(file), /meta name="robots" content="noindex, nofollow"/, `${file} must be noindex`);
}

const robots = read('robots.txt');
assert.match(robots, /User-agent: \*/);
assert.match(robots, /User-agent: facebookexternalhit[\s\S]*?Allow: \//);
assert.match(robots, /User-agent: Facebot[\s\S]*?Allow: \//);
assert.match(robots, /User-agent: TelegramBot[\s\S]*?Allow: \//);
assert.match(robots, /Sitemap: https:\/\/plate\.voronova\.online\/sitemap\.xml/);

const sitemap = read('sitemap.xml');
const locations = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1]);
assert(locations.length >= 20, 'Sitemap unexpectedly contains too few URLs');
assert.strictEqual(new Set(locations).size, locations.length, 'Sitemap contains duplicate URLs');
assert(locations.includes('https://plate.voronova.online/'));
assert(locations.some(url => url.includes('/category.html?cat=')));
assert(locations.some(url => url.includes('/ingredient.html?id=')));
assert(locations.some(url => url.includes('/recipe.html?id=')));
for (const file of technicalPages) {
    assert(!locations.some(url => url.includes('/' + file)), `${file} must not be in sitemap`);
}

assert(fs.statSync(path.join(platform, 'images', 'smartplate-share.jpg')).size > 0);
assert(fs.statSync(path.join(root, 'images', 'smartplate-share-telegram-1200x630.jpg')).size > 0);

const sharePage = fs.readFileSync(path.join(root, 'smartplate', 'index.html'), 'utf8');
assert.match(sharePage, /meta name="robots" content="noindex, follow"/);
assert.match(sharePage, /rel="canonical" href="https:\/\/plate\.voronova\.online\/"/);
assert.match(sharePage, /property="og:url" content="https:\/\/voronova\.online\/smartplate\/"/);
assert.match(sharePage, /property="og:image" content="https:\/\/voronova\.online\/images\/smartplate-share-telegram-1200x630\.jpg"/);
assert.match(fs.readFileSync(path.join(root, 'smartplate', 'redirect.js'), 'utf8'), /location\.replace\('https:\/\/plate\.voronova\.online\/'\)/);

function createSeoDom() {
    const nodes = [];
    function find(selector) {
        let match = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
        if (match) return nodes.find(node => node.tagName === 'meta' && node.attributes[match[1]] === match[2]) || null;
        if (selector === 'link[rel="canonical"]') {
            return nodes.find(node => node.tagName === 'link' && node.attributes.rel === 'canonical') || null;
        }
        return null;
    }
    return {
        nodes,
        title: '',
        head: { querySelector: find, appendChild(node) { nodes.push(node); } },
        createElement(tagName) {
            return {
                tagName,
                attributes: {},
                setAttribute(name, value) { this.attributes[name] = String(value); }
            };
        },
        getElementById(id) { return nodes.find(node => node.id === id) || null; }
    };
}

const document = createSeoDom();
const sandbox = { window: {}, document, URL };
vm.runInNewContext(read('seo.js'), sandbox, { filename: 'seo.js' });
sandbox.window.SmartPlateSEO.setRecipe({
    id: 'test-free-recipe', name: 'Тестовый рецепт', accessLevel: 'free',
    quote: 'Полезный тестовый рецепт', photo: 'images/recipes/test/cover.webp',
    servings: 2, time: 25, kcal: 320, protein: 18, fat: 10, carbs: 40, fiber: 6,
    cat: 'soups', tags: ['растительное', 'без глютена'],
    ingredients: [{ name: '[Нут](hummus): 200 г' }],
    steps: [{ text: 'Смешать ингредиенты.', photo: 'images/recipes/test/step-1.webp' }]
});
assert.strictEqual(document.title, 'Тестовый рецепт — рецепт | Умная тарелка');
assert.strictEqual(document.head.querySelector('link[rel="canonical"]').attributes.href, 'https://plate.voronova.online/recipe.html?id=test-free-recipe');
const freeSchema = JSON.parse(document.getElementById('smartplate-page-schema').textContent);
assert.strictEqual(freeSchema['@type'], 'Recipe');
assert.deepStrictEqual(Array.from(freeSchema.recipeIngredient), ['Нут: 200 г']);
assert.strictEqual(freeSchema.recipeInstructions[0].text, 'Смешать ингредиенты.');
assert.strictEqual(freeSchema.recipeInstructions[0].name, 'Смешать ингредиенты.');
assert.strictEqual(freeSchema.recipeInstructions[0].url, 'https://plate.voronova.online/recipe.html?id=test-free-recipe#recipe-step-1');
assert.strictEqual(freeSchema.recipeInstructions[0].image, 'https://plate.voronova.online/images/recipes/test/step-1.webp');
assert.strictEqual(freeSchema.recipeCategory, 'Супы');
assert.strictEqual(freeSchema.keywords, 'растительное, без глютена');

sandbox.window.SmartPlateSEO.setRecipeRating('test-free-recipe', { value: 4.7, count: 3 });
const ratedSchema = JSON.parse(document.getElementById('smartplate-page-schema').textContent);
assert.deepStrictEqual(ratedSchema.aggregateRating, {
    '@type': 'AggregateRating', ratingValue: 4.7, ratingCount: 3, bestRating: 5, worstRating: 1
});

sandbox.window.SmartPlateSEO.setRecipe({
    id: 'test-pro-recipe', name: 'Платный рецепт', accessLevel: 'pro', photo: null
});
const paidSchema = JSON.parse(document.getElementById('smartplate-page-schema').textContent);
assert.strictEqual(paidSchema['@type'], 'WebPage');
assert.strictEqual(paidSchema.isAccessibleForFree, false);
assert.strictEqual(paidSchema.recipeIngredient, undefined);

console.log(`SmartPlate SEO checks passed: ${locations.length} sitemap URLs`);
