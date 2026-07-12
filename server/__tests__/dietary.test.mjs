import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  normalizeDietaryPreferences,
  validateVerifiedRecipeDietary,
  isRecipeCompatible,
} = require('../src/dietary');

function verifiedRecipe(overrides = {}) {
  return {
    dietary_verified: true,
    dietary_flags: [],
    ingredients: [],
    ...overrides,
  };
}

describe('dietary compatibility', () => {
  it('keeps current visibility for unverified recipes', () => {
    const recipe = {
      dietary_verified: false,
      dietary_flags: ['milk'],
      ingredients: [{ name: 'Milk', dietary_flags: ['milk'] }],
    };
    expect(isRecipeCompatible(recipe, { excluded_flags: ['milk'] })).toBe(true);
  });

  it('hides a verified conflicting recipe when swaps are disabled', () => {
    const recipe = verifiedRecipe({
      dietary_flags: ['milk'],
      ingredients: [{
        name: 'Cream',
        dietary_flags: ['milk'],
        swap_options: [{ name: 'White bean sauce', dietary_flags: [] }],
      }],
    });
    expect(isRecipeCompatible(recipe, { excluded_flags: ['milk'], allow_swaps: false })).toBe(false);
  });

  it('keeps a recipe when a replacement satisfies all selected exclusions', () => {
    const recipe = verifiedRecipe({
      dietary_flags: ['milk'],
      ingredients: [{
        name: 'Cream',
        dietary_flags: ['milk'],
        swap_options: [
          { name: 'Cashew sauce', dietary_flags: ['nuts'] },
          { name: 'White bean sauce', dietary_flags: [] },
        ],
      }],
    });
    expect(isRecipeCompatible(recipe, {
      excluded_flags: ['milk', 'nuts'],
      allow_swaps: true,
    })).toBe(true);
  });

  it('hides a recipe when every replacement conflicts with another exclusion', () => {
    const recipe = verifiedRecipe({
      dietary_flags: ['milk'],
      ingredients: [{
        name: 'Cream',
        dietary_flags: ['milk'],
        swap_options: [{ name: 'Cashew sauce', dietary_flags: ['nuts'] }],
      }],
    });
    expect(isRecipeCompatible(recipe, {
      excluded_flags: ['milk', 'nuts'],
      allow_swaps: true,
    })).toBe(false);
  });

  it('treats a recipe-level flag without a structured ingredient as a blocker', () => {
    const recipe = verifiedRecipe({ dietary_flags: ['gluten'] });
    expect(isRecipeCompatible(recipe, {
      excluded_flags: ['gluten'],
      allow_swaps: true,
    })).toBe(false);
  });

  it('drops unsupported preference values', () => {
    expect(normalizeDietaryPreferences({
      excluded_flags: ['milk', 'milk', 'unknown'],
      allow_swaps: false,
    })).toEqual({ excluded_flags: ['milk'], allow_swaps: false });
  });

  it('treats vegetarian as no meat while allowing fish, milk, and eggs', () => {
    expect(isRecipeCompatible(verifiedRecipe({ dietary_flags: ['meat'] }), {
      excluded_flags: ['vegetarian'],
      allow_swaps: false,
    })).toBe(false);
    expect(isRecipeCompatible(verifiedRecipe({ dietary_flags: ['fish'] }), {
      excluded_flags: ['vegetarian'],
      allow_swaps: false,
    })).toBe(true);
    expect(isRecipeCompatible(verifiedRecipe({ dietary_flags: ['milk'] }), {
      excluded_flags: ['vegetarian'],
      allow_swaps: false,
    })).toBe(true);
    expect(isRecipeCompatible(verifiedRecipe({ dietary_flags: ['eggs'] }), {
      excluded_flags: ['vegetarian'],
      allow_swaps: false,
    })).toBe(true);
  });

  it('treats vegan as no animal products including fish, milk, and eggs', () => {
    ['meat', 'fish', 'milk', 'eggs', 'animal_products'].forEach(flag => {
      expect(isRecipeCompatible(verifiedRecipe({ dietary_flags: [flag] }), {
        excluded_flags: ['vegan'],
        allow_swaps: false,
      })).toBe(false);
    });
  });

  it('rejects unknown flags in verified swap metadata', () => {
    const recipe = verifiedRecipe({
      dietary_flags: ['milk'],
      ingredients: [{
        name: 'Cream',
        dietary_flags: ['milk'],
        swap_options: [{ name: 'Mystery sauce', dietary_flags: ['unknown'] }],
      }],
    });
    expect(validateVerifiedRecipeDietary(recipe)).toMatch(/Unknown swap dietary flag/);
  });
});
