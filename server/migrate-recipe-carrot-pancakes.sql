-- Рецепт: Блины с морковью (новый)
-- Источник: текст пользователя (strict / No-Guessing по docs/ai-recipe-input-contract.md).
-- Категория: pancakes (как у lentil-pancakes-gf, millet-pancakes-apple).
-- Решения пользователя: is_published=true; «1 порция = 2 блинчика» → note; portion_grams=NULL;
--   у добавок йогурт/творог клетчатка в тексте не дана; fiber=0 подтверждён пользователем
--   (молочка — клетчатка фактически 0; ср. lentil-pancakes-gf с теми же добавками fiber:0).
-- emoji=NULL, photo=NULL (не подтверждены).
-- Guard: падает, если id уже существует (без молчаливого overwrite).
-- Применить (на VPS, НЕ через pipe из PowerShell — кириллица!):
--   scp server/migrate-recipe-carrot-pancakes.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-carrot-pancakes.sql"

BEGIN;

-- Guard: не перезаписывать существующий рецепт
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM recipes WHERE id = 'carrot-pancakes') THEN
    RAISE EXCEPTION 'Recipe carrot-pancakes already exists — aborting (no overwrite).';
  END IF;
END $$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  main_ingredients, portion_grams, is_published, sort_order
) VALUES (
  'carrot-pancakes',
  'pancakes',
  'Блины с морковью',
  NULL,
  30,
  'easy',
  6,
  false,
  238, 8, 5, 41, 6,
  ARRAY['растительное'],
  NULL,
  'Блинчики получаются мягкими, ароматными и немного пряными за счёт корицы, мускатного ореха и лимонной цедры, а морковь добавляет не только естественную сладость, но и дополнительную клетчатку.',
  '1 порция = 2 блинчика',
  '[
    {"name": "Соевое молоко — 320 мл", "swap": "Овсяное или обычное молоко — 320 мл"},
    {"name": "Цельнозерновая мука — 220 г", "swap": null},
    {"name": "Морковь — 250 г", "swap": null},
    {"name": "Яблочный уксус — 1,5 ч. л.", "swap": null},
    {"name": "Разрыхлитель — 1 ч. л.", "swap": null},
    {"name": "Корица — 1 ч. л.", "swap": null},
    {"name": "Молотый мускатный орех — 1/4 ч. л.", "swap": null},
    {"name": "Соль — 1/4 ч. л.", "swap": null},
    {"name": "Лимонная цедра — 1 ч. л.", "swap": null},
    {"name": "Сахар — 2 ст. л.", "swap": "Мёд, сироп или 1 мягкий банан"},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Смешайте сухие ингредиенты: муку, соль, разрыхлитель, корицу, мускатный орех и сахар.", "photo": null},
    {"text": "Добавьте в молоко яблочный уксус, перемешайте.", "photo": null},
    {"text": "Влейте молоко и оливковое масло в муку, хорошо перемешайте до однородного теста.", "photo": null},
    {"text": "Добавьте лимонную цедру.", "photo": null},
    {"text": "Натрите морковь на мелкой тёрке, добавьте в тесто и тщательно перемешайте.", "photo": null},
    {"text": "Разогрейте сковороду и один раз смажьте её растительным маслом с помощью кисточки.", "photo": null},
    {"text": "Выложите тесто ложкой и распределите тонким слоем.", "photo": null},
    {"text": "Жарьте с двух сторон до румяности.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2–5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  ARRAY['carrot'],
  NULL,
  true,
  0
);

-- recipe_categories: полная пересинхронизация только для этого id
DELETE FROM recipe_categories WHERE recipe_id = 'carrot-pancakes';
INSERT INTO recipe_categories (recipe_id, category_id) VALUES ('carrot-pancakes', 'pancakes');

COMMIT;
