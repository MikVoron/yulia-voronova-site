-- Рецепт: Картошка с кабачком в духовке (гарнир)
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-side-potato-zucchini.sql
--
-- TODO:
--   • фото пока нет — папка images/recipes/side-potato-zucchini/ отсутствует, photo=null
--   • sort_order=0 — назначить вручную при публикации

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'side-potato-zucchini',
  'sides',
  'Картошка с кабачком в духовке',
  NULL,
  60,
  NULL,
  'medium',
  6,
  false,
  200, 6, 3, 38, 5,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Это рецепт, очень близкий к итальянской скарпачче, только с меньшим количеством теста. Можно подавать и горячим, и холодным — так гарнир не надоедает и легко вписывается в разное меню. Специи и зелень сюда можно брать любые любимые, под свой вкус.',
  '[
    {"name": "Картофель — 600 г", "swap": null},
    {"name": "Кабачок — 400 г", "swap": null},
    {"name": "Мука цельнозерновая — 100 г", "swap": null},
    {"name": "Мука кукурузная — 50 г", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Укроп — 30 г", "swap": null},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Орегано — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте овощи тонкими слайсами 1–2 мм."},
    {"text": "Добавьте соль и мелко порезанный укроп, перемешайте и оставьте на 20 минут, чтобы появился сок."},
    {"text": "Смешайте два вида муки и орегано."},
    {"text": "Добавьте смесь к овощам и хорошо перемешайте руками."},
    {"text": "Распределите тонким слоем на противне, застеленном пергаментом, и запекайте при 200 °C около 40 минут до золотистой корочки."}
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
VALUES ('side-potato-zucchini', 'sides')
ON CONFLICT DO NOTHING;
