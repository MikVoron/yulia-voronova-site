-- Исправления по подтверждённому списку пользователя:
-- 1. buckwheat-quinoa-soup: корректировка add_protein
-- 2. grechotto: добавление неактивных пищевых дрожжей в add_protein
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-soup-and-grechotto-addons.sql

UPDATE recipes
SET
  add_protein = '[
    {"name": "Белое мясо готовое", "amount": "70 г", "kcal": 115, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 100, "protein": 12, "fat": 5, "carbs": 3, "fiber": 0},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'buckwheat-quinoa-soup';

UPDATE recipes
SET
  add_protein = '[
    {"name": "Пармезан", "amount": "10 г", "kcal": 43, "protein": 4, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Неактивные пищевые дрожжи", "amount": "15 г", "kcal": 48, "protein": 7, "fat": 1, "carbs": 5, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'grechotto';
