-- Рецепт: Тефтели из нута с овощами
-- Обновление существующего chickpea-meatballs под новый ТЗ от 2026-04-25.
-- ВНИМАНИЕ: старый рецепт был «Тефтели из нута» (тушеные в томатной подливе с льняным «яйцом»).
-- Новый ТЗ — другой рецепт (с кабачком, кукурузой, горошком, нутовой мукой, запекание).
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-chickpea-meatballs.sql
--
-- TODO: фото пока нет — photo=null. Добавить когда появится папка images/recipes/chickpea-meatballs/.
-- portion_grams и servings: ТЗ — 20–25 тефтелек по ~30 г. Берём servings=22 (среднее), portion_grams=30.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'chickpea-meatballs',
  'cutlets',
  'Тефтели из нута с овощами',
  '🫛',
  45,
  'medium',
  22,
  false,
  80, 4, 3, 8, 3,
  ARRAY['растительное', 'без глютена', 'без сои', 'бобовые'],
  NULL,
  'Эти тефтельки получаются в стиле Икеа — маленькие, удобные и отлично подходят к гарниру. Можно добавлять любые любимые овощи: например, болгарский перец к моркови и луку или любимую зелень — рецепт легко подстраивается под то, что есть дома.',
  '[
    {"name": "Нут варёный — 400 г", "swap": "Консервированный нут — 400 г"},
    {"name": "Морковь — 2 шт.", "swap": null},
    {"name": "Кабачок — 120–150 г", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Кукуруза замороженная — 75 г", "swap": null},
    {"name": "Горошек замороженный — 80 г", "swap": null},
    {"name": "Нутовая мука — 50 г", "swap": "Овсяная мука — 50 г"},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Соевый соус — 1 ст. л.", "swap": "Можно без него"},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Куркума — 1/3 ч. л.", "swap": null},
    {"name": "Орегано — 1/2 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Натрите кабачок и очень хорошо отожмите.", "photo": null},
    {"text": "Разморозьте кукурузу и горошек, слейте воду.", "photo": null},
    {"text": "Порежьте лук, морковь и чеснок достаточно крупно.", "photo": null},
    {"text": "Измельчите овощи в комбайне.", "photo": null},
    {"text": "Обжарьте лук, морковь и чеснок 10 минут до мягкости.", "photo": null},
    {"text": "Добавьте специи и перемешайте.", "photo": null},
    {"text": "Смешайте нут с овощами, немного измельчите в комбайне.", "photo": null},
    {"text": "Добавьте кукурузу, горошек, соевый соус и соль.", "photo": null},
    {"text": "Вмешайте муку и доведите массу до консистенции, когда она мягкая, но лепится.", "photo": null},
    {"text": "Сформируйте 20–25 тефтелек.", "photo": null},
    {"text": "Разогрейте духовку до 200°C и запекайте 20–25 минут, при желании переверните.", "photo": null}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  30,
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
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('chickpea-meatballs', 'cutlets')
ON CONFLICT DO NOTHING;
