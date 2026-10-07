import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

  it('keeps only used ingredients known to the static or database catalog', () => {
    const selected = sitemap.selectIndexableIngredients(
      [{ id: 'salmon' }, { id: 'dynamic-herb' }, { id: 'unused-or-unknown' }, { id: 'salmon' }],
      [{ id: 'dynamic-herb' }],
      [{ id: 'salmon' }, { id: 'rice' }]
    );

    expect(selected).toEqual([{ id: 'salmon' }, { id: 'dynamic-herb' }]);
  });

  it('refreshes the sitemap from published recipes and only their known ingredients', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'smartplate-sitemap-'));
    const output = path.join(directory, 'sitemap.xml');
    const db = { query: async sql => {
      if (/SELECT id FROM recipes/.test(sql)) return { rows: [{ id: 'salmon-soup' }] };
      if (/SELECT id FROM categories/.test(sql)) return { rows: [{ id: 'soups' }] };
      if (/SELECT id FROM ingredient_catalog/.test(sql)) return { rows: [{ id: 'dynamic-herb' }] };
      if (/SELECT DISTINCT unnest\(main_ingredients\)/.test(sql)) {
        return { rows: [{ id: 'salmon' }, { id: 'dynamic-herb' }, { id: 'unknown' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    } };
    try {
      const result = await sitemap.refreshSitemap(db, { output });
      const xml = await fs.readFile(output, 'utf8');
      expect(result.urlCount).toBeGreaterThan(5);
      expect(xml).toContain('ingredient.html?id=salmon');
      expect(xml).toContain('ingredient.html?id=dynamic-herb');
      expect(xml).not.toContain('ingredient.html?id=unknown');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
