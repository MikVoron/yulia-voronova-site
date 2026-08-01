const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const platform = path.join(root, 'platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

const index = read('index.html');
assert.match(index, /<link rel="canonical" href="https:\/\/app\.voronova\.online\/">/);
assert.match(index, /property="og:image" content="https:\/\/voronova\.online\/images\/smartplate-share-telegram-1200x630\.jpg"/);
assert.match(index, /property="og:image:type" content="image\/jpeg"/);
assert.match(index, /name="twitter:card" content="summary_large_image"/);
assert.match(index, /src="seo\.js\?v=20260731-seo"/);
assert.match(index, /src="index-seo\.js\?v=20260731-seo"/);
assert.match(read('index-seo.js'), /'@type': 'WebSite'/);

for (const file of ['recipe.html', 'category.html', 'ingredient.html']) {
    const html = read(file);
    assert.match(html, /meta name="description"/, `${file} description is missing`);
    assert.match(html, /meta name="robots" content="index, follow, max-image-preview:large"/, `${file} index rule is missing`);
    assert.match(html, /src="seo\.js\?v=20260731-seo"/, `${file} SEO runtime is missing`);
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
assert.match(robots, /Sitemap: https:\/\/app\.voronova\.online\/sitemap\.xml/);

const sitemap = read('sitemap.xml');
const locations = Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1]);
assert(locations.length >= 20, 'Sitemap unexpectedly contains too few URLs');
assert.strictEqual(new Set(locations).size, locations.length, 'Sitemap contains duplicate URLs');
assert(locations.includes('https://app.voronova.online/'));
assert(locations.some(url => url.includes('/category.html?cat=')));
assert(locations.some(url => url.includes('/ingredient.html?id=')));
assert(locations.some(url => url.includes('/recipe.html?id=')));
for (const file of technicalPages) {
    assert(!locations.some(url => url.includes('/' + file)), `${file} must not be in sitemap`);
}

assert(fs.statSync(path.join(platform, 'images', 'smartplate-share-telegram-1200x630.jpg')).size > 0);
assert(fs.statSync(path.join(root, 'images', 'smartplate-share-telegram-1200x630.jpg')).size > 0);

const sharePage = fs.readFileSync(path.join(root, 'smartplate', 'index.html'), 'utf8');
assert.match(sharePage, /meta name="robots" content="noindex, follow"/);
assert.match(sharePage, /rel="canonical" href="https:\/\/app\.voronova\.online\/"/);
assert.match(sharePage, /property="og:url" content="https:\/\/voronova\.online\/smartplate\/"/);
assert.match(sharePage, /property="og:image" content="https:\/\/voronova\.online\/images\/smartplate-share-telegram-1200x630\.jpg"/);
assert.match(fs.readFileSync(path.join(root, 'smartplate', 'redirect.js'), 'utf8'), /location\.replace\('https:\/\/app\.voronova\.online\/'\)/);

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
    ingredients: [{ name: '[Нут](hummus): 200 г' }], steps: [{ text: 'Смешать ингредиенты.' }]
});
assert.strictEqual(document.title, 'Тестовый рецепт — рецепт | Умная тарелка');
assert.strictEqual(document.head.querySelector('link[rel="canonical"]').attributes.href, 'https://app.voronova.online/recipe.html?id=test-free-recipe');
const freeSchema = JSON.parse(document.getElementById('smartplate-page-schema').textContent);
assert.strictEqual(freeSchema['@type'], 'Recipe');
assert.deepStrictEqual(Array.from(freeSchema.recipeIngredient), ['Нут: 200 г']);
assert.strictEqual(freeSchema.recipeInstructions[0].text, 'Смешать ингредиенты.');

sandbox.window.SmartPlateSEO.setRecipe({
    id: 'test-pro-recipe', name: 'Платный рецепт', accessLevel: 'pro', photo: null
});
const paidSchema = JSON.parse(document.getElementById('smartplate-page-schema').textContent);
assert.strictEqual(paidSchema['@type'], 'WebPage');
assert.strictEqual(paidSchema.isAccessibleForFree, false);
assert.strictEqual(paidSchema.recipeIngredient, undefined);

console.log(`SmartPlate SEO checks passed: ${locations.length} sitemap URLs`);
