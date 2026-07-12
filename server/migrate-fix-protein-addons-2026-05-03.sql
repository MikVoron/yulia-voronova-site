-- Confirmed protein add-on corrections from the 2026-05-03 recipe verification block.
-- Apply on VPS:
--   scp server/migrate-fix-protein-addons-2026-05-03.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-fix-protein-addons-2026-05-03.sql"

SET client_encoding = 'UTF8';

BEGIN;

UPDATE recipes
SET
  add_protein = '[
    {"name": "Пармезан", "amount": "15 г", "kcal": 59, "protein": 6, "fat": 4, "carbs": 1, "fiber": 0},
    {"name": "Неактивные пищевые дрожжи", "amount": "10 г", "kcal": 40, "protein": 5, "fat": 0, "carbs": 3, "fiber": 2}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'pasta-tomato-roasted-peppers';

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
