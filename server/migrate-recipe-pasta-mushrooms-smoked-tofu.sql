-- Рецепт: Паста с грибами и копчёным тофу
-- Новый неопубликованный рецепт. Strict / No Guessing: docs/ai-recipe-input-contract.md.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-pasta-mushrooms-smoked-tofu.sql
--
-- Фото будут добавлены позже: photo=NULL, шаги пока без photo.
-- sort_order=0 — назначить вручную при публикации.
-- Теги и диетические признаки не указаны автором, поэтому не задаются.

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  main_ingredients, portion_grams, is_published, sort_order
) VALUES (
  'pasta-mushrooms-smoked-tofu',
  'mains',
  'Паста с грибами и копчёным тофу',
  NULL,
  30,
  NULL,
  'medium',
  3,
  false,
  610, 29, 11, 88, 8,
  ARRAY[]::text[],
  NULL,
  NULL,
  '[
    {"name": "Копчёный тофу: 190 г", "swap": null},
    {"name": "Цельнозерновая паста: 250 г", "swap": null},
    {"name": "Шампиньоны: 300 г", "swap": null},
    {"name": "Репчатый лук: 1 шт.", "swap": null},
    {"name": "Чеснок: 2 зубчика", "swap": null},
    {"name": "Тимьян сушёный: 1 ч. л.", "swap": null},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null},
    {"name": "Вода от варки пасты: 120–150 мл", "swap": null},
    {"name": "Петрушка: 12 г", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Отварите пасту до состояния аль денте. Сохраните 120–150 мл воды от варки."},
    {"text": "Нарежьте шампиньоны пластинками толщиной около 5 мм или кубиками, лук и тофу — мелкими кубиками, чеснок — мелко."},
    {"text": "Разогрейте сковороду. Добавьте оливковое масло и обжарьте лук 3–4 минуты до мягкости."},
    {"text": "Добавьте шампиньоны и готовьте 7–8 минут, пока грибы слегка не подрумянятся."},
    {"text": "Добавьте чеснок и тимьян, перемешайте и готовьте ещё около 30 секунд, чтобы специи раскрыли аромат."},
    {"text": "Заберите со сковороды примерно 2/3 грибов, переложите в чашу блендера, добавьте 120–150 мл воды от варки пасты и измельчите до гладкого кремового соуса."},
    {"text": "Верните грибной соус на сковороду к оставшимся 1/3 грибов."},
    {"text": "Добавьте кубики копчёного тофу, соль и петрушку. Аккуратно перемешайте и прогрейте всё вместе около 5 минут."},
    {"text": "Добавьте пасту, ещё раз перемешайте и подавайте сразу после приготовления."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  ARRAY['mushrooms', 'tofu'],
  NULL,
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
  main_ingredients = EXCLUDED.main_ingredients,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('pasta-mushrooms-smoked-tofu', 'mains')
ON CONFLICT DO NOTHING;
