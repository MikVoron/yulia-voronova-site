import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const platformDir = path.resolve(import.meta.dirname, '../../platform');
const nginxConfig = fs.readFileSync(path.resolve(import.meta.dirname, '../nginx/plate.voronova.online'), 'utf8');
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

  it('allows approved analytics origins in addition to first-party scripts and blocks event attributes', () => {
    const enforced = nginxConfig.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1] || '';
    expect(enforced).toContain("script-src 'self' https://mc.yandex.ru https://mc.yandex.com https://mc.yandex.md https://yastatic.net https://www.googletagmanager.com;");
    expect(enforced).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(enforced).toContain("script-src-elem 'self' https://mc.yandex.ru https://mc.yandex.com https://mc.yandex.md https://yastatic.net https://www.googletagmanager.com;");
    expect(enforced).toContain("script-src-attr 'none'");
    expect(enforced).toContain("connect-src 'self' https://api.voronova.online https://mc.yandex.ru https://mc.yandex.com https://mc.yandex.md wss://mc.yandex.com wss://mc.yandex.md https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.google.com;");
    expect(enforced).toContain('frame-ancestors https://metrika.yandex.ru https://metrica.yandex.ru https://metr.yandex.ru');
    expect(enforced).not.toContain("frame-ancestors 'none'");
    expect(nginxConfig).not.toContain('add_header X-Frame-Options DENY');
    expect(nginxConfig).toContain('Content-Security-Policy-Report-Only');
  });

  it('boots the SmartPlate Metrica counter without e-commerce or personal data parameters', () => {
    const metrika = fs.readFileSync(path.join(platformDir, 'metrika.js'), 'utf8');
    expect(metrika).toContain('var counterId = 111434385;');
    expect(metrika).toContain("window.ym(counterId, 'init'");
    expect(metrika).toContain('webvisor: true');
    expect(metrika).not.toContain('ecommerce');
  });

  it('boots the SmartPlate GA4 tag without personal data parameters', () => {
    const analytics = fs.readFileSync(path.join(platformDir, 'google-analytics.js'), 'utf8');
    expect(analytics).toContain("var measurementId = 'G-L6V1GTCEHS';");
    expect(analytics).toContain("window.gtag('config', measurementId, {");
    expect(analytics).toContain('allow_google_signals: false');
    expect(analytics).toContain("script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;");
    expect(analytics).not.toContain('user_id');
    expect(analytics).not.toContain('setUserProperties');
  });

  it('keeps the OAuth callback independent of inline styles', () => {
    const html = fs.readFileSync(path.join(platformDir, 'auth-callback.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'auth-callback.js'), 'utf8');
    expect(html).toContain('auth-callback.css?v=20260805-motion-accessibility');
    expect(html).not.toMatch(/<style\b|\sstyle\s*=/i);
    expect(script).not.toMatch(/\.style\.|\sstyle\s*=/i);
    expect(script).toContain("err.classList.add('is-visible')");
  });

  it('keeps the personal data policy independent of inline styles', () => {
    const html = fs.readFileSync(path.join(platformDir, 'personal-data-processing-policy.html'), 'utf8');
    expect(html).toContain('personal-data-processing-policy.css?v=20260713-csp-styles');
    expect(html).not.toMatch(/<style\b|\sstyle\s*=/i);
  });

  it('keeps the login flow independent of inline styles', () => {
    const html = fs.readFileSync(path.join(platformDir, 'login.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'login.js'), 'utf8');
    expect(html).toMatch(/login\.css\?v=[^"']+/);
    expect(html).not.toMatch(/<style\b|\sstyle\s*=/i);
    expect(script).not.toMatch(/\.style\.|\sstyle\s*=/i);
    expect(script).toContain("step2.classList.remove('is-hidden')");
    expect(script).toContain("success.classList.add('is-visible')");
    expect(script).toContain("block.classList.add('has-error')");
  });

  it('keeps homepage static markup and shared plate counts independent of inline styles', () => {
    const html = fs.readFileSync(path.join(platformDir, 'index.html'), 'utf8');
    const criticalCss = fs.readFileSync(path.join(platformDir, 'index-critical.css'), 'utf8');
    const css = fs.readFileSync(path.join(platformDir, 'index.css'), 'utf8');
    const data = fs.readFileSync(path.join(platformDir, 'data-v2.js'), 'utf8');
    const plateConsumers = ['index.html', 'recipe.html', 'category.html', 'ingredient.html', 'cabinet.html'];

    expect(html).toContain('index-critical.css?v=20260713-csp-static');
    expect(html).toMatch(/index\.css\?v=[^"'\s]+/);
    expect(html).not.toMatch(/<style\b|\sstyle\s*=/i);
    expect(criticalCss).toContain('visibility: hidden;');
    expect(css).toContain('.index-is-hidden');
    expect(css).toContain('.v-logo-brand--inverse');
    expect(data).toContain('el.hidden = n <= 0;');
    expect(data).not.toContain("el.style.display = n > 0 ? 'flex' : 'none'");
    plateConsumers.forEach(fileName => {
      const consumer = fs.readFileSync(path.join(platformDir, fileName), 'utf8');
      expect(consumer, fileName).toContain('<span class="plate-count" hidden>0</span>');
    });
  });

  it('keeps the shared Tawk modal independent of dynamically injected styles', () => {
    const script = fs.readFileSync(path.join(platformDir, 'tawk-chat-modal.js'), 'utf8');
    const css = fs.readFileSync(path.join(platformDir, 'tawk-chat-modal.css'), 'utf8');
    const consumers = ['index.html', 'recipe.html', 'category.html', 'ingredient.html', 'cabinet.html', 'login.html'];

    expect(script).not.toContain("createElement('style')");
    expect(script).not.toMatch(/\.style\./);
    expect(script).toContain("document.body.classList.add('tawk-chat-open')");
    expect(script).toContain("document.body.classList.remove('tawk-chat-open')");
    expect(css).toContain('body.tawk-chat-open');
    consumers.forEach(fileName => {
      const html = fs.readFileSync(path.join(platformDir, fileName), 'utf8');
      expect(html, fileName).toContain('tawk-chat-modal.css?v=20260713-csp-styles');
      expect(html, fileName).toContain('tawk-chat-modal.js?v=20260803-tawk-singleton');
    });
  });

  it('keeps static admin controls free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'admin.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'admin.js'), 'utf8');
    const htmlBindings = [...html.matchAll(/\sdata-admin-(?:click|input|change)="([a-f0-9]{12})"/g)].map(match => match[1]);
    const bindings = [...script.matchAll(/bindStaticAdminHandler\("(?:click|input|change)", "([a-f0-9]{12})"/g)].map(match => match[1]);

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(htmlBindings).toHaveLength(61);
    expect(new Set(htmlBindings).size).toBe(53);
    expect(bindings).toHaveLength(53);
    expect(new Set(bindings)).toEqual(new Set(htmlBindings));
    expect(html.match(/\sdata-admin-action="dashboard-tab"/g)).toHaveLength(4);
    expect(html).toContain('data-admin-filter="drafts"');
    expect(html).toMatch(/admin\.js\?v=[^"']+/);
    expect(script).toContain("if (action === 'dashboard-tab')");
    expect(script).toContain("target.dataset.adminFilter === 'drafts'");
    expect(html).toContain('id="recipe-extra-filters" hidden');
    expect(html).toContain('data-admin-action="toggle-recipe-filters"');
    expect(script).toContain('data-admin-action="reset-recipe-filters"');
    expect(script).toContain('window.toggleRecipeFilters = function()');
    expect(script).toContain('window.resetRecipeFilters = function()');
    expect(html).toContain('class="adm-table adm-payments-table"');
    expect(html).toContain('id="payment-filter-result"');
    expect(script).toContain("Подтвердить</button>");
    expect(script).toContain("Отклонить</button>");
    expect(html).toContain('id="feedback-filter-result"');
    expect(html).toContain('id="fb-reply-composer"');
    expect(script).toContain('function feedbackPreview(message)');
    expect(script).toContain("isClosed ? 'Просмотр обращения'");
    expect(html).toContain('class="adm-table adm-video-requests-table"');
    expect(html).toContain('id="video-request-filter-result"');
    expect(html).toContain('data-admin-action="filter-video-requests"');
    expect(script).toContain('window.filterVideoRequests = function(status)');
    expect(script).toContain("action === 'filter-video-requests'");
    expect(html).toContain('id="news-filter-summary"');
    expect(html).toContain('id="news-status-filter"');
    expect(html).toContain('id="news-type-filter"');
    expect(script).toContain('window.resetNewsFilters = function()');
    expect(script).toContain('class="news-card');
    expect(script).toContain('data-admin-action="reset-news-filters"');
    expect(html).toContain('id="category-filter-summary"');
    expect(html).toContain('id="category-rules-filter"');
    expect(script).toContain('window.resetCategoryFilters = function()');
    expect(script).toContain('class="category-card');
    expect(script).toContain('data-admin-action="reset-category-filters"');
    expect(html).toContain('class="adm-table adm-audit-table"');
    expect(html).toContain('id="audit-filter-summary"');
    expect(html).toContain('id="audit-search"');
    expect(script).toContain('window.resetAuditFilters = function()');
    expect(script).toContain('data-admin-action="reset-audit-filters"');
    expect(script).toContain('data-label="Что произошло"');
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
      expect(html, name).toMatch(/header-nav\.js\?v=[^"'\s]+/);
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
    expect(html).toMatch(/index-page\.js\?v=[^"'\s]+/);
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
    expect(html).toMatch(/recipe-page\.js\?v=[^"'\s]+/);
    expect(script).toContain("document.querySelectorAll('[data-recipe-static-action]')");
    expect(script).toContain("control.addEventListener('keydown', handleMiniStatusKey)");
    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script).toContain('data-recipe-action="step-photo-move"');
    expect(script).toContain('data-recipe-action="submit-video-vote"');
    expect(script).toContain('data-recipe-change="toggle-stepper-done"');
    expect(script).toContain("image.dataset.recipeImageFallback === 'step'");
    expect(script).toContain("image.hasAttribute('data-review-avatar-fallback')");
  });

  it('keeps the recipe editor free of static inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'recipe-editor.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'recipe-editor.js'), 'utf8');

    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html.match(/\sdata-editor-static-action=/g)).toHaveLength(19);
    expect(html.match(/\sdata-addon-group=/g)).toHaveLength(4);
    expect(html).toContain('recipe-editor.js?v=20260814-preserve-addon-amount');
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
    expect(html).toMatch(/cabinet\.js\?v=[^"']+/);
    expect(html.match(/\sdata-cabinet-action=/g)).toHaveLength(23);
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
    expect(script).toContain("else if (action === 'delete-history') deleteHistoryEntry(actionTarget.dataset.entryDate || '')");
  });

  it('keeps category JavaScript templates free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'category.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'category-page.js'), 'utf8');

    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toMatch(/category-page\.js\?v=[^"'\s]+/);
    expect(script).toContain("else if (action === 'submit-comment')");
    expect(script).toContain("else if (action === 'save-plate')");
    expect(script).toContain("image.hasAttribute('data-review-avatar-fallback')");
  });

  it('keeps ingredient JavaScript templates free of inline event handlers', () => {
    const html = fs.readFileSync(path.join(platformDir, 'ingredient.html'), 'utf8');
    const script = fs.readFileSync(path.join(platformDir, 'ingredient-page.js'), 'utf8');

    expect(script).not.toMatch(/\son[a-z]+\s*=/i);
    expect(script).not.toContain('.onclick =');
    expect(html).toMatch(/ingredient-page\.js\?v=[^"'\s]+/);
    expect(script).toContain('data-ingredient-card-action="${locked ? \'locked\' : \'open\'}"');
    expect(script).toContain('data-ingredient-action="rate-from-popup"');
    expect(script).toContain('data-ingredient-action="delete-review"');
    expect(script).toContain('data-ingredient-action="save-plate"');
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
      expect(html, fileName).toMatch(/data-v2\.js\?v=[^"'\s]+/);
    });
  });
});
