-- Рецепт: Паста с томатами и запечёнными перцами
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория mains.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-pasta-tomato-roasted-peppers.sql
--
-- TODO: фото нет — папка images/recipes/pasta-tomato-roasted-peppers/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'pasta-tomato-roasted-peppers',
  'mains',
  'Паста с томатами и запечёнными перцами',
  '🍝',
  35,
  'easy',
  3,
  false,
  387, 10, 4, 73, 5,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Рекомендую перемешивать пасту с соусом непосредственно перед подачей, так паста останется al dente. Если не едите сыр, используйте неактивные пищевые дрожжи: они дают сырный привкус и делают блюдо более белковым.',
  '[
    {"name": "Паста сухая — 250 г", "swap": null},
    {"name": "Красный лук — 1 шт.", "swap": "Обычный лук"},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Болгарский перец — 2 шт. (лучше красные)", "swap": null},
    {"name": "Грибы — 2–4 шт.", "swap": null},
    {"name": "Томаты в собственном соку — 1 банка", "swap": null},
    {"name": "Паприка — 0,5 ч. л. (лучше копчёная)", "swap": null},
    {"name": "Острая паприка — 0,5 ч. л.", "swap": "Можно без неё"},
    {"name": "Соль — 0,5 ч. л.", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Помойте перец и грибы, выложите их целиком на противень с пергаментом и запекайте в духовке при 180 °C до готовности перцев, примерно 20–25 минут.", "photo": null},
    {"text": "Отварите пасту до состояния al dente.", "photo": null},
    {"text": "Остудите запечённые овощи.", "photo": null},
    {"text": "Мелко нарежьте лук и чеснок.", "photo": null},
    {"text": "Снимите кожуру с перцев, удалите семечки, затем нарежьте перец и грибы на средние кусочки.", "photo": null},
    {"text": "На оливковом масле обжарьте лук несколько секунд, добавьте специи и перемешайте.", "photo": null},
    {"text": "Добавьте грибы и перец, перемешайте.", "photo": null},
    {"text": "Добавьте томаты в собственном соку и соль, перемешайте и тушите овощи около 7 минут.", "photo": null},
    {"text": "Добавьте в сковороду отваренную пасту и перемешайте.", "photo": null},
    {"text": "Подавайте, посыпав пармезаном или неактивными пищевыми дрожжами.", "photo": null}
  ]'::jsonb,
  '[
    {"name": "Пармезан", "amount": "15 г", "kcal": 59, "protein": 6, "fat": 4, "carbs": 1, "fiber": 0},
    {"name": "Неактивные пищевые дрожжи", "amount": "10 г", "kcal": 40, "protein": 5, "fat": 0, "carbs": 3, "fiber": 2}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  false,
  0
)
ON CONFLICT (id) DO UPDATE SET
  cat = EXCLUDED.cat,
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  time_min = EXCLUDED.time_min,
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
VALUES ('pasta-tomato-roasted-peppers', 'mains')
ON CONFLICT DO NOTHING;
