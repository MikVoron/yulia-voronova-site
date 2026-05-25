-- Рецепт: Паштет из белой фасоли
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-spread-white-bean.sql
--
-- Категория: spreads (намазки). Не путать с существующим рецептом-соусом white-bean-sauce (категория sauces).
-- TODO:
--   • фото пока нет — папка images/recipes/spread-white-bean/ отсутствует, photo=null
--   • sort_order=0 — назначить вручную при публикации

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup, main_ingredients
) VALUES (
  'spread-white-bean',
  'spreads',
  'Паштет из белой фасоли',
  NULL,
  10,
  NULL,
  'easy',
  6,
  false,
  69, 5, 2, 9, 4,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  NULL,
  'Для разнообразия хумусов и других бобовых намазок этот паштет отлично подходит: он получается нежным и мягким по текстуре, с лёгкой ореховой ноткой тахини, пикантным чесноком, свежестью зелени и приятной кислинкой лимона.',
  '[
    {"name": "Белая фасоль отварная — 150 г", "swap": "Консервированная белая фасоль"},
    {"name": "Шпинат свежий — 20 г", "swap": null},
    {"name": "Петрушка — 10 г", "swap": null},
    {"name": "Тахини — 20 г", "swap": null},
    {"name": "Лимонный сок — 1 ст. л.", "swap": null},
    {"name": "Чеснок — 1 зубчик", "swap": null},
    {"name": "Соль, перец — по вкусу", "swap": null},
    {"name": "Вода — 40 мл", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Мелко нарежьте шпинат и петрушку."},
    {"text": "Пробейте в блендере фасоль, тахини, чеснок и воду до гладкой текстуры."},
    {"text": "Добавьте лимонный сок, соль, перец и зелень."},
    {"text": "Хорошо перемешайте паштет."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  50,
  true,
  0,
  false,
  ARRAY['white-beans']
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
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  updated_at = now();

-- Полная синхронизация категорий: рецепт уже существует после upsert выше → FK безопасен.
DELETE FROM recipe_categories WHERE recipe_id = 'spread-white-bean';
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('spread-white-bean', 'spreads');

COMMIT;
