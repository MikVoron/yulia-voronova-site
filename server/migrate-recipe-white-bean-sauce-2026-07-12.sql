-- Рецепт №88: Соус из белой фасоли.
-- Авторские данные от 2026-07-12. Фото будет добавлено позднее.
-- Применить:
--   scp server/migrate-recipe-white-bean-sauce-2026-07-12.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-white-bean-sauce-2026-07-12.sql"

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients, dietary_flags, dietary_verified
) VALUES (
  'white-bean-sauce', 'sauces', 'Соус из белой фасоли', NULL,
  5, NULL, 'easy', 17, false,
  24, 1, 1, 4, 1, ARRAY['растительное', 'без сои', 'без глютена'], NULL,
  'Нежный, кремовый соус с лёгкой кислинкой и пикантной ноткой дижонской горчицы. Отлично подходит для салатов, сэндвичей, бургеров, запечённых овощей и в качестве дипа.', NULL,
  '[
    {"name":"Белая фасоль отварная: 300 г","swap":"Белая фасоль консервированная"},
    {"name":"Дижонская горчица: 2 ч. л.","swap":null},
    {"name":"Лимонный сок: 2 ст. л.","swap":null},
    {"name":"Оливковое масло: 1 ст. л.","swap":null},
    {"name":"Соль кала намак: 1 ч. л.","swap":"Обычная соль"},
    {"name":"Вода: 3 ст. л. (до желаемой густоты)","swap":null}
  ]'::jsonb,
  '[
    {"text":"Положите фасоль, дижонскую горчицу, лимонный сок, оливковое масло и соль в чашу блендера."},
    {"text":"Добавьте 3 ст. л. воды и измельчите до однородной кремовой массы."},
    {"text":"Если соус получился слишком густым, добавьте ещё 1–2 ст. л. воды и снова взбейте до желаемой консистенции."},
    {"text":"Попробуйте соус и при необходимости добавьте ещё немного лимонного сока или соли."},
    {"text":"Переложите соус в герметичный контейнер и уберите в холодильник минимум на 30 минут — после охлаждения вкус станет более насыщенным."}
  ]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  23, false, 0, '{}'::jsonb, false,
  ARRAY['white-beans'], ARRAY[]::text[], true
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
  is_free = EXCLUDED.is_free,
  kcal = EXCLUDED.kcal,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  carbs = EXCLUDED.carbs,
  fiber = EXCLUDED.fiber,
  tags = EXCLUDED.tags,
  photo = EXCLUDED.photo,
  quote = EXCLUDED.quote,
  note = EXCLUDED.note,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  auto_addons = EXCLUDED.auto_addons,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  dietary_flags = EXCLUDED.dietary_flags,
  dietary_verified = EXCLUDED.dietary_verified,
  updated_at = now();

DELETE FROM recipe_categories WHERE recipe_id = 'white-bean-sauce';
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('white-bean-sauce', 'sauces');

-- В «Оливье» этот же соус уже дан полным набором ингредиентов. Ссылка на
-- заголовке блока ведёт к карточке соуса, не меняя состав и КБЖУ салата.
UPDATE recipes
SET ingredients = jsonb_set(
  ingredients,
  '{6,name}',
  '"[Соус из белой фасоли](white-bean-sauce)"'::jsonb,
  false
), updated_at = now()
WHERE id = 'salad-olivier-tofu'
  AND ingredients -> 6 ->> 'name' = '— Соус —';

COMMIT;

-- Проверка:
SELECT id, name, cat, emoji, time_min, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags, photo, is_published,
       main_ingredients, dietary_flags, dietary_verified
FROM recipes
WHERE id = 'white-bean-sauce';

SELECT ingredients -> 6 ->> 'name' AS olivier_sauce_link
FROM recipes
WHERE id = 'salad-olivier-tofu';
