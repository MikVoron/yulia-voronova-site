-- Recipes 56-58 from user text: white-bean toast, red-lentil spread, red-lentil toast.
-- strict / No Guessing. Source fields are taken only from the provided text.
-- Apply:
--   scp server/migrate-recipes-56-58-spreads-toasts-2026-06-13.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipes-56-58-spreads-toasts-2026-06-13.sql"
--
-- TODO after photos are provided:
--   toast-white-bean-spread -> images/recipes/toast-white-bean-spread/toast-white-bean-spread-cover.webp
--   spread-red-lentil -> images/recipes/spread-red-lentil/spread-red-lentil-cover.webp
--   toast-red-lentil-spread -> images/recipes/toast-red-lentil-spread/toast-red-lentil-spread-cover.webp

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup, main_ingredients
) VALUES (
  'toast-white-bean-spread',
  'breakfasts',
  'Тост с паштетом из белой фасоли',
  NULL,
  5,
  NULL,
  'easy',
  1,
  false,
  120, 7, 3, 21, 5,
  ARRAY['растительное', 'без сои', 'бобовые'],
  NULL,
  'Разнообразьте свой завтрак новыми бутербродами — приготовьте паштет из белой фасоли. У него нежный, мягкий вкус, который нравится даже тем, кто не любит бобовые. Фасоль даёт белок и клетчатку, а кунжутная паста (тахини) — полезные жиры. В сочетании с цельнозерновым хлебом получится сбалансированный и вкусный завтрак.',
  NULL,
  '[
    {"name": "Цельнозерновой хлеб: 25 г", "swap": null},
    {"name": "[Паштет из белой фасоли](spread-white-bean): 50 г", "swap": null},
    {"name": "Зелень — по желанию", "swap": null},
    {"name": "Острый перец — по желанию", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Намажьте на хлеб паштет из белой фасоли, украсьте сверху любимой зеленью и посыпьте острым перцем при желании."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  75,
  false,
  0,
  false,
  ARRAY['white-beans']
),
(
  'spread-red-lentil',
  'spreads',
  'Паштет из красной чечевицы',
  NULL,
  20,
  NULL,
  'easy',
  6,
  false,
  152, 8.2, 3.2, 24.5, 4.6,
  ARRAY['растительное', 'без сои', 'бобовые', 'без глютена'],
  NULL,
  'Для разнообразия бобовых намазок этот паштет отлично подходит - он получается нежным, кремовым и чуть сладковатым за счёт красной чечевицы, с лёгкой ореховой ноткой тахини, пикантным чесноком и яркостью вяленых томатов. Если уменьшить воду до 350 мл - паштет будет гуще.',
  NULL,
  '[
    {"name": "Красная чечевица, сырая: 200 г", "swap": null},
    {"name": "Вода: 400 мл", "swap": null},
    {"name": "Вяленые томаты в масле: 80 г", "swap": null},
    {"name": "Чеснок: 2 зубчика", "swap": null},
    {"name": "Тахини: 1 ст. л.", "swap": null},
    {"name": "Паприка: 1 ч. л.", "swap": null},
    {"name": "Соль: 1/2 ч. л.", "swap": null},
    {"name": "Сок лимона — по вкусу", "swap": null},
    {"name": "Острый чили перец — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Промойте чечевицу и отварите в 400 мл воды до мягкости, около 10 минут."},
    {"text": "Если томаты крупные, разрежьте их пополам."},
    {"text": "Не сливая воду, пробейте охлаждённую чечевицу с оставшейся жидкостью, тахини, вяленые томаты, чеснок, паприку и соль в блендере до гладкости."},
    {"text": "По вкусу добавьте сок лимона и острый чили перец."},
    {"text": "Если хотите паштет гуще, варите чечевицу в 300–350 мл воды."},
    {"text": "Подавайте как намазку к хлебцам, овощам или в составе закусочного блюда."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  50,
  false,
  0,
  false,
  ARRAY['red-lentils']
),
(
  'toast-red-lentil-spread',
  'breakfasts',
  'Тост с паштетом из красной чечевицы',
  NULL,
  5,
  NULL,
  'easy',
  1,
  false,
  217, 10.7, 4.0, 37.0, 6.1,
  ARRAY['растительное', 'без сои', 'бобовые'],
  NULL,
  'Разнообразьте свой завтрак новыми тостами — намажьте на цельнозерновой хлеб паштет из красной чечевицы. У него нежный, кремовый и чуть сладковатый вкус, с лёгкой ореховой ноткой тахини и яркостью вяленых томатов; чечевица даёт много белка и клетчатки, а тахини — полезные жиры. В сочетании с цельнозерновым хлебом получается сбалансированный, вкусный и растительный завтрак.',
  NULL,
  '[
    {"name": "Цельнозерновой хлеб: 25 г", "swap": null},
    {"name": "[Паштет из красной чечевицы](spread-red-lentil): 50 г", "swap": null},
    {"name": "Зелень — по желанию", "swap": null},
    {"name": "Острый перец — по желанию", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Намажьте на хлеб паштет из красной чечевицы."},
    {"text": "Украсьте сверху любимой зеленью."},
    {"text": "При желании посыпьте острым перцем."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  75,
  false,
  0,
  false,
  ARRAY['red-lentils']
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
  note = EXCLUDED.note,
  ingredients = EXCLUDED.ingredients,
  steps = EXCLUDED.steps,
  add_protein = EXCLUDED.add_protein,
  add_fat = EXCLUDED.add_fat,
  add_carbs = EXCLUDED.add_carbs,
  add_fiber = EXCLUDED.add_fiber,
  portion_grams = EXCLUDED.portion_grams,
  is_published = EXCLUDED.is_published,
  sort_order = EXCLUDED.sort_order,
  is_soup = EXCLUDED.is_soup,
  main_ingredients = EXCLUDED.main_ingredients,
  updated_at = now();

DELETE FROM recipe_categories
WHERE recipe_id IN ('toast-white-bean-spread', 'spread-red-lentil', 'toast-red-lentil-spread');

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES
  ('toast-white-bean-spread', 'breakfasts'),
  ('spread-red-lentil', 'spreads'),
  ('toast-red-lentil-spread', 'breakfasts');

COMMIT;
