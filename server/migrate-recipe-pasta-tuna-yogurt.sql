-- Рецепт: Паста с тунцом и йогуртом
-- Новый рецепт, ТЗ от 2026-04-25 (пользователь). Кросс-ссылка на cashew-sauce в swap йогурта.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-pasta-tuna-yogurt.sql

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order
) VALUES (
  'pasta-tuna-yogurt',
  'mains',
  'Паста с тунцом и йогуртом',
  '🍝',
  25,
  'easy',
  3,
  false,
  490, 23, 6, 60, 4,
  ARRAY['рыбное', 'без сои'],
  'images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-cover.webp',
  'Старайтесь смешивать соус с пастой непосредственно перед подачей, чтобы сохранить аль денте. Для более яркого и острого вкуса можно добавить 3–5 колечек мелко нарезанного маринованного халапеньо вместе с каперсами.',
  '[
    {"name": "Паста сухая — 250 г", "swap": null},
    {"name": "Тунец в собственном соку — 2 банки (без жидкости)", "swap": null},
    {"name": "Каперсы — 2 ст. л.", "swap": null},
    {"name": "Кабачок — 1 средний", "swap": null},
    {"name": "Чеснок — 1 зубчик", "swap": null},
    {"name": "Оливковое масло — 1 ч. л.", "swap": null},
    {"name": "Йогурт — 100 г", "swap": "[Соус из кешью](cashew-sauce) — 2 ст. л."},
    {"name": "Вода от варки пасты — 5 ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Отварите пасту до состояния аль денте, сохранив немного воды от варки.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-start.webp"},
    {"text": "Мелко порежьте чеснок и каперсы, кабачок — небольшими кубиками.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-2.webp"},
    {"text": "На сковороде слегка разогрейте масло и обжарьте чеснок.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-3.webp"},
    {"text": "Добавьте кабачок и тушите до лёгкой мягкости около 5 минут.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-4.webp"},
    {"text": "Добавьте тунец и каперсы, перемешайте и прогрейте.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-5.webp"},
    {"text": "Влейте йогурт (или соус из кешью) и добавьте немного воды от пасты для кремовой текстуры.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-6.webp"},
    {"text": "Перемешайте и сразу выключите огонь.", "photo": null},
    {"text": "Введите пасту, аккуратно перемешайте и сразу подавайте.", "photo": "images/recipes/pasta-tuna-yogurt/pasta-tuna-yogurt-final.webp"}
  ]'::jsonb,
  '[]'::jsonb,
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
VALUES ('pasta-tuna-yogurt', 'mains')
ON CONFLICT DO NOTHING;
