-- Рецепт: Суп из чечевицы с овощами
-- Новый рецепт, ТЗ от 2026-04-26 (пользователь). Категория mains, is_soup=true.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-red-lentil-vegetable-soup.sql
--
-- Замечания по контракту (strict mode):
--   * emoji='🥣' (подтверждено пользователем 2026-04-26).
--   * time_label не задан: «40 минут» — одиночное значение, time_label=null,
--     фронт сам соберёт «40 мин» из time_min.
--   * add_protein: «50 г белого мяса — 16 г белка, 80 ккал» и «100 г тофу — 10 г белка, 70 ккал»
--     даны без жиров/углеводов/клетчатки — оставлены 0 (пользователь не указал).
--   * add_carbs пуст: хлеб + сухарики прилетают автоматом через is_soup=true (как в borscht / mung-bean-soup).
--   * Фото нет — папка images/recipes/red-lentil-vegetable-soup/ отсутствует, photo=null.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  is_soup, portion_grams, is_published, sort_order
) VALUES (
  'red-lentil-vegetable-soup',
  'mains',
  'Суп из чечевицы с овощами',
  '🥣',
  40,
  'medium',
  8,
  false,
  179, 10, 2, 31, 6,
  ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  NULL,
  'Если вы только начинаете знакомство с бобовыми, красная чечевица — один из самых удачных вариантов: она мягкая, нежная, быстро варится и легко превращается в бархатистый суп. Благодаря этому блюдо получается уютным, сытным и совсем не тяжёлым по ощущению.',
  '[
    {"name": "Красная чечевица — 300 г", "swap": null},
    {"name": "Лук — 1 средний", "swap": null},
    {"name": "Морковь — 2 средние", "swap": null},
    {"name": "Картофель — 1 шт.", "swap": null},
    {"name": "Сельдерей — 2 палочки", "swap": null},
    {"name": "Чеснок — 2 зубчика", "swap": null},
    {"name": "Лимонный сок — 1 ст. л.", "swap": null},
    {"name": "Цедра лимона — 1 ч. л.", "swap": null},
    {"name": "Соль — 2 ч. л.", "swap": null},
    {"name": "Паприка — 1 ч. л.", "swap": null},
    {"name": "Кориандр — 1 ч. л.", "swap": null},
    {"name": "Тимьян — 0,5 ч. л.", "swap": null},
    {"name": "Куркума — 0,5 ч. л.", "swap": null},
    {"name": "Растительное масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 2,5 л", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Мелко нарежьте лук, морковь, сельдерей и чеснок."},
    {"text": "Обжарьте лук на растительном масле 1 минуту."},
    {"text": "Добавьте морковь и сельдерей, перемешайте и тушите около 5 минут."},
    {"text": "Добавьте специи и перемешайте."},
    {"text": "Засыпьте промытую чечевицу, картофель, порезанный на кубики, залейте водой."},
    {"text": "Дождитесь закипания и варите до готовности чечевицы примерно 20–25 минут."},
    {"text": "В конце посолите и добавьте лимонный сок."}
  ]'::jsonb,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 0, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "100 г", "kcal": 70, "protein": 10, "fat": 0, "carbs": 0, "fiber": 0},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  true,
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
  is_soup = EXCLUDED.is_soup,
  portion_grams = EXCLUDED.portion_grams,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('red-lentil-vegetable-soup', 'mains')
ON CONFLICT DO NOTHING;
