import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { renderCategoryDocument } = require('../src/category-seo.js');
const template = fs.readFileSync(path.resolve('..', 'platform', 'category.html'), 'utf8');
const nginx = fs.readFileSync(path.resolve('nginx', 'plate.voronova.online'), 'utf8');

describe('server-rendered category SEO', () => {
  it('routes the public category URL to the server-rendered endpoint', () => {
    expect(nginx).toMatch(/location = \/category\.html \{[\s\S]*?rewrite \^ \/_seo\/category break;/);
  });

  it('escapes category data and writes a self canonical with CollectionPage data', () => {
    const html = renderCategoryDocument(template,
      { id: 'breads', name: 'Хлеб & крекеры', description: 'Домашний <хлеб>' },
      [{ id: 'bread-1', name: 'Хлеб & семечки' }]);
    expect(html).toContain('<title>Хлеб &amp; крекеры | Умная тарелка</title>');
    expect(html).toContain('<link rel="canonical" href="https://plate.voronova.online/category.html?cat=breads">');
    expect(html).toContain('<h1 class="cat-hero-name">Хлеб &amp; крекеры</h1>');
    expect(html).toContain('Домашний &lt;хлеб&gt;');
    expect(html).toContain('Хлеб &amp; семечки</a>');
    expect(html).toContain('"@type":"CollectionPage"');
    expect(html).toContain('"url":"https://plate.voronova.online/category.html?cat=breads"');
    expect(html).not.toContain('category.html?cat=soups');
  });

  it('does not advertise empty categories or search pages for indexing', () => {
    const empty = renderCategoryDocument(template, { id: 'drinks', name: 'Напитки' }, []);
    const search = renderCategoryDocument(template, null, [], { search: true });
    expect(empty).toContain('<meta name="robots" content="noindex, follow">');
    expect(search).toContain('<meta name="robots" content="noindex, follow">');
    expect(search).toContain('<link rel="canonical" href="https://plate.voronova.online/category.html">');
  });
});
