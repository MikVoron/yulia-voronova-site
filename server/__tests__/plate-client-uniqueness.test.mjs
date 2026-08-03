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

function loadPlate() {
  const values = new Map();
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
      getToken: () => '',
      api: () => Promise.resolve()
    },
    updatePlateIcon: () => {}
  };
  vm.runInNewContext(dataModule.slice(plateStart, plateEnd) + '\nglobalThis.Plate = Plate;', context);
  return context.Plate;
}

describe('client plate uniqueness', () => {
  it('does not add a recipe to the current plate twice', () => {
    const plate = loadPlate();

    expect(plate.add({ name: 'Dish', recipeId: 'dish' })).toBe(true);
    expect(plate.add({ name: 'Dish again', recipeId: 'dish' })).toBe(false);
    expect(plate.get()).toMatchObject([{ name: 'Dish', recipeId: 'dish' }]);
    expect(plate.count()).toBe(1);
  });

  it('explains why a repeat add was ignored', () => {
    expect(recipePage).toContain("showToast(r.emoji + ' Это блюдо уже в тарелке')");
    expect(recipePage).toContain("showToast((item.emoji || '🍴') + ' Это блюдо уже в тарелке')");
  });
});
