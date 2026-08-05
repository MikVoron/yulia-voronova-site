import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPlatformSource } from './helpers/platform-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => readPlatformSource(platform, file);

describe('SmartPlate feedback plan 3 contracts', () => {
  it('keeps payment details above the longer early-access explanation', () => {
    const html = read('cabinet.html');
    expect(html.indexOf('class="pay-section"')).toBeLessThan(html.indexOf('id="early-bird-card"'));
    expect(html).toContain('id="pay-success" class="pay-success-card" role="status"');
    expect(html).toContain('id="pay-details-title" tabindex="-1"');
  });

  it('keeps changed inline scripts syntactically valid', () => {
    for (const file of ['cabinet.html', 'index.html', 'category.html', 'recipe.html']) {
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

  it('shows a visible export result and focuses the opened controls', () => {
    const html = read('cabinet.html');
    const js = read('cabinet.js');
    expect(html).toContain('id="hist-export-status" class="hist-export-status" role="status"');
    expect(js).toContain('Настройки выгрузки открыты. Выберите период и формат.');
    expect(js).toContain("revealCabinetTargetIfNeeded(panel, { behavior: 'auto', block: 'center' });");
    expect(js).toContain("if (title) title.focus({ preventScroll: true });");
  });

  it('uses payment-status-specific copy and refreshes the visible subscription card', () => {
    const js = read('cabinet.js');
    expect(js).not.toContain('Если оплата не подтвердилась или возник вопрос');
    expect(js).toContain("payment.status === 'confirmed'");
    expect(js).toContain("payment.status === 'rejected'");
    expect(js).toContain('await loadSubscription();');
    expect(js).toContain('subscriptionPricePreviewHtml()');
  });

  it('rerenders an open journal after plate history synchronization', () => {
    const js = read('cabinet.js');
    expect(js).toMatch(/Plate\.load\(\);[\s\S]{0,500}historyPanel\.classList\.contains\('active'\)[\s\S]{0,120}renderHistory\(\)/);
  });

  it('distinguishes the current plate from recording it in the journal', () => {
    const shared = read('data-v2.js');
    const recipe = read('recipe.html');
    for (const file of ['index.html', 'category.html', 'recipe.html', 'cabinet.js']) {
      expect(read(file)).toContain('Записать тарелку в журнал');
    }
    expect(shared).toContain('После записи тарелка очистится, а блюда появятся в журнале.');
    expect(recipe).toContain('Добавлено в текущую тарелку');
  });

  it('keeps add feedback visible on the recipe instead of opening the plate', () => {
    const recipe = read('recipe-page.js');
    const addResult = recipe.slice(recipe.indexOf('function _executePlateAdd'), recipe.indexOf('// ── Balance warning modal'));
    expect(addResult).toContain('acknowledgeRecipeAdded();');
    expect(addResult).not.toContain('openPlate();');
    expect(addResult).not.toContain('history.back()');
  });

  it('guides an unbalanced plate to missing additions while keeping an opt-out', () => {
    const html = read('recipe.html');
    const js = read('recipe-page.js');
    expect(html).toContain('data-recipe-static-action="guide-to-balance-additions"');
    expect(html).toContain('Добавить без добавок');
    expect(js).toContain('function guideToBalanceAdditions()');
    expect(js).toContain('balWizardSetStep(firstStep);');
    expect(js).toContain("classList.add('is-guided')");
  });

  it('asks guests before sending them to login from the add-to-plate action', () => {
    const recipe = read('recipe.html');
    const addBranch = recipe.slice(recipe.indexOf('// ── ADD TO PLATE ──────────────────────────────────────────────────────'), recipe.indexOf('// ── MY PLATE MODAL ────────────────────────────────────────────────────'));
    expect(addBranch).toContain('showGuestLoginModal();');
    expect(addBranch).not.toContain('location.href = Auth._loginUrl();');
    expect(recipe).toContain('id="guest-login-modal"');
    expect(recipe).toContain('data-recipe-static-action="go-to-guest-login"');
    expect(recipe).toContain('data-recipe-static-action="hide-guest-login"');
  });

  it('keeps category cards showing ratings for locked recipes while hiding guest favorites and preserving one-line time labels', () => {
    const category = read('category.html');
    const ingredient = read('ingredient.html');
    const style = read('style-v4.css');
    const cardBlock = category.slice(category.indexOf('function buildDishCard'), category.indexOf('const dishListEl'));
    const ingredientBlock = ingredient.slice(ingredient.indexOf('function buildDishCard'), ingredient.indexOf('function updateRatingRow'));
    expect(cardBlock).toContain('const canShowFav = Auth.isLoggedIn();');
    expect(cardBlock).toContain('${(!locked && canShowFav) ?');
    expect(cardBlock).toContain('<div class="recipe-card__rating" id="rrow-');
    expect(cardBlock).not.toContain('${!locked ? `<div class="recipe-card__rating"');
    expect(cardBlock).toContain('class="recipe-card__meta-item recipe-card__meta-time"');
    expect(cardBlock).toContain('class="recipe-card__meta-item recipe-card__meta-diff"');
    expect(ingredientBlock).toContain('class="recipe-card__meta-item recipe-card__meta-time"');
    expect(ingredientBlock).toContain('class="recipe-card__meta-item recipe-card__meta-diff"');
    expect(style).toMatch(/\.recipe-card__rating \{\s*display:\s*flex;\s*align-items:\s*center;\s*gap:\s*6px;\s*min-height:\s*16px;/);
    expect(style).toMatch(/\.recipe-card__meta-item \{\s*display:\s*inline-flex;\s*align-items:\s*center;\s*gap:\s*4px;\s*white-space:\s*nowrap;\s*\}/);
    expect(style).toMatch(/\.recipe-card__title \{\s*font-family:[\s\S]*?min-height:\s*calc\(1\.15em \* 4\);/);
  });

  it('keeps the payment action responsive at the mobile breakpoint', () => {
    const html = read('cabinet.html');
    expect(html).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.sub-card \{ grid-template-columns: 1fr;/);
    expect(html).toContain('.sub-action-btn { min-width: 0; width: 100%; }');
    expect(html).toMatch(/@media \(max-width: 430px\)[\s\S]*?\.pay-plan-grid \{ grid-template-columns: 1fr; \}/);
  });
});
