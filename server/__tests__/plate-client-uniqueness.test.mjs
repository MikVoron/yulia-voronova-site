import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dataModule = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'platform', 'data-v2.js'), 'utf8');
const recipePage = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'platform', 'recipe-page.js'), 'utf8');
const plateStart = dataModule.indexOf('const Plate = {');
const plateEnd = dataModule.indexOf('\nfunction plateMealTypePickerHtml', plateStart);

function loadPlate(withToken = false) {
  const values = new Map();
  const apiCalls = [];
  const context = {
    Set,
    JSON,
    Date,
    Object,
    Number,
    Array,
    localStorage: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value))
    },
    Auth: {
      _userKey: (key) => key,
      getToken: () => withToken ? 'token' : '',
      api: (url, options) => {
        apiCalls.push({ url, options });
        return Promise.resolve({ ok: true });
      }
    },
    updatePlateIcon: () => {}
  };
  vm.runInNewContext(dataModule.slice(plateStart, plateEnd) + '\nglobalThis.Plate = Plate;', context);
  return { plate: context.Plate, values, apiCalls };
}

describe('client plate uniqueness', () => {
  it('does not add a recipe to the current plate twice', () => {
    const { plate } = loadPlate();

    expect(plate.add({ name: 'Dish', recipeId: 'dish' })).toBe(true);
    expect(plate.add({ name: 'Dish again', recipeId: 'dish' })).toBe(false);
    expect(plate.get()).toMatchObject([{ name: 'Dish', recipeId: 'dish' }]);
    expect(plate.count()).toBe(1);
  });

  it('explains why a repeat add was ignored', () => {
    expect(recipePage).toContain("showToast(r.emoji + ' Это блюдо уже в тарелке')");
    expect(recipePage).toContain("showToast((item.emoji || '🍴') + ' Это блюдо уже в тарелке')");
  });

  it('removes a journal entry locally only after the API confirms deletion', async () => {
    const { plate, values, apiCalls } = loadPlate(true);
    const date = '2026-08-03T19:14:00.000Z';
    values.set('plate_history', JSON.stringify([{ date, items: [{ name: 'Dish' }], totals: {} }]));

    await plate.removeHistory(date);

    expect(plate.getHistory()).toEqual([]);
    expect(apiCalls).toEqual([{
      url: '/plate/history',
      options: { method: 'DELETE', body: JSON.stringify({ date }) }
    }]);
  });
});
