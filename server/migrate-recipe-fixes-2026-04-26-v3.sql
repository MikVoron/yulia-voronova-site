-- Финальная унификация КБЖУ add_fiber по точным цифрам пользователя (2026-04-26):
-- Ягоды 80 г: 32/1/0/7/3; Зелень 25 г: 6/1/0/1/1; Овощи 125 г: 25/1/0/5/3.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-fixes-2026-04-26-v3.sql

UPDATE recipes
SET add_fiber = '[
      {"name": "Горсть ягод", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3},
      {"name": "Зелень", "amount": "25 г", "kcal": 6, "protein": 1, "fat": 0, "carbs": 1, "fiber": 1},
      {"name": "Свежие овощи", "amount": "125 г", "kcal": 25, "protein": 1, "fat": 0, "carbs": 5, "fiber": 3}
    ]'::jsonb,
    updated_at = now()
WHERE id = 'green-buckwheat-pancakes';

UPDATE recipes
SET add_fiber = '[
      {"name": "Горсть ягод", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
    ]'::jsonb,
    updated_at = now()
WHERE id IN ('lentil-pancakes-gf', 'millet-pancakes-apple');
