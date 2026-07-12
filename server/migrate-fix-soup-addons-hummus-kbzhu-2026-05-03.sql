-- Confirmed soup protein add-on and hummus KBZHU corrections from 2026-05-03.
-- Apply on VPS:
--   scp server/migrate-fix-soup-addons-hummus-kbzhu-2026-05-03.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-fix-soup-addons-hummus-kbzhu-2026-05-03.sql"

SET client_encoding = 'UTF8';

BEGIN;

UPDATE recipes
SET
  kcal = 200,
  protein = 9,
  fat = 7,
  carbs = 25,
  fiber = 7,
  updated_at = now()
WHERE id = 'hummus';

UPDATE recipes
SET
  kcal = 130,
  protein = 7,
  fat = 4,
  carbs = 18,
  fiber = 6,
  updated_at = now()
WHERE id = 'beetroot-hummus';

UPDATE recipes
SET
  add_protein = '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус", "amount": "40 г", "kcal": 75, "protein": 3, "fat": 3, "carbs": 10, "fiber": 3, "recipeId": "hummus"},
    {"name": "Хумус со свёклой", "amount": "40 г", "kcal": 52, "protein": 2, "fat": 2, "carbs": 8, "fiber": 2, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  updated_at = now()
WHERE id IN ('borscht-red-beans', 'red-lentil-mushroom-soup', 'shchi-white-beans');

UPDATE recipes
SET
  add_protein = '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5},
    {"name": "Хумус", "amount": "40 г", "kcal": 75, "protein": 3, "fat": 3, "carbs": 10, "fiber": 3, "recipeId": "hummus"},
    {"name": "Свекольный хумус", "amount": "40 г", "kcal": 52, "protein": 2, "fat": 2, "carbs": 8, "fiber": 2, "recipeId": "beetroot-hummus"}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'green-lentil-millet-soup';

UPDATE recipes
SET
  add_protein = '[
    {"name": "Белое мясо готовое", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'buckwheat-quinoa-soup';

UPDATE recipes
SET
  add_protein = '[
    {"name": "Готовое белое мясо", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'mung-bean-soup';

UPDATE recipes
SET
  add_protein = '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Твердый тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'red-lentil-vegetable-soup';

COMMIT;
