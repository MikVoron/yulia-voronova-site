-- КБЖУ и клетчатка для рецепта "Соус из кешью" (cashew-sauce)
-- Значения на порцию 15 г (25 порций).

BEGIN;

UPDATE recipes
SET
  kcal    = 70,
  protein = 2,
  fat     = 5,
  carbs   = 5,
  fiber   = 0
WHERE id = 'cashew-sauce';

COMMIT;

-- Проверка
SELECT id, name, kcal, protein, fat, carbs, fiber, portion_grams, servings
FROM recipes
WHERE id = 'cashew-sauce';
