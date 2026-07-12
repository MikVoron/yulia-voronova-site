-- Confirmed recipe corrections from the 2026-05-03 verification block.
-- Apply on VPS:
--   scp server/migrate-fix-breakfast-spreads-pancakes-2026-05-03.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-fix-breakfast-spreads-pancakes-2026-05-03.sql"

SET client_encoding = 'UTF8';

BEGIN;

UPDATE recipes
SET
  steps = jsonb_set(
    steps,
    '{7,text}',
    to_jsonb('Сформируйте влажными руками сырники.'::text),
    false
  ),
  add_fiber = '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'millet-pancakes-apple';

UPDATE recipes
SET
  time_label = '5 минут',
  updated_at = now()
WHERE id IN ('beetroot-hummus', 'hummus');

UPDATE recipes
SET
  time_label = '5 минут (без учёта замачивания)',
  kcal = 70,
  protein = 2,
  fat = 5,
  carbs = 5,
  fiber = 0,
  updated_at = now()
WHERE id = 'cashew-sauce';

UPDATE recipes
SET
  add_protein = jsonb_set(
    add_protein,
    '{4,name}',
    to_jsonb('Тунец/рыбные консервы'::text),
    false
  ),
  add_fiber = '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3},
    {"name": "Зелень", "amount": "25 г", "kcal": 6, "protein": 1, "fat": 0, "carbs": 1, "fiber": 1},
    {"name": "Свежие овощи", "amount": "125 г", "kcal": 25, "protein": 1, "fat": 0, "carbs": 5, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'green-buckwheat-pancakes';

UPDATE recipes
SET
  add_fiber = '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'lentil-pancakes-gf';

COMMIT;
