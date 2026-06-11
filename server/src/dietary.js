const DIETARY_FLAGS = [
  'meat',
  'fish',
  'milk',
  'eggs',
  'gluten',
  'peanuts',
  'nuts',
  'animal_products',
];

const DIETARY_FLAG_SET = new Set(DIETARY_FLAGS);
const DIETARY_PREFERENCE_FLAGS = [...DIETARY_FLAGS, 'vegetarian', 'vegan'];
const DIETARY_PREFERENCE_FLAG_SET = new Set(DIETARY_PREFERENCE_FLAGS);

function normalizeDietaryFlags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(flag => typeof flag === 'string' && DIETARY_FLAG_SET.has(flag)))];
}

function invalidDietaryFlags(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(flag => typeof flag !== 'string' || !DIETARY_FLAG_SET.has(flag));
}

function normalizeDietaryPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    excluded_flags: Array.isArray(source.excluded_flags)
      ? [...new Set(source.excluded_flags.filter(flag => typeof flag === 'string' && DIETARY_PREFERENCE_FLAG_SET.has(flag)))]
      : [],
    allow_swaps: source.allow_swaps !== false,
  };
}

function expandedExcludedFlags(preferences) {
  const flags = new Set(preferences.excluded_flags);
  if (flags.has('vegetarian')) {
    flags.add('meat');
    flags.add('fish');
  }
  if (flags.has('vegan')) {
    flags.add('animal_products');
    flags.add('meat');
    flags.add('fish');
    flags.add('milk');
    flags.add('eggs');
  }
  flags.delete('vegetarian');
  flags.delete('vegan');
  return flags;
}

function ingredientFlags(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return [];
  return normalizeDietaryFlags(ingredient.dietary_flags);
}

function swapOptions(ingredient) {
  if (!ingredient || typeof ingredient !== 'object' || !Array.isArray(ingredient.swap_options)) return [];
  return ingredient.swap_options
    .filter(option => option && typeof option === 'object' && typeof option.name === 'string' && option.name.trim())
    .map(option => ({
      name: option.name.trim(),
      dietary_flags: normalizeDietaryFlags(option.dietary_flags),
    }));
}

function validateVerifiedRecipeDietary(recipe) {
  if (!recipe || recipe.dietary_verified !== true) return null;
  const invalidRecipeFlags = invalidDietaryFlags(recipe.dietary_flags);
  if (invalidRecipeFlags.length) return 'Unknown dietary flag: ' + String(invalidRecipeFlags[0]);

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  for (const ingredient of ingredients) {
    if (!ingredient || typeof ingredient !== 'object') continue;
    const invalidIngredientFlags = invalidDietaryFlags(ingredient.dietary_flags);
    if (invalidIngredientFlags.length) return 'Unknown ingredient dietary flag: ' + String(invalidIngredientFlags[0]);
    if (!Array.isArray(ingredient.swap_options)) continue;
    for (const option of ingredient.swap_options) {
      if (!option || typeof option !== 'object' || typeof option.name !== 'string' || !option.name.trim()) {
        return 'Each dietary swap option needs a name';
      }
      const invalidSwapFlags = invalidDietaryFlags(option.dietary_flags);
      if (invalidSwapFlags.length) return 'Unknown swap dietary flag: ' + String(invalidSwapFlags[0]);
    }
  }
  return null;
}

function isRecipeCompatible(recipe, preferences) {
  const prefs = normalizeDietaryPreferences(preferences);
  const excluded = expandedExcludedFlags(prefs);
  if (!excluded.size) return true;

  // Unverified recipes keep their current visibility until an editor confirms
  // that their ingredient and swap metadata is complete.
  if (!recipe || recipe.dietary_verified !== true) return true;

  const recipeFlags = normalizeDietaryFlags(recipe.dietary_flags);
  const conflicts = recipeFlags.filter(flag => excluded.has(flag));
  if (!conflicts.length) return true;
  if (!prefs.allow_swaps) return false;

  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const conflictingIngredients = ingredients.filter(ingredient =>
    ingredientFlags(ingredient).some(flag => excluded.has(flag))
  );

  // A recipe-level conflict without a matching ingredient is a hard blocker.
  // This covers hidden sources such as a complex sauce whose composition has
  // not yet been structured in ingredients[].
  for (const flag of conflicts) {
    if (!conflictingIngredients.some(ingredient => ingredientFlags(ingredient).includes(flag))) return false;
  }

  // Every conflicting ingredient needs at least one replacement that is safe
  // against the user's complete set of exclusions.
  return conflictingIngredients.every(ingredient =>
    swapOptions(ingredient).some(option =>
      option.dietary_flags.every(flag => !excluded.has(flag))
    )
  );
}

async function getUserDietaryPreferences(db, userId) {
  if (!userId) return normalizeDietaryPreferences(null);
  const result = await db.query('SELECT dietary_preferences FROM users WHERE id=$1', [userId]);
  return normalizeDietaryPreferences(result.rows[0]?.dietary_preferences);
}

module.exports = {
  DIETARY_FLAGS,
  DIETARY_PREFERENCE_FLAGS,
  normalizeDietaryFlags,
  normalizeDietaryPreferences,
  validateVerifiedRecipeDietary,
  isRecipeCompatible,
  getUserDietaryPreferences,
};
