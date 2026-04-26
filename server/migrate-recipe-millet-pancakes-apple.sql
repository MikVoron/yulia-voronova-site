-- Рецепт: Пшенники с яблоком
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория breakfasts.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-millet-pancakes-apple.sql
--
-- TODO: фото пока нет — папка images/recipes/millet-pancakes-apple/ отсутствует, photo=null.
-- ВНИМАНИЕ: КБЖУ для add_protein/add_fiber взяты из табличных значений USDA (в ТЗ только наименования).
-- Йогурт 2-5% (150 г): из INGREDIENT_DB yogurt-medium-fat (60/6.67/6.67/6.67/0 на 100 г).
-- Творог 5% (100 г): из табличных данных (~121/17/5/2/0).
-- Ягоды (80 г, ассорти): ~40/1/0/8/4. Подтвердить с пользователем.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'millet-pancakes-apple',
  'breakfasts',
  'Пшенники с яблоком',
  '🥞',
  20,
  '20 минут (без варки пшёнки)',
  'easy',
  9,
  false,
  110, 3, 2, 19, 2,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Пшено для оладий лучше варить на воде в пропорции 1:2,2: очень тщательно промыть крупу, залить водой, довести до кипения и варить под крышкой на слабом огне около 25 минут. Затем дать каше постоять 5–10 минут и полностью охладить — так пшенники лучше держат форму и получаются нежнее.',
  '[
    {"name": "Холодная пшённая каша — 500 г", "swap": null},
    {"name": "Яблоко — 2 шт.", "swap": null},
    {"name": "Мёд — 1 ст. л.", "swap": "1 банан"},
    {"name": "Рисовая мука — 5 ст. л.", "swap": null},
    {"name": "Растительное масло — немного для жарки", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Натрите яблоки на мелкой тёрке.", "photo": null},
    {"text": "Хорошо отожмите руками, уберите лишний сок.", "photo": null},
    {"text": "При желании слегка пробейте пшёнку погружным блендером короткими импульсами, сохранив текстуру.", "photo": null},
    {"text": "Смешайте пшёнку, яблоко и мёд.", "photo": null},
    {"text": "Если используете банан, просто разомните его вилкой и добавьте к другим ингредиентам.", "photo": null},
    {"text": "Добавьте рисовую муку.", "photo": null},
    {"text": "Тщательно перемешайте и оставьте на 10 минут.", "photo": null},
    {"text": "Сформируйте влажными руками оладьи.", "photo": null},
    {"text": "Обваляйте в рисовой муке.", "photo": null},
    {"text": "Разогрейте сковороду с небольшим количеством масла.", "photo": null},
    {"text": "Жарьте под крышкой на огне чуть ниже среднего по 5 минут с каждой стороны до золотистой корочки.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2-5%", "amount": "150 г", "kcal": 90, "protein": 10, "fat": 10, "carbs": 10, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 2, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Горсть ягод", "amount": "80 г", "kcal": 40, "protein": 1, "fat": 0, "carbs": 8, "fiber": 4}
  ]'::jsonb,
  80,
  false,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
  time_label = EXCLUDED.time_label,
  difficulty = EXCLUDED.difficulty,
  servings = EXCLUDED.servings,
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
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('millet-pancakes-apple', 'breakfasts')
ON CONFLICT DO NOTHING;
