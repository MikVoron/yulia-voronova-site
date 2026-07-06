import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

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

  it('shows the filled plate instead of navigating back after the main add action', () => {
    const recipe = read('recipe.html');
    const addResult = recipe.slice(recipe.indexOf("showToast(r.emoji + (unbalanced"), recipe.indexOf('// ── Balance warning modal'));
    expect(addResult).toContain('openPlate();');
    expect(addResult).not.toContain('history.back()');
  });

  it('asks guests before sending them to login from the add-to-plate action', () => {
    const recipe = read('recipe.html');
    const addBranch = recipe.slice(recipe.indexOf('// ── ADD TO PLATE ──────────────────────────────────────────────────────'), recipe.indexOf('// ── MY PLATE MODAL ────────────────────────────────────────────────────'));
    expect(addBranch).toContain('showGuestLoginModal();');
    expect(addBranch).not.toContain('location.href = Auth._loginUrl();');
    expect(recipe).toContain('id="guest-login-modal"');
    expect(recipe).toContain('onclick="goToGuestLogin()"');
    expect(recipe).toContain('onclick="hideGuestLoginModal()"');
  });

  it('keeps the payment action responsive at the mobile breakpoint', () => {
    const html = read('cabinet.html');
    expect(html).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.sub-card \{ grid-template-columns: 1fr;/);
    expect(html).toContain('.sub-action-btn { min-width: 0; width: 100%; }');
    expect(html).toMatch(/@media \(max-width: 430px\)[\s\S]*?\.pay-plan-grid \{ grid-template-columns: 1fr; \}/);
  });
});
