import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import copy from '../src/collection-copy.js';
import categorySeo from '../src/category-seo.js';
import ingredientSeo from '../src/ingredient-seo.js';

const platform = path.resolve(import.meta.dirname, '../../platform');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(platform, 'collection-copy.js'), 'utf8'), sandbox);
const browserCopy = sandbox.window.SmartPlateCollectionCopy;
const template = '<html><head><title>Old</title></head><body><div class="cat-hero" id="cat-hero"></div></body></html>';

describe('shared collection copy', () => {
  it('keeps category headings short and aligns browser/server metadata and intro', () => {
    for (const [id, entry] of Object.entries(copy.categories)) {
      const category = { id, name: entry.name };
      const expected = copy.category(category);
      expect(browserCopy.category(category)).toEqual(expected);
      const html = categorySeo.renderCategoryDocument(template, category, [{ id: 'example', name: 'Пример' }]);
      expect(html).toContain('<title>' + expected.title + '</title>');
      expect(html).toContain('<h1 class="cat-hero-name">' + category.name + '</h1>');
      expect(html).toContain('<p class="collection-intro">' + expected.intro + '</p>');
      const schema = JSON.parse(html.match(/type="application\/ld\+json">([^<]+)/)[1]);
      expect(schema.name).toBe(category.name);
      expect(schema.description).toBe(expected.intro);
    }
    expect(copy.category({ id: 'soups', name: 'Супы' }).title).toBe('Рецепты супов с КБЖУ — Умная тарелка');
  });

  it('covers static and current additional ingredients with natural headings in both renderers', async () => {
    const ingredients = (await ingredientSeo.listStaticIngredients()).concat([
      { id: 'cod', name: 'Треска' }, { id: 'eggplant', name: 'Баклажаны' }
    ]);
    for (const ingredient of ingredients) {
      const expected = copy.ingredient(ingredient);
      expect(expected.heading).not.toContain('с ингредиентом');
      expect(browserCopy.ingredient(ingredient)).toEqual(expected);
      const html = ingredientSeo.renderIngredientDocument(template, ingredient, []);
      expect(html).toContain('<title>' + expected.title + '</title>');
      expect(html).toContain('<h1 class="cat-hero-name">' + expected.heading + '</h1>');
      expect(html).toContain('<p class="collection-intro">' + expected.intro + '</p>');
    }
    expect(copy.ingredient({ id: 'red-lentils', name: 'Красная чечевица' }).heading).toBe('Рецепты с красной чечевицей');
  });

  it('escapes new catalogue names and keeps search results separate from editorial sections', () => {
    const ingredient = ingredientSeo.renderIngredientDocument(template, { id: 'new-item', name: '<img onerror="bad">' }, []);
    expect(ingredient).not.toContain('<img onerror');
    expect(ingredient).toContain('&lt;img onerror=&quot;bad&quot;&gt;');
    const search = categorySeo.renderCategoryDocument(template, null, [], { search: true });
    expect(search).toContain('<title>Поиск по рецептам | Умная тарелка</title>');
    expect(search).toContain('noindex, follow');
    expect(search).not.toContain('collection-intro');
    expect(copy.ingredient({ id: 'constructor', name: 'Новый' }).heading).toBe('Рецепты с ингредиентом «Новый»');
  });
});
