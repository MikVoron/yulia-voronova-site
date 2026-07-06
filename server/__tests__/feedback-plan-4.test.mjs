import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

describe('SmartPlate feedback plan 4 contracts', () => {
  it('keeps one shared source for recipe-card access state', () => {
    const shared = read('data-v2.js');
    expect(shared).toMatch(/recipeCardAccess\(recipe\)[\s\S]*?this\.recipeAccessLevel\(recipe\)[\s\S]*?this\.canViewRecipe\(recipe\)[\s\S]*?this\.recipeAccessLabel\(recipe\)/);
    expect(shared).toMatch(/isFreeRecipe\(recipe\)[\s\S]*?this\.recipeAccessLevel\(recipe\) === 'free'/);

    for (const file of ['index.html', 'category.html', 'ingredient.html']) {
      const source = read(file);
      expect(source).toContain('Auth.recipeCardAccess(');
      expect(source).not.toContain('!Auth.canViewRecipe(');
    }
  });

  it('labels free and locked cards with text, not color alone', () => {
    const shared = read('data-v2.js');
    const index = read('index.html');
    const category = read('category.html');
    const ingredient = read('ingredient.html');

    expect(shared).toContain("if (level === 'free')  return 'Бесплатно';");
    expect(shared).toContain("actionLabel: locked ? 'Условия доступа' : 'Открыть рецепт'");
    expect(index).toContain('hero-search-access');
    expect(index).toContain('${access.actionLabel} →');
    expect(category).toContain('aria-label="${_name}${escHtml(accessHint)}"');
    expect(ingredient).toContain('aria-label="${_name}${escHtml(accessHint)}"');
  });

  it('does not animate locked recipe cards as if they were available', () => {
    const sharedCss = read('style-v4.css');
    const index = read('index.html');

    expect(sharedCss).toContain('.recipe-card:not(.locked):hover .recipe-card__media img');
    expect(sharedCss).toContain('.featured-card:not(.locked):hover .featured-card-photo img');
    expect(sharedCss).toContain('.cat-card:not(.locked):hover .cat-icon-wrap img');
    expect(sharedCss).not.toMatch(/\.recipe-card\.locked:hover/);
    expect(sharedCss).not.toMatch(/\.featured-card\.locked:hover/);
    expect(index).toContain('.sp-card:not(.locked):hover .sp-card-media img');
    expect(index).toContain('.sp-seasonal:not(.locked):hover .sp-seasonal-media img');
    expect(index).toContain('.sp-new-card:not(.locked) .sp-new-card-media:hover img');
  });

  it('offers an explicit free filter without hiding locked search results by default', () => {
    const shared = read('data-v2.js');
    const category = read('category.html');
    const index = read('index.html');

    expect(category).toContain('data-f="free"');
    expect(category).toContain('if (filters.free)    list = list.filter(d => Auth.isFreeRecipe(d));');
    expect(shared).toContain('if (filters.free)    dishes = dishes.filter(d => Auth.isFreeRecipe(d));');
    expect(index).toContain("const all = (typeof searchRecipes === 'function') ? searchRecipes(q) : [];");
    expect(index).not.toMatch(/searchRecipes\(q\)\.filter\([^\n]*canViewRecipe/);
    expect(category).toContain("const matched = (typeof searchRecipes === 'function') ? searchRecipes(searchQuery) : [];");
  });

  it('keeps primary mobile filters visible and discloses secondary filters explicitly', () => {
    for (const [file, controlsId] of [
      ['index.html', 'home-more-filters'],
      ['category.html', 'category-more-filters'],
    ]) {
      const source = read(file);
      expect(source).toContain('data-f="free"');
      expect(source).toContain('data-f="popular"');
      expect(source).toContain(`aria-controls="${controlsId}"`);
      expect(source).toContain(`class="filter-more" id="${controlsId}"`);
      expect(source).toContain('Ещё фильтры');
      expect(source).toContain('function toggleMoreFilters(btn)');
      expect(source).toContain("btn.setAttribute('aria-expanded', String(open));");
      expect(source).toContain("panel.classList.toggle('is-open', open)");
      expect(source).toContain("classList.toggle('has-active'");
    }
  });

  it('refreshes popular cards after ratings arrive so their stars stay visible', () => {
    const index = read('index.html');

    expect(index).toMatch(/_renderRecommendedInner\(\);[\s\S]*?if \(_popularActive && typeof renderPopular === 'function'\) \{[\s\S]*?renderPopular\(\);/);
    expect(index).toContain('class="sp-card-rating"');
    expect(index).toContain('class="sp-card-rating-stars"');
    expect(index).toContain('${_ratingAvg.toFixed(1)}');
  });

  it('keeps changed inline scripts syntactically valid', () => {
    for (const file of ['index.html', 'category.html', 'ingredient.html']) {
      const html = read(file);
      const scripts = html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
      let index = 0;
      for (const match of scripts) {
        index += 1;
        if (!match[1].trim() || /application\/ld\+json/i.test(match[0])) continue;
        expect(() => new vm.Script(match[1], { filename: file + ':inline-' + index })).not.toThrow();
      }
    }
  });
});
