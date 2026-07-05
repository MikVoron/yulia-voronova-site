import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tabs = require('../../platform/cabinet-tabs.js');

describe('cabinet tab navigation', () => {
  it.each(tabs.TABS)('restores %s from a direct query URL', tab => {
    expect(tabs.resolve('?tab=' + tab, '')).toBe(tab);
  });

  it('supports legacy hashes and canonicalizes unknown tabs', () => {
    expect(tabs.resolve('', '#history')).toBe('history');
    expect(tabs.resolve('?tab=unknown', '')).toBe('subscription');
  });

  it('supports the dedicated settings tab', () => {
    expect(tabs.TABS).toContain('settings');
    expect(tabs.resolve('?tab=settings', '')).toBe('settings');
  });

  it('preserves unrelated query parameters while changing tabs', () => {
    expect(tabs.urlFor('https://app.voronova.online/cabinet.html?tab=subscription&return=recipe.html%3Fid%3Done', 'favorites'))
      .toBe('cabinet.html?tab=favorites&return=recipe.html%3Fid%3Done');
  });

  it('converts a legacy tab hash to the query contract', () => {
    expect(tabs.urlFor('https://app.voronova.online/cabinet.html#subscription', 'subscription'))
      .toBe('cabinet.html?tab=subscription');
  });
});
