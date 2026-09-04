import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import ingredientSeo from '../src/ingredient-seo.js';

const template = '<!doctype html><html><head><title>Рецепты по ингредиенту — Умная тарелка</title><meta name="description" content="old"><meta property="og:title" content="old title"><meta property="og:description" content="old description"></head><body></body></html>';
const productionTemplate = fs.readFileSync(path.resolve(import.meta.dirname, '../../platform/ingredient.html'), 'utf8');

describe('server ingredient SEO document', () => {
  it('renders unique metadata and an ItemList for an ingredient collection', () => {
    const html = ingredientSeo.renderIngredientDocument(template, { id: 'salmon', name: 'Лосось' }, [
      { id: 'salmon-soup', name: 'Суп с лососем' },
    ]);
    expect(html).toContain('<title>Рецепты с ингредиентом «Лосось» | Умная тарелка</title>');
    expect(html).toContain('<meta name="description" content="Подборка полезных рецептов с ингредиентом «Лосось» и расчётом КБЖУ.">');
    expect(html).toContain('<link rel="canonical" href="https://plate.voronova.online/ingredient.html?id=salmon">');
    expect(html).toContain('<meta property="og:url" content="https://plate.voronova.online/ingredient.html?id=salmon">');
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).toContain('"url":"https://plate.voronova.online/recipe.html?id=salmon-soup"');
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/property="og:description"/g)).toHaveLength(1);
  });

  it('uses the same ingredient names as the frontend catalogue', async () => {
    await expect(ingredientSeo.getStaticIngredient('mung-beans')).resolves.toEqual({ id: 'mung-beans', name: 'Маш' });
  });

  it('replaces generic metadata in the production template without duplicates', () => {
    const html = ingredientSeo.renderIngredientDocument(productionTemplate, { id: 'rice', name: 'Рис' }, []);
    expect(html).toContain('<title>Рецепты с ингредиентом «Рис» | Умная тарелка</title>');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/id="smartplate-page-schema"/g)).toHaveLength(1);
  });
});
