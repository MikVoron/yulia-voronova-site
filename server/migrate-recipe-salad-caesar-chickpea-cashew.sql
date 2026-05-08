-- Рецепт: Цезарь с нутом и соусом из кешью (салат)
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-salad-caesar-chickpea-cashew.sql
--
-- TODO:
--   • фото пока нет — папка images/recipes/salad-caesar-chickpea-cashew/ отсутствует, photo=null
--   • sort_order=0 — назначить вручную при публикации
--
-- ПРИМЕЧАНИЕ: КБЖУ дано в десятых (316,6 / 13,5 / 15,4 / 34,5 / 8,1) — округлено
-- до целых: 317 / 14 / 15 / 35 / 8 (по согласованию с пользователем).

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'salad-caesar-chickpea-cashew',
  'salads',
  'Цезарь с нутом и соусом из кешью',
  NULL,
  30,
  NULL,
  'easy',
  3,
  false,
  317, 14, 15, 35, 8,
  ARRAY['растительное', 'без глютена', 'бобовые'],
  NULL,
  'Этот салат получается легче оригинального «Цезаря». Соус из кешью делает его более мягким, сливочным и оригинальным. Кешью можно заранее замочить в большом количестве, порционно заморозить и хранить в морозильнике до 6 месяцев. Потом просто быстро разморозить и использовать по мере необходимости.',
  '[
    {"name": "Нут отварной (консервированный) — 250 г", "swap": null},
    {"name": "Оливковое масло — 1/3 ч. л.", "swap": null},
    {"name": "Чесночный порошок — 0,5 ч. л.", "swap": null},
    {"name": "Паприка копчёная — 0,5 ч. л.", "swap": null},
    {"name": "Кешью — 90 г", "swap": null},
    {"name": "Вода — 75 г", "swap": null},
    {"name": "Чеснок — 1 маленький зубчик", "swap": null},
    {"name": "Каперсы — 1 ч. л.", "swap": null},
    {"name": "Тамари — 1 ч. л.", "swap": null},
    {"name": "Дижонская горчица — 1/2 ч. л.", "swap": null},
    {"name": "Лимонный сок — 1,5 ч. л.", "swap": null},
    {"name": "Листья салата (ромэн, айсберг, фриссе) — 100 г", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите кешью в воде на ночь или минимум на 6 часов."},
    {"text": "Смешайте отварной нут с оливковым маслом, чесночным порошком и паприкой."},
    {"text": "Запеките нут в духовке около 20 минут или слегка поджарьте на сухой сковороде до румяности."},
    {"text": "Для соуса пробейте в блендере кешью, воду, чеснок, каперсы, тамари, горчицу и лимонный сок до кремовой текстуры. Посолите по вкусу."},
    {"text": "Выложите листья салата, добавьте нут и полейте соусом."},
    {"text": "Посыпьте свежемолотым чёрным перцем."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  180,
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
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('salad-caesar-chickpea-cashew', 'salads')
ON CONFLICT DO NOTHING;
