-- Рецепт: Суп-пюре из чечевицы с морковью
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-soup-lentil-carrot.sql
--
-- Флаги: is_soup=true (хлеб + oregano-croutons добавляются автоматически в «Углеводы», в add_carbs НЕ дублируем).
-- TODO:
--   • фото пока нет — папка images/recipes/soup-lentil-carrot/ отсутствует, photo=null
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
  'soup-lentil-carrot',
  'mains',
  'Суп-пюре из чечевицы с морковью',
  NULL,
  40,
  NULL,
  'medium',
  7,
  false,
  218, 11, 5, 34, 7,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  NULL,
  'Суп получается пряным, с мягкой сладостью моркови, лёгкой остротой имбиря и нежной кремовой текстурой. Это сытный, мягкий и очень уютный суп, который хорошо подходит как для обеда, так и для лёгкого ужина.',
  '[
    {"name": "Красная чечевица — 250 г", "swap": null},
    {"name": "Морковь — 600 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Имбирь — 10 г", "swap": null},
    {"name": "Тахини — 2 ст. л.", "swap": null},
    {"name": "Сок лимона — 1 ст. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Растительное масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 2 л", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "[Овощной концентрат](veggie-concentrate) — 3 ч. л.", "swap": "Можно без него"}
  ]'::jsonb,
  '[
    {"text": "Нарежьте лук, морковь, чеснок и имбирь на средние кусочки."},
    {"text": "Обжарьте лук на растительном масле около 3 минут."},
    {"text": "Добавьте имбирь, чеснок и специи, перемешайте 1 минуту."},
    {"text": "Добавьте морковь и чечевицу, перемешайте."},
    {"text": "Влейте воду и добавьте овощной концентрат, если используете его."},
    {"text": "Доведите до кипения и варите около 20 минут до мягкости моркови."},
    {"text": "Добавьте тахини, лимонный сок и соль, затем пробейте суп блендером до кремовой текстуры."},
    {"text": "Снова доведите до кипения и снимите с огня."}
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  true,
  0,
  true,
  ARRAY['red-lentils', 'carrot']
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
DELETE FROM recipe_categories WHERE recipe_id = 'soup-lentil-carrot';
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-lentil-carrot', 'mains');

COMMIT;
