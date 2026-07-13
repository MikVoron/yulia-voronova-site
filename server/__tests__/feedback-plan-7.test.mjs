import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPlatformSource } from './helpers/platform-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => readPlatformSource(platform, file);

const indexHtml = read('index.html');
const style = read('style-v4.css');
const headerNav = read('header-nav.js');
const recipe = read('recipe.html');
const cabinetHtml = read('cabinet.html');
const cabinetJs = read('cabinet.js');
const data = read('data-v2.js');
const chat = read('tawk-chat-modal.js');

describe('SmartPlate feedback plan 7 contracts', () => {
  it('keeps the mobile drawer inside the dynamic viewport without a leading ingredient divider', () => {
    expect(style).toContain('height: 100dvh; max-height: 100dvh;');
    expect(style).toContain('flex: 1 1 auto; min-height: 0;');
    expect(style).toContain('.sp-drawer-content .sp-drawer-subhead:first-child { margin-top: 8px; border-top: 0; }');
    expect(indexHtml).toContain('height: 100dvh;');
    expect(indexHtml).toMatch(/\.sp-drawer-content \.sp-drawer-subhead:first-child\s*\{[\s\S]*?border-top:\s*0/);
  });

  it('aligns the ingredients and step controls with the section rules', () => {
    expect(style).toMatch(/\.recipe-section-head,[\s\S]*?\.steps-head \{ display: flex; align-items: flex-end; justify-content: space-between;/);
    expect(style).toMatch(/\.recipe-main \.recipe-section-head \.v-section-title,[\s\S]*?\.recipe-main \.steps-head \.v-section-title \{ margin-top: 0 !important; margin-bottom: 0 !important; \}/);
    expect(recipe).toContain('class="recipe-section-head recipe-ingredients-head"');
    expect(recipe).toContain('class="recipe-section-actions"');
    expect(recipe).toMatch(/style-v4\.css\?v=[^"']+/);
  });

  it('optically aligns balance checkboxes with linked item labels', () => {
    expect(recipe).toMatch(/\.bal-item-select\s*\{[\s\S]*?transform:\s*translateY\(3px\);/);
  });

  it('opens one desktop navigation panel by hover or explicit click', () => {
    expect(headerNav).toContain("nav.addEventListener('click'");
    expect(headerNav).toContain('closeAll(dd);');
    expect(headerNav).toContain("dd.classList.toggle('open', willOpen)");
    expect(headerNav).toContain("nav.addEventListener('pointerover'");
    expect(headerNav).toContain("nav.addEventListener('pointerout'");
    expect(style).toContain('transition: opacity .28s ease, transform .28s');
  });

  it('removes perpetual decorative motion and automatic content entrances', () => {
    expect(indexHtml).toContain('animation: spHowChipOnce');
    expect(indexHtml).toContain('animation: spHowBarOnce');
    expect(indexHtml).toContain('observer.unobserve(entry.target)');
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
    expect(indexHtml).toContain("today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })");
    expect(indexHtml).toContain("today.toLocaleDateString('ru-RU', { weekday: 'long' })");
    expect(style).toContain('.sp-masthead .sp-plate    { grid-column: 1 / 2;');
    expect(cabinetJs).toContain('data-cabinet-action="browse-recipes">Выбрать рецепт');
    expect(cabinetJs).toContain("location.href = 'category.html'");
  });

  it('presents text updates as a non-interactive list without an extra label', () => {
    expect(indexHtml).toContain('id="new-list" role="list"');
    expect(indexHtml).not.toMatch(/id="new-list"[^>]*aria-label=/);
    expect(indexHtml).not.toMatch(/sp-new-list::before/);
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
    expect(recipe).toMatch(/\.bal-group-toggle-wrap\s*\{\s*padding:\s*12px 0 0;/);
    expect(recipe).toMatch(/\.bal-group-body\s*\{\s*padding:\s*0 18px 14px !important;/);
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
    expect(cabinetJs).toContain("Активна до <b>");
    expect(cabinetJs).toContain("+ planHtml");
    expect(cabinetJs).toContain("+ headlineHtml");
    expect(cabinetJs).not.toContain("badge === 'trial' ? 'Пробный период'");
    expect(cabinetJs).toContain("/мес. · все рецепты и&nbsp;БЖУ");
    expect(cabinetHtml).toMatch(/cabinet\.js\?v=[^"']+/);
  });

  it('uses the approved support copy for a repeated payment', () => {
    expect(cabinetJs).toContain("Если нужна помощь с повторной оплатой — напишите ");
    expect(cabinetJs).toContain("— напишите в '");
    expect(cabinetJs).toContain('>чат Отдела заботы</a>');
    expect(cabinetJs).toContain(" + ' или на ' + emailLink + '.'");
  });

  it('moves account settings into a sixth tab without mobile horizontal scrolling', () => {
    expect(cabinetHtml).toContain('data-tab="settings" href="cabinet.html?tab=settings"');
    expect(cabinetHtml).toContain('class="cab-tab-panel" id="panel-settings"');
    expect(cabinetHtml).toContain('.cab-tabs { flex-wrap: wrap; overflow-x: visible; }');
    expect(cabinetHtml).toContain('flex: 1 1 30%; justify-content: center;');
    expect(cabinetHtml).toContain('<details class="early-bird-disclosure">');
    expect(cabinetJs).toContain("if (!payments.length) { el.innerHTML = ''; return; }");
  });

  it('cache-busts shared UI assets on the audited public surfaces', () => {
    for (const file of ['index.html', 'recipe.html', 'cabinet.html', 'category.html', 'ingredient.html']) {
      const html = read(file);
      expect(html).toMatch(/style-v4\.css\?v=[^"']+/);
      expect(html).toMatch(/data-v2\.js\?v=[^"']+/);
      expect(html).toMatch(/tawk-chat-modal\.js\?v=[^"']+/);
    }
  });
});
