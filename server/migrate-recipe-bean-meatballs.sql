-- Рецепт: Тефтели из фасоли
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория mains.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-bean-meatballs.sql
--
-- ВАЖНО: не путать с chickpea-meatballs (тефтели из нута). Это другой рецепт — белая фасоль + овсяная мука.
--
-- Замечания по контракту (strict mode):
--   * emoji='🍡' (пользователь подтвердил 2026-04-26: «эмодзи котлет» для всех котлет/тефтелек).
--   * time_min=25, time_label="25–30 минут" — диапазон в ТЗ, нижняя граница в time_min.
--   * servings=14, portion_grams=35 — ТЗ «14 тефтелек», вес «35–40 г» → нижняя граница.
--   * КБЖУ в ТЗ присутствует двумя блоками: целочисленный (~74/3/1/10/2) и дробный (~74/3,2/1,4/10,4/2,4).
--     Поля КБЖУ в БД integer — взяли целочисленный блок: 74/3/1/10/2.
--   * add_carbs / add_fiber пусты: пользователь указал «гарниры» и «все салаты» —
--     реализовано через auto_addons fromCategory ('sides' / 'salads'),
--     по тому же паттерну, что и chickpea-meatballs.
--   * Фото нет — папка images/recipes/bean-meatballs/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber, auto_addons,
  portion_grams, is_published, sort_order
) VALUES (
  'bean-meatballs',
  'mains',
  'Тефтели из фасоли',
  '🍡',
  25, '25–30 минут',
  'medium',
  14,
  false,
  74, 3, 1, 10, 2,
  ARRAY['растительное', 'без глютена', 'без яиц', 'без мяса', 'бобовые'],
  NULL,
  'Если у вас нет овсяной муки, её легко сделать дома: возьмите такое же количество овсяных хлопьев долгой варки — например, «Геркулес» — и измельчите их в блендере или кофемолке до состояния муки.',
  '[
    {"name": "Белая фасоль отварная — 500 г", "swap": null},
    {"name": "Овсяная мука — 50 г", "swap": null},
    {"name": "Лук — 1 маленький", "swap": null},
    {"name": "Морковь — 1 небольшая", "swap": null},
    {"name": "Чеснок — 1 долька", "swap": null},
    {"name": "Растительное масло — 2 ч. л.", "swap": null},
    {"name": "Орегано — 1 ч. л.", "swap": null},
    {"name": "Пищевые дрожжи — 2 ст. л.", "swap": "Можно без них"},
    {"name": "Лимонный сок — 2 ч. л.", "swap": null},
    {"name": "Сушёный лук — 0,5 ч. л.", "swap": "Можно без него"},
    {"name": "Тамари — 1 ч. л.", "swap": "Соевый соус"},
    {"name": "Соль — 1 ч. л.", "swap": null},
    {"name": "Укроп — 15 г", "swap": "Петрушка"}
  ]'::jsonb,
  '[
    {"text": "Порежьте лук, морковь и чеснок небольшими кубиками."},
    {"text": "На 1 ч. л. растительного масла обжарьте лук, чеснок и морковь в течение 2 минут."},
    {"text": "Добавьте орегано и пищевые дрожжи, перемешайте. Добавьте лимонный сок."},
    {"text": "Переложите в блендер фасоль и обжаренные овощи. Измельчите до однородной массы, но не в совсем гладкое пюре — можно оставить небольшие кусочки."},
    {"text": "Добавьте овсяную муку, зелень, тамари или соевый соус, сушёный лук и соль. Тщательно перемешайте массу."},
    {"text": "Сформируйте небольшие тефтельки."},
    {"text": "Слегка поджарьте их на сковороде на 1 ч. л. растительного масла, этот шаг можно пропустить."},
    {"text": "Выложите тефтели в форму для выпечки и отправьте в духовку при 200°C на 10–15 минут."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"carbs": {"fromCategory": "sides"}, "fiber": {"fromCategory": "salads"}}'::jsonb,
  35,
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
  auto_addons = EXCLUDED.auto_addons,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('bean-meatballs', 'mains')
ON CONFLICT DO NOTHING;
