import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { renderHomeDocument, loadHomeData, renderIngredientLinks } = require('../src/home-seo');
const template = fs.readFileSync('../platform/index.html', 'utf8');

describe('server-visible home navigation', () => {
  it('renders published links inside existing components and escapes content', () => {
    const html = renderHomeDocument(template, {
      categories: [{ id: 'soups', name: 'Супы & бульоны', description: '<script>bad</script>', recipe_count: 3 }],
      ingredients: [{ id: 'lentils', name: 'Чечевица & нут' }],
      popular: [{ id: 'rated', name: 'Суп <1>', photo: 'images/recipes/soup\\cover.webp',
        time_min: 20, kcal: 100, access_level: 'trial', rating: 4.5, review_count: 2 }],
    });
    expect(html).toContain('href="category.html?cat=soups"');
    expect(html).toContain('href="ingredient.html?id=lentils"');
    expect(html).toContain('href="recipe.html?id=rated"');
    expect(html).toContain('Суп &lt;1&gt;');
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).toContain('https://voronova.online/images/recipes/soup/cover.webp');
    expect(html).toContain('Пробный');
    expect(html).toContain('<link rel="canonical" href="https://plate.voronova.online/">');
    expect(html).not.toContain('<script>bad</script>');
    expect(html).not.toContain('ingredients:');
  });

  it('reads a new snapshot on the next request and selects published data only', async () => {
    let name = 'Первый';
    const queries = [];
    const db = { query: async sql => {
      queries.push(sql);
      if (sql.includes('AVG(v.stars)')) return { rows: [{ id: 'rated', name }] };
      if (sql.includes('unnest(main_ingredients)')) return { rows: [{ id: 'lentils' }, { id: 'unknown' }] };
      if (sql.includes('ingredient_catalog')) return { rows: [{ id: 'lentils', name: 'Чечевица' }] };
      return { rows: [{ id: 'soups', name: 'Супы' }] };
    } };
    const first = await loadHomeData(db);
    name = 'Второй';
    const second = await loadHomeData(db);
    expect(first.popular[0].name).toBe('Первый');
    expect(second.popular[0].name).toBe('Второй');
    expect(second.ingredients).toEqual([{ id: 'lentils', name: 'Чечевица' }]);
    expect(queries.filter(s => s.includes('AVG(v.stars)'))).toHaveLength(2);
    expect(queries.find(s => s.includes('AVG(v.stars)'))).toContain('r.is_published=true');
    expect(queries.find(s => s.includes('COUNT(r.id)'))).toContain('r.is_published=true');
    const freeQuery = queries.find(s => s.includes('array_position'));
    expect(freeQuery).toContain('is_published = true');
    expect(freeQuery).toContain("COALESCE(NULLIF(access_level, ''), CASE WHEN is_free THEN 'free' ELSE 'pro' END) = 'free'");
    expect(freeQuery).toContain('LIMIT 3');
  });

  it('adds free cards to the existing carousel with crawlable links and escaped copy', () => {
    const html = renderHomeDocument('<div id="approved-free-recipes" class="approved-recipe-grid"></div>', {
      ingredients: [], categories: [], popular: [],
      freeRecipes: [{ id: 'borscht', cat: 'soups', name: 'Борщ & фасоль', time_min: 40, difficulty: 'easy', kcal: 123 }],
    });
    expect(html).toContain('href="recipe.html?id=borscht&amp;from=soups"');
    expect(html).toContain('Борщ &amp; фасоль');
    expect(html).toContain('40 мин · Легкая');
    expect(html).toContain('123 ккал / порция');
  });

  it('fills the existing ingredient menu without adding another navigation section', () => {
    const input = '<div class="sp-nav-panel sp-nav-panel--ingredients" role="menu"></div>';
    const output = renderIngredientLinks(input, [{ id: 'rice', name: 'Рис' }]);
    expect(output).toContain('href="ingredient.html?id=rice"');
    expect(renderIngredientLinks(output, [{ id: 'rice', name: 'Рис' }])).toBe(output);
  });
});
