-- КБЖУ и клетчатка для рецепта "Соус из кешью" (cashew-sauce)
-- Значения на порцию 15 г (25 порций).

BEGIN;

UPDATE recipes
SET
  kcal    = 43,
  protein = 1,
  fat     = 3,
  carbs   = 2,
  fiber   = 0
WHERE id = 'cashew-sauce';

COMMIT;

-- Проверка
SELECT id, name, kcal, protein, fat, carbs, fiber, portion_grams, servings
FROM recipes
WHERE id = 'cashew-sauce';
