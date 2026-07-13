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
      ['category.html', 'category-page.js', 18]
    ];
    const forbidden = /onclick="(?:toggleFGroup|toggleTagFilter|togglePopular|toggleMoreFilters|clearFilters|pickFilter)\(/;

    for (const [htmlName, scriptName, count] of pages) {
      const html = fs.readFileSync(path.join(platformDir, htmlName), 'utf8');
      const script = fs.readFileSync(path.join(platformDir, scriptName), 'utf8');
      expect(html, htmlName).not.toMatch(forbidden);
      expect(html.match(/\sdata-filter-action=/g), htmlName).toHaveLength(count);
      expect(script, scriptName).toContain("document.querySelectorAll('[data-filter-action]')");
    }

    const ingredientHtml = fs.readFileSync(path.join(platformDir, 'ingredient.html'), 'utf8');
    expect(ingredientHtml).not.toContain('data-filter-action');
    expect(ingredientHtml).not.toContain('id="fg-time-drop"');
    expect(ingredientHtml).not.toContain('id="fg-diff-drop"');
  });

  it('binds static plate and comments modal controls without inline handlers', () => {
    const pages = [
      ['index.html', 'index-page.js', 3],
      ['category.html', 'category-page.js', 4],
      ['ingredient.html', 'ingredient-page.js', 4],
      ['recipe.html', 'recipe-page.js', 2],
      ['cabinet.html', 'cabinet.js', 2]
    ];
    const forbidden = /onclick="(?:closeCommentsIfOutside|closeComments|closePlateIfOutside|closePlate|savePlate)\(/;

    for (const [htmlName, scriptName, count] of pages) {
      const html = fs.readFileSync(path.join(platformDir, htmlName), 'utf8');
      const script = fs.readFileSync(path.join(platformDir, scriptName), 'utf8');
      expect(html, htmlName).not.toMatch(forbidden);
      expect(html.match(/\sdata-modal-action=/g), htmlName).toHaveLength(count);
      expect(script, scriptName).toContain("document.querySelectorAll('[data-modal-action]')");
    }
  });

  it('keeps the homepage free of static inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'index.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'index-page.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-index-action=/g)).toHaveLength(2);
    expect(html).toContain('data-index-submit="hero-search"');
    expect(html).toContain('index-page.js?v=20260713-csp-template-actions');
    expect(script).toContain("document.querySelectorAll('[data-index-action]')");
    expect(script).toContain("heroSearchForm.addEventListener('submit'");
    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script).toContain('data-index-template-action="toggle-mobile-news"');
    expect(script).toContain('data-index-template-action="browse-recipes"');
    expect(script).toContain('data-index-template-input="plate-weight"');
    expect(script).toContain("image.hasAttribute('data-index-avatar-fallback')");
    expect(script).toContain("image.dataset.indexImageFallback === 'hide'");
  });

  it('keeps the recipe page free of static inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'recipe.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'recipe-page.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-recipe-static-action=/g)).toHaveLength(15);
    expect(html).toContain('recipe-page.js?v=20260713-csp-recipe-static');
    expect(script).toContain("document.querySelectorAll('[data-recipe-static-action]')");
    expect(script).toContain("control.addEventListener('keydown', handleMiniStatusKey)");
  });

  it('keeps the recipe editor free of static inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'recipe-editor.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'recipe-editor.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-editor-static-action=/g)).toHaveLength(19);
    expect(html.match(/\sdata-addon-group=/g)).toHaveLength(4);
    expect(html).toContain('recipe-editor.js?v=20260713-csp-template-actions');
    expect(script).toContain("document.querySelectorAll('[data-editor-static-action]')");
    expect(script).toContain("addAddItem(control.dataset.addonGroup || '')");
    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script.match(/data-editor-template-action="remove-item"/g)).toHaveLength(3);
    expect(script).toContain('data-editor-template-change="select-nutr-alt"');
    expect(script).toContain('data-editor-preview-fallback="');
    expect(script).toContain("image.hasAttribute('data-editor-preview-fallback')");
  });

  it('keeps the cabinet free of static inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'cabinet.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'cabinet.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain('cabinet.js?v=20260713-csp-template-actions');
    expect(html.match(/\sdata-cabinet-action=/g)).toHaveLength(19);
    expect(html.match(/\sdata-cabinet-change=/g)).toHaveLength(4);
    expect(script).toContain("else if (action === 'open-avatar-picker') openAvatarPicker()");
    expect(script).toContain("document.querySelectorAll('[data-cabinet-change]')");
    expect(script).toContain("control.addEventListener('change', scheduleDietarySave)");
    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script).toContain('data-cabinet-action="hide-payment-notice"');
    expect(script).toContain('data-cabinet-action="reload-page"');
    expect(script).toContain('data-cabinet-action="browse-recipes"');
    expect(script).toContain('data-cabinet-action="toggle-plate-shop-mode"');
    expect(script).toContain("else if (action === 'save-plate') savePlateCabinet()");
  });

  it('keeps category JavaScript templates free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'category.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'category-page.js'), 'utf8');

    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain('category-page.js?v=20260713-csp-template-actions');
    expect(script).toContain("else if (action === 'submit-comment')");
    expect(script).toContain("else if (action === 'save-plate')");
    expect(script).toContain("image.hasAttribute('data-review-avatar-fallback')");
  });

  it('keeps shared retry templates free of inline handlers and cache-busts every consumer', () => {
    const script = fs.readFileSync(path.join(platformDir, 'data-v2.js'), 'utf8');
    const consumers = [
      'index.html', 'ingredient.html', 'login.html', 'category.html', 'auth-callback.html',
      'recipe-editor.html', 'recipe.html', 'cabinet.html', 'admin.html'
    ];

    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script.match(/data-shared-action="reload"/g)).toHaveLength(3);
    expect(script).toContain("event.target.closest('[data-shared-action=\"reload\"]')");
    consumers.forEach(fileName => {
      const html = fs.readFileSync(path.join(platformDir, fileName), 'utf8');
      expect(html, fileName).toContain('data-v2.js?v=20260713-csp-template-actions');
    });
  });
});
