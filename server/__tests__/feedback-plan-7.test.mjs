import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');

const indexHtml = read('index.html');
const style = read('style-v4.css');
const headerNav = read('header-nav.js');
const recipe = read('recipe.html');
const cabinetHtml = read('cabinet.html');
const cabinetJs = read('cabinet.js');
const data = read('data-v2.js');
const chat = read('tawk-chat-modal.js');

describe('SmartPlate feedback plan 7 contracts', () => {
  it('opens one desktop navigation panel by explicit click, not hover', () => {
    expect(headerNav).toContain("nav.addEventListener('click'");
    expect(headerNav).toContain('closeAll(dd);');
    expect(headerNav).toContain("dd.classList.toggle('open', willOpen)");
    expect(style).not.toContain('.sp-nav-dd:hover .sp-nav-panel');
    expect(style).toContain('transition: opacity .28s ease, transform .28s');
  });

  it('removes perpetual decorative motion and automatic content entrances', () => {
    expect(indexHtml).not.toContain('animation: spHow');
    expect(style).not.toContain('animation: fabPulse');
    expect(style).not.toContain('starHint');
    expect(cabinetHtml).not.toContain('animation: ebPulse');
    expect(style).toMatch(/\.anim,\s*\n\.anim-d1,\s*\n\.anim-d2,\s*\n\.anim-d3\s*\{\s*animation:\s*none/);
  });

  it('provides a global reduced-motion fallback without hiding state changes', () => {
    expect(style).toContain('@media (prefers-reduced-motion: reduce)');
    expect(style).toContain('animation-duration: .01ms !important');
    expect(style).toContain('animation-iteration-count: 1 !important');
    expect(style).toContain('transition-duration: .01ms !important');
    expect(style).toContain('scroll-behavior: auto !important');
    expect(style).not.toMatch(/prefers-reduced-motion[\s\S]{0,500}display:\s*none/);
  });

  it('keeps headings and contacts legible and navigation destinations explicit', () => {
    expect(indexHtml).toMatch(/\.sp-sec-title\s*\{[\s\S]*?font-size:\s*15px/);
    expect(indexHtml).toContain('href="index.html" class="sp-brand"');
    expect(indexHtml).toContain('href="mailto:hello@voronova.online"');
    expect(indexHtml).toContain('Email: hello@voronova.online');
    expect(indexHtml).toContain('Подборка нутрициолога');
    expect(indexHtml).not.toContain('function _spTodayRu()');
    expect(style).toContain('.sp-masthead .sp-plate    { grid-column: 3 / 4;');
    expect(cabinetJs).toContain("location.href='category.html'\">К рецептам");
  });

  it('presents text updates as a clearly labelled non-interactive list', () => {
    expect(indexHtml).toContain('id="new-list" role="list" aria-label="Обновления"');
    expect(indexHtml).toContain(".sp-new-list::before {\n\t\t\tcontent: 'Обновления';");
    expect(indexHtml).toContain('<article class="sp-news-item" role="listitem">');
    expect(indexHtml).not.toMatch(/renderNewsListItem[\s\S]{0,900}<a\s/);
  });

  it('adds a Russian chat loading state and a bounded email fallback', () => {
    expect(chat).toContain("loading.textContent = 'Загружаем чат…'");
    expect(chat).toContain('Чат загружается дольше обычного.');
    expect(chat).toContain('Написать на email');
    expect(chat).toContain('}, 12000);');
    expect(chat).toContain("frame.addEventListener('load'");
    expect(chat).toContain("window.clearTimeout(loadTimer)");
  });

  it('aligns balance choices and gives their controls a usable touch target', () => {
    expect(recipe).toContain('.bal-group-toggle-wrap {\n\t\t\tpadding: 12px 0 0;');
    expect(recipe).toContain('.bal-group-body { padding: 0 18px 14px !important;');
    expect(recipe).toMatch(/\.bal-item-select\s*\{[\s\S]*?width:\s*40px;[\s\S]*?height:\s*40px;/);
  });

  it('falls back to initials when a saved avatar cannot load', () => {
    expect(data).toContain("img.addEventListener('error', showFallback, { once: true })");
    expect(data).toContain("fallback.charAt(0).toUpperCase()");
    expect(cabinetJs).toContain("image.addEventListener('error', function ()");
    expect(cabinetJs).toContain("avatar.textContent = fallback.charAt(0).toUpperCase()");
  });

  it('removes repeated trial wording and shortens the subscription summary', () => {
    expect(cabinetJs).toContain("const planText = badge === 'active' ? 'Тариф «Месяц»' : '';");
    expect(cabinetJs).not.toContain("badge === 'trial' ? 'Пробный период'");
    expect(cabinetJs).toContain("/мес. · все рецепты и&nbsp;БЖУ");
    expect(cabinetHtml).toContain('cabinet.js?v=20260704-feedback-plan7');
  });

  it('cache-busts shared UI assets on the audited public surfaces', () => {
    for (const file of ['index.html', 'recipe.html', 'cabinet.html', 'category.html', 'ingredient.html']) {
      const html = read(file);
      expect(html).toContain('style-v4.css?v=20260704-feedback-plan7b');
      expect(html).toContain('data-v2.js?v=20260704-feedback-plan7');
      expect(html).toContain('tawk-chat-modal.js?v=20260704-feedback-plan7');
    }
  });
});
