-- Точечные правки от 2026-04-26 (пользователь):
-- 1. side-brown-rice — portion_grams=170 (ранее NULL).
-- 2. grechotto — добавлены пищевые дрожжи в add_protein (15 г, 48 ккал, 7/1/5/3).
-- 3. cashew-sauce — фото на новый путь + шаги нормализованы в объекты {text, photo}.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-fixes-2026-04-26.sql

UPDATE recipes
SET portion_grams = 170,
    updated_at = now()
WHERE id = 'side-brown-rice';

UPDATE recipes
SET add_protein = '[
  {"name": "Пармезан", "amount": "10 г", "kcal": 43, "protein": 4, "fat": 3, "carbs": 0, "fiber": 0},
  {"name": "Неактивные пищевые дрожжи", "amount": "15 г", "kcal": 48, "protein": 7, "fat": 1, "carbs": 5, "fiber": 3}
]'::jsonb,
    updated_at = now()
WHERE id = 'grechotto';

UPDATE recipes
SET photo = 'images/recipes/cashew-sauce/cashew-sauce-cover.webp',
    steps = '[
      {"text": "Замочить кешью минимум на 4–6 часов, можно на ночь.", "photo": null},
      {"text": "Замоченный кешью слить и промыть.", "photo": null},
      {"text": "Сложить все ингредиенты в блендер, взбить до кремовой однородной текстуры.", "photo": null}
    ]'::jsonb,
    updated_at = now()
WHERE id = 'cashew-sauce';
