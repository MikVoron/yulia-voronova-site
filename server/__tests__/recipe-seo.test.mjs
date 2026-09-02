import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import recipeSeo from '../src/recipe-seo.js';

const template = '<!doctype html><html><head><title>Recipe</title><meta name="description" content="old"><meta property="og:title" content="old title"><meta property="og:description" content="old description"><meta property="og:image" content="old.webp"><meta name="twitter:title" content="old title"></head><body><main id="page-content"></main></body></html>';
const productionTemplate = fs.readFileSync(path.resolve(import.meta.dirname, '../../platform/recipe.html'), 'utf8');

describe('server recipe SEO document', () => {
  it('renders canonical metadata and public recipe content', () => {
    const html = recipeSeo.renderRecipeDocument(template, {
      id: 'free-pasta', name: 'Паста', quote: 'Описание рецепта', photo: 'images/pasta.webp',
      access_level: 'free', time_min: 25, kcal: 320, protein: 12, fat: 8, carbs: 50,
      ingredients: [{ name: 'Паста: 200 г' }],
      steps: [{ text: 'Сварите пасту.', photo: ['images/pasta-step.webp'] }],
      cat: 'mains', categories: ['mains'], tags: ['растительное'],
    });
    expect(html).toContain('<link rel="canonical" href="https://plate.voronova.online/recipe.html?id=free-pasta">');
    expect(html).toContain('<meta property="og:url" content="https://plate.voronova.online/recipe.html?id=free-pasta">');
    expect(html).toContain('<meta property="og:title" content="Паста — рецепт | Умная тарелка">');
    expect(html).toContain('<meta property="og:image" content="https://plate.voronova.online/images/smartplate-share-v2.jpg">');
    expect(html).toContain('<meta property="og:image:type" content="image/jpeg">');
    expect(html).toContain('<meta name="twitter:image" content="https://plate.voronova.online/images/smartplate-share-v2.jpg">');
    expect(html).toContain('<script id="smartplate-page-schema" type="application/ld+json">');
    expect(html).toContain('<h1>Паста</h1>');
    expect(html).toContain('<img src="https://plate.voronova.online/images/pasta.webp"');
    expect(html).toContain('"image":["https://plate.voronova.online/images/pasta.webp"]');
    expect(html).toContain('Паста: 200 г');
    expect(html).toContain('"@type":"Recipe"');
    expect(html).toContain('"url":"https://plate.voronova.online/recipe.html?id=free-pasta#recipe-step-1"');
    expect(html).toContain('"image":"https://plate.voronova.online/images/pasta-step.webp"');
    expect(html).toContain('"recipeCategory":"Горячее"');
    expect(html).toContain('"keywords":"растительное"');
    expect(html).toContain('<li id="recipe-step-1">Сварите пасту.</li>');
    expect(html).toContain('body{visibility:visible!important}');
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/property="og:description"/g)).toHaveLength(1);
    expect(html.match(/property="og:image"/g)).toHaveLength(1);
  });

  it('uses only available step images and trustworthy category metadata', () => {
    const schema = recipeSeo.buildSchema({
      id: 'vegetable-side', name: 'Овощной гарнир', access_level: 'free',
      cat: 'sides', categories: ['sides', 'mains'], tags: ['растительное', 'без сои'],
      steps: [
        'Нарежьте овощи.',
        { text: 'Запеките до готовности.', photo: ['images/step-2-a.webp', 'images/step-2-b.webp'] },
      ],
    });

    expect(schema.recipeCategory).toBe('Гарниры, Горячее');
    expect(schema.keywords).toBe('растительное, без сои');
    expect(schema.recipeInstructions).toEqual([
      {
        '@type': 'HowToStep',
        name: 'Нарежьте овощи.',
        text: 'Нарежьте овощи.',
        url: 'https://plate.voronova.online/recipe.html?id=vegetable-side#recipe-step-1',
      },
      {
        '@type': 'HowToStep',
        name: 'Запеките до готовности.',
        text: 'Запеките до готовности.',
        url: 'https://plate.voronova.online/recipe.html?id=vegetable-side#recipe-step-2',
        image: 'https://plate.voronova.online/images/step-2-a.webp',
      },
    ]);
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(schema).not.toHaveProperty('recipeCuisine');
    expect(schema).not.toHaveProperty('video');
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

  it('replaces generic metadata in the production template without duplicates', () => {
    const html = recipeSeo.renderRecipeDocument(productionTemplate, {
      id: 'free-pasta', name: 'Паста', quote: 'Описание рецепта', photo: 'images/pasta.webp',
      access_level: 'free', ingredients: [{ name: 'Паста: 200 г' }], steps: [{ text: 'Сварите пасту.' }],
    });
    expect(html).toContain('<title>Паста — рецепт | Умная тарелка</title>');
    expect(html).toContain('<meta property="og:url" content="https://plate.voronova.online/recipe.html?id=free-pasta">');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/property="og:description"/g)).toHaveLength(1);
    expect(html.match(/property="og:url"/g)).toHaveLength(1);
    expect(html.match(/id="smartplate-page-schema"/g)).toHaveLength(1);
    expect(html).not.toContain('Умная тарелка — рецепты с КБЖУ и пошаговым приготовлением</title>');
  });
});
