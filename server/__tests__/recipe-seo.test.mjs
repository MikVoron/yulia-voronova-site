import { describe, expect, it } from 'vitest';
import recipeSeo from '../src/recipe-seo.js';

const template = '<!doctype html><html><head><title>Recipe</title><meta name="description" content="old"></head><body><main id="page-content"></main></body></html>';

describe('server recipe SEO document', () => {
  it('renders canonical metadata and public recipe content', () => {
    const html = recipeSeo.renderRecipeDocument(template, {
      id: 'free-pasta', name: 'Паста', quote: 'Описание рецепта', photo: 'images/pasta.webp',
      access_level: 'free', time_min: 25, kcal: 320, protein: 12, fat: 8, carbs: 50,
      ingredients: [{ name: 'Паста: 200 г' }], steps: [{ text: 'Сварите пасту.' }], tags: ['растительное'],
    });
    expect(html).toContain('<link rel="canonical" href="https://app.voronova.online/recipe.html?id=free-pasta">');
    expect(html).toContain('<h1>Паста</h1>');
    expect(html).toContain('Паста: 200 г');
    expect(html).toContain('"@type":"Recipe"');
    expect(html).toContain('body{visibility:visible!important}');
  });

  it('does not expose paid recipe instructions', () => {
    const html = recipeSeo.renderRecipeDocument(template, {
      id: 'paid-pasta', name: 'Платная паста', access_level: 'pro',
      ingredients: [{ name: 'Секретный ингредиент' }], steps: [{ text: 'Секретный шаг' }],
    });
    expect(html).not.toContain('Секретный ингредиент');
    expect(html).not.toContain('Секретный шаг');
    expect(html).toContain('"@type":"WebPage"');
  });
});
