-- Точечные правки от 2026-04-26 (пользователь, второй пакет):
-- 1. green-buckwheat-pancakes: portion_grams=70
-- 2. Унификация КБЖУ добавок (йогурт/творог/мясо/рыба/тунец/ягоды/зелень/овощи)
--    в рецептах: millet-pancakes-apple, green-buckwheat-pancakes, lentil-pancakes-gf.
-- 3. Цитата для lentil-pancakes-gf.
--
-- ВНИМАНИЕ: для add_fiber пользователь не указал клетчатку — оставлены табличные оценки
-- (ягоды 4 г, зелень 1 г, овощи 2 г). Подтвердить или поправить.
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-fixes-2026-04-26-v2.sql

UPDATE recipes
SET portion_grams = 70,
    updated_at = now()
WHERE id = 'green-buckwheat-pancakes';

UPDATE recipes
SET add_protein = '[
      {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
      {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0},
      {"name": "Белое мясо", "amount": "100 г", "kcal": 110, "protein": 23, "fat": 2, "carbs": 0, "fiber": 0},
      {"name": "Слабосолёная жирная рыба", "amount": "80 г", "kcal": 135, "protein": 15, "fat": 8, "carbs": 0, "fiber": 0},
      {"name": "Тунец консервированный", "amount": "80 г", "kcal": 110, "protein": 18, "fat": 3, "carbs": 0, "fiber": 0}
    ]'::jsonb,
    add_fiber = '[
      {"name": "Горсть ягод", "amount": "80 г", "kcal": 32, "protein": 0.8, "fat": 0.3, "carbs": 7, "fiber": 4},
      {"name": "Зелень", "amount": "25 г", "kcal": 6, "protein": 0.5, "fat": 0.1, "carbs": 1, "fiber": 1},
      {"name": "Свежие овощи", "amount": "125 г", "kcal": 25, "protein": 1.2, "fat": 0.2, "carbs": 5, "fiber": 2}
    ]'::jsonb,
    updated_at = now()
WHERE id = 'green-buckwheat-pancakes';

UPDATE recipes
SET add_protein = '[
      {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
      {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0}
    ]'::jsonb,
    add_fiber = '[
      {"name": "Горсть ягод", "amount": "80 г", "kcal": 32, "protein": 0.8, "fat": 0.3, "carbs": 7, "fiber": 4}
    ]'::jsonb,
    updated_at = now()
WHERE id = 'millet-pancakes-apple';

UPDATE recipes
SET add_protein = '[
      {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
      {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0}
    ]'::jsonb,
    add_fiber = '[
      {"name": "Горсть ягод", "amount": "80 г", "kcal": 32, "protein": 0.8, "fat": 0.3, "carbs": 7, "fiber": 4}
    ]'::jsonb,
    quote = 'Эти оладьи хороши не только со сладким. Напеките, накормите, услышьте хвалебные песни и не говорите из чего они! Вкуса чечевицы нет вообще — и пользы сколько!',
    updated_at = now()
WHERE id = 'lentil-pancakes-gf';
