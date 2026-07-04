import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

describe('SmartPlate feedback plan 5 contracts', () => {
  it('keeps the ready sound always on without an off switch', () => {
    const recipe = read('recipe.html');
    const css = read('style-v4.css');

    expect(recipe).toContain("balanceReady: ['sounds/plate-is-ready.mp3', 'platform/sounds/plate-is-ready.mp3']");
    expect(recipe).toContain('function playBalanceSound()');
    expect(recipe).toContain('playBalanceSound();');
    expect(recipe).toContain('new Audio(paths[0])');
    expect(fs.existsSync(path.join(platform, 'sounds/plate-is-ready.mp3'))).toBe(true);
    expect(recipe).not.toMatch(/toggleBalanceSound|balanceSoundEnabled|_soundEnabled/);
    expect(recipe).not.toMatch(/bal-(?:mini|banner)-sound/);
    expect(css).not.toMatch(/bal-banner-sound/);
  });

  it('keeps variant selection and internal recipe navigation as separate controls', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain('class="bal-item-select"');
    expect(recipe).toContain('aria-pressed="${isChecked ? \'true\' : \'false\'}"');
    expect(recipe).toContain('class="bal-item-recipe-link bal-item-text"');
    expect(recipe).toContain('<span class="bal-item-name">${escHtml(item.name)}${amountHtml}</span>');
    expect(recipe).not.toMatch(/<button class="bal-item[^`]*<a class="bal-item-recipe-link"/);
    expect(recipe).not.toMatch(/bal-item-recipe-link[^>]*target="_blank"/);
  });

  it('lets expanded recipe content grow without a nested vertical scrollbar', () => {
    const recipe = read('recipe.html');
    const css = read('style-v4.css');

    expect(recipe).toMatch(/\.recipe-sidebar\s*\{[\s\S]*?max-height:\s*none\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/);
    expect(css).toContain('.recipe-sidebar { position: sticky; top: 96px; max-height: none; overflow: visible; }');
  });

  it('reserves stable image geometry and keeps desktop images full-width', () => {
    const recipe = read('recipe.html');
    const css = read('style-v4.css');

    expect(recipe).toContain('function markRecipeImageError(image)');
    expect(recipe).toContain('class="recipe-ingredients-photo"');
    expect(recipe).toContain('decoding="async" onerror="markRecipeImageError(this)"');
    expect(css).toMatch(/\.step-photo-wrap,[\s\S]*?\.recipe-ingredients-photo\s*\{[\s\S]*?width:\s*100%;\s*aspect-ratio:\s*4\/3/);
    expect(css).toMatch(/\.step-photo-carousel\s*\{[^}]*aspect-ratio:\s*4\/3/);
    expect(css).toMatch(/\.step-photo-carousel \.step-photo-img\s*\{[^}]*width:\s*100%;\s*height:\s*100%/);
  });

  it('uses one stable reviews target and an explicit review-form action', () => {
    const recipe = read('recipe.html');
    const css = read('style-v4.css');

    expect(recipe).toContain('Отзывы и оценка');
    expect(recipe).toContain('function scrollToReviews()');
    expect(recipe).toContain('function scrollToReviewForm()');
    expect(recipe).toContain('heading.focus({ preventScroll: true })');
    expect(recipe).toContain('field.focus({ preventScroll: true })');
    expect(recipe).toMatch(/review-form-stars[\s\S]*?join\(''\)\}[\s\S]*?<\/div>[\s\S]*?<textarea id="review-text"/);
    expect(recipe).toMatch(/<section class="reviews-section"[\s\S]*?<div id="review-form-wrap">[\s\S]*?<\/section>/);
    expect(recipe).not.toContain('function scrollToStars()');
    expect(recipe).toContain('class="star review-star" type="button"');
    expect(recipe).toContain('aria-label="Оценка ${i} из 5" aria-pressed="false"');
    expect(css).toMatch(/\.reviews-section\s*\{[^}]*scroll-margin-top:\s*180px/);
  });

  it('offers a visible reset after replacing an ingredient', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain('aria-label="Вернуть исходный ингредиент"');
    expect(recipe).toContain('<span>Вернуть исходный ингредиент</span>');
    expect(recipe).toContain("window.revertSwap = function(i)");
  });

  it('renders an embedded player, a safe known-service fallback, or an unavailable state', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain("if (parsed.protocol !== 'https:') return null;");
    expect(recipe).toContain('iframe.title = \'Видеорецепт\'');
    expect(recipe).toContain("iframe.loading = 'lazy'");
    expect(recipe).toContain('function showVideoFallback(frame, url)');
    expect(recipe).toContain('rel="noopener noreferrer"');
    expect(recipe).toContain('external-link-icon');
    expect(recipe).toContain('function showVideoUnavailable(frame)');
    expect(recipe).toContain('Видео временно недоступно');
  });

  it('provides one keyboard-accessible return-to-top control', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain('id="recipe-back-to-top"');
    expect(recipe).toContain('function scrollRecipeToTop()');
    expect(recipe).toContain('function scrollRecipeElementIntoView(element, block)');
    expect(recipe).toContain("root.style.scrollBehavior = 'auto'");
    expect(recipe).toContain('window.scrollTo(0, 0)');
    expect(recipe).toContain('backToTop.hidden = scrollY < 600');
  });

  it('keeps recipe actions keyboard-operable', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain('class="card-fav-btn${isFav ? \' active\' : \'\'}" id="recipe-fav-btn" type="button"');
    expect(recipe).toContain('aria-label="${isFav ? \'Убрать рецепт из избранного\' : \'Добавить рецепт в избранное\'}"');
    expect(recipe).toContain('class="star r-star${i <= 0 ? \' filled\' : \'\'}" type="button"');
    expect(recipe).toContain('class="bal-item-select" type="button"');
  });

  it('preserves the single existing recipe-access gate', () => {
    const recipe = read('recipe.html');

    expect(recipe).toContain('} else if (!Auth.canViewRecipe(r)) {');
    expect(recipe).toContain('renderRecipePreview(r);');
    expect(recipe).not.toMatch(/accessLevel\s*===|\.free\s*===\s*true/);
  });

  it('keeps recipe inline scripts syntactically valid', () => {
    const html = read('recipe.html');
    const scripts = html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi);
    let index = 0;
    for (const match of scripts) {
      index += 1;
      if (!match[1].trim() || /application\/ld\+json/i.test(match[0])) continue;
      expect(() => new vm.Script(match[1], { filename: 'recipe.html:inline-' + index })).not.toThrow();
    }
  });
});
