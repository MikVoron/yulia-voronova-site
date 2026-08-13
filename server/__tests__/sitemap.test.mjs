import { describe, expect, it } from 'vitest';
import sitemap from '../src/sitemap.js';

describe('SmartPlate sitemap', () => {
  it('contains only supplied published recipe IDs and deduplicates URLs', () => {
    const xml = sitemap.buildSitemap({
      recipes: [{ id: 'new-pasta' }, { id: 'new-pasta' }],
      categories: [{ id: 'mains' }],
      ingredients: [{ id: 'pasta' }],
    });

    expect(xml).toContain('recipe.html?id=new-pasta');
    expect(xml).toContain('category.html?cat=mains');
    expect(xml).toContain('ingredient.html?id=pasta');
    expect((xml.match(/recipe.html\?id=new-pasta/g) || []).length).toBe(1);
  });
});
