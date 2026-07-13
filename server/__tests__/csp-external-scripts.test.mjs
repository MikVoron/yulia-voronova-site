import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const platformDir = path.resolve(import.meta.dirname, '../../platform');
const nginxConfig = fs.readFileSync(path.resolve(import.meta.dirname, '../nginx/app.voronova.online'), 'utf8');
const htmlFiles = fs.readdirSync(platformDir).filter(name => name.endsWith('.html'));

describe('SmartPlate CSP script migration', () => {
  it('keeps executable script blocks out of every platform HTML file', () => {
    for (const name of htmlFiles) {
      const html = fs.readFileSync(path.join(platformDir, name), 'utf8');
      expect(html, name).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    }
  });

  it('references existing, syntactically valid first-party scripts', () => {
    for (const name of htmlFiles) {
      const html = fs.readFileSync(path.join(platformDir, name), 'utf8');
      for (const match of html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
        const src = match[1].split('?')[0];
        if (/^(?:https?:)?\/\//i.test(src)) continue;
        const scriptPath = path.resolve(platformDir, src);
        expect(fs.existsSync(scriptPath), `${name} -> ${src}`).toBe(true);
        expect(() => new vm.Script(fs.readFileSync(scriptPath, 'utf8'), { filename: src })).not.toThrow();
      }
    }
  });

  it('blocks inline script elements while observing remaining event attributes', () => {
    expect(nginxConfig).toContain("script-src-elem 'self'");
    expect(nginxConfig).toContain("script-src-attr 'unsafe-inline'");
    expect(nginxConfig).toContain('Content-Security-Policy-Report-Only');
    expect(nginxConfig).toContain("script-src-attr 'none'");
  });

  it('keeps static admin controls free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'admin.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'admin.js'), 'utf8');
    const bindings = [...script.matchAll(/bindStaticAdminHandler\("(?:click|input|change)", "([a-f0-9]{12})"/g)];

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-admin-(?:click|input|change)="[a-f0-9]{12}"/g)).toHaveLength(50);
    expect(bindings).toHaveLength(43);
    expect(new Set(bindings.map(match => match[1])).size).toBe(43);
  });

  it('keeps popup preview controls free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'popup-preview.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'popup-preview.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-preview-action=/g)).toHaveLength(11);
    expect(script).toContain("event.target.closest('[data-preview-action]')");
    expect(script).toContain("action === 'close-backdrop' && event.target === control");
  });

  it('binds shared header and drawer controls without inline handlers', () => {
    const names = ['index.html', 'category.html', 'ingredient.html', 'recipe.html', 'cabinet.html'];
    const forbidden = /onclick="(?:openDrawer|closeDrawer|openPlate|toggleUserMenu|onUserBadgeClick|doLogout)\(/;

    for (const name of names) {
      const html = fs.readFileSync(path.join(platformDir, name), 'utf8');
      expect(html, name).not.toMatch(forbidden);
      expect(html, name).toContain('header-nav.js?v=20260713-csp-handlers');
      expect(html.match(/\sdata-sp-action=/g)?.length || 0, name).toBeGreaterThanOrEqual(6);
    }
  });

  it('binds static recipe filters without inline handlers', () => {
    const pages = [
      ['index.html', 'index-page.js', 18],
      ['category.html', 'category-page.js', 18],
      ['ingredient.html', 'ingredient-page.js', 7]
    ];
    const forbidden = /onclick="(?:toggleFGroup|toggleTagFilter|togglePopular|toggleMoreFilters|clearFilters|pickFilter)\(/;

    for (const [htmlName, scriptName, count] of pages) {
      const html = fs.readFileSync(path.join(platformDir, htmlName), 'utf8');
      const script = fs.readFileSync(path.join(platformDir, scriptName), 'utf8');
      expect(html, htmlName).not.toMatch(forbidden);
      expect(html.match(/\sdata-filter-action=/g), htmlName).toHaveLength(count);
      expect(script, scriptName).toContain("document.querySelectorAll('[data-filter-action]')");
    }
  });
});
