import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPlatformSource } from './helpers/platform-source.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => readPlatformSource(platform, file);

const indexHtml = read('index.html');
const indexCss = read('index.css');
const recipe = read('recipe.html');
const cabinetHtml = read('cabinet.html');
const cabinetJs = read('cabinet.js');
const data = read('data-v2.js');
const chat = read('tawk-chat-modal.js');

describe('SmartPlate feedback plan 8 regression contracts', () => {
  it('keeps the hero image visibly busy until the image really loads or fails', () => {
    expect(indexHtml).toContain('class="sp-hero-loading-status" role="status">Загружаем фото…');
    expect(indexHtml).toContain("aside.classList.add('is-image-loading')");
    expect(indexHtml).toContain("aside.setAttribute('aria-busy', 'true')");
    expect(indexHtml).toContain("heroImage.addEventListener('load', finishHeroImage, { once: true })");
    expect(indexHtml).toContain("heroImage.addEventListener('error', finishHeroImage, { once: true })");
    expect(indexHtml).toContain("aside.classList.remove('is-image-loading')");
  });

  it('does not use animation alone to explain a slow hero image', () => {
    expect(indexCss).toContain('.sp-hero-aside.is-image-loading .sp-hero-media');
    expect(indexCss).toContain('.sp-hero-loading-status');
    expect(indexCss).toMatch(/prefers-reduced-motion[\s\S]*?\.sp-hero-aside\.is-image-loading \.sp-hero-media[\s\S]*?animation:\s*none/);
  });

  it('scrolls cabinet targets only when they are outside the viewport', () => {
    expect(cabinetJs).toContain('function revealCabinetTargetIfNeeded(target, options)');
    expect(cabinetJs).toContain('if (isVisible) return false;');
    expect(cabinetJs).toContain("behavior: reduceMotion ? 'auto' : (options.behavior || 'smooth')");
    expect(cabinetJs).toContain('revealCabinetTargetIfNeeded(visibleStatus');
    expect(cabinetJs).toContain('revealCabinetTargetIfNeeded(panel');
    expect(cabinetJs).toContain('noteEditor.focus({ preventScroll: true })');
    expect(cabinetHtml).toMatch(/cabinet\.js\?v=[^"']+/);
  });

  it('keeps recipe navigation usable with reduced motion and skips visible targets', () => {
    expect(recipe).toContain('if (rect.top >= 12 && rect.bottom <= window.innerHeight - 12) return;');
    expect(recipe).toContain("banner.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' })");
  });

  it('retains bounded chat loading feedback and the session refresh safeguards', () => {
    expect(chat).toContain("loading.textContent = 'Загружаем чат…'");
    expect(chat).toContain('Чат загружается дольше обычного.');
    expect(chat).toContain('}, 12000);');
    expect(data).toContain('if (this._refreshInFlight) return this._refreshInFlight;');
    expect(data).toContain("if (res.status === 401) {");
    expect(data).toContain('await this._sleep(500);');
    expect(data).toContain('// Не делаем logout — пусть checkAccess решит что показать');
  });
});
