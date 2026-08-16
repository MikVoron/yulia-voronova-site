-- Recipes 59-63 from user text.
-- strict / No Guessing. Follow-up clarifications from 2026-06-13 are encoded:
--   * salad-radish-kohlrabi-cucumber-yogurt: base version uses yogurt, so it is not tagged as plant-based;
--     cashew sauce replacement has explicit KBZHU in swap_nutrition.
--   * salad-radish-kohlrabi-cucumber-yogurt and vegetable-plate have no main_ingredients.
--   * vegetable-plate belongs to salads; once published, it participates in category-based fiber auto-addons.
--   * missing KBZHU values for vegetable-plate are stored as 0; fiber is 3.
--   * oat-pancakes protein add-ons use fiber=0 as confirmed.
-- Apply:
--   scp server/migrate-recipes-59-63-cutlets-salads-pancakes-main-2026-06-13.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipes-59-63-cutlets-salads-pancakes-main-2026-06-13.sql"

BEGIN;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, is_soup, main_ingredients,
  dietary_flags, dietary_verified
) VALUES (
  'cutlets-salmon-cod-broccoli',
  'cutlets',
  'Котлеты из сёмги, трески и брокколи',
  NULL,
  35,
  NULL,
  'easy',
  9,
  false,
  145, 16.5, 7.0, 2.5, 0.8,
  ARRAY['рыбное', 'без глютена'],
  NULL,
  'Лёгкие и нежные котлеты с мягким вкусом. Треска и семга дают хороший белок и полезные жиры, а брокколи делает текстуру сочнее и добавляет овощей в рацион. Нравятся детям — мягкие, без выраженного рыбного вкуса.',
  NULL,
  '[
    {"name": "Треска (филе): 300 г", "swap": null},
    {"name": "Сёмга (филе): 300 г", "swap": null},
    {"name": "Брокколи: 200 г", "swap": null},
    {"name": "Репчатый лук: 1 небольшой", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Укроп и петрушка: 30 г", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разберите брокколи на соцветия. Отварите в кипящей воде 3 минуты, затем откиньте на дуршлаг и полностью остудите."},
    {"text": "Измельчите сёмгу, треску, брокколи и лук в комбайне или пропустите через мясорубку."},
    {"text": "Добавьте мелко порезанную зелень и соль. Перемешайте."},
    {"text": "Сформируйте котлеты, выложите на противень с бумагой для выпечки и запекайте при 180 °C 20–25 минут."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  80,
  false,
  0,
  false,
  ARRAY['salmon', 'cod'],
  ARRAY[]::text[],
  false
),
(
  'salad-radish-kohlrabi-cucumber-yogurt',
  'salads',
  'Салат из редиса, кольраби и огурца с йогуртовой заправкой',
  NULL,
  10,
  NULL,
  'easy',
  2,
  false,
  68, 3, 4, 6, 2,
  ARRAY[]::text[],
  NULL,
  NULL,
  NULL,
  '[
    {"name": "Кольраби: 120 г", "swap": null},
    {"name": "Огурец: 120 г", "swap": null},
    {"name": "Редис: 100 г", "swap": null},
    {"name": "Зелёный лук: 10 г", "swap": null},
    {"name": "Укроп: 10 г", "swap": null},
    {
      "name": "Йогурт средней жирности: 40 г",
      "swap": "[Соус из кешью](cashew-sauce): 40 г",
      "dietary_flags": ["milk"],
      "swap_options": [
        {"name": "Соус из кешью", "dietary_flags": ["nuts"]}
      ],
      "swap_nutrition": {
        "original": {"kcal": 28, "protein": 1, "fat": 2, "carbs": 2, "fiber": 0},
        "replacement": {"kcal": 117, "protein": 4, "fat": 9, "carbs": 7, "fiber": 1}
      }
    },
    {"name": "Тамари: 1 ч. л.", "swap": "Соевый соус: 1 ч. л."},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Кольраби нарежьте небольшими кусочками или натрите на тёрке."},
    {"text": "Огурец нарежьте полукружьями, редис — тонкими кружочками."},
    {"text": "Добавьте мелко нарезанные укроп и зелёный лук."},
    {"text": "Смешайте йогурт, тамари и оливковое масло."},
    {"text": "Заправьте салат непосредственно перед подачей."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  150,
  false,
  0,
  false,
  ARRAY[]::text[],
  ARRAY['milk'],
  true
),
(
  'vegetable-plate',
  'salads',
  'Овощная тарелка',
  NULL,
  5,
  NULL,
  'easy',
  1,
  false,
  0, 0, 0, 0, 3,
  ARRAY['растительное', 'без глютена', 'без сои'],
  NULL,
  'Простая овощная тарелка - удобный способ добавить в рацион больше клетчатки, объёма и разнообразия. Меняйте овощи по сезону и собирайте тарелку из того, что вам нравится.',
  'Хорошая база: листья салата, огурец, редис, морковь, сладкий перец, сельдерей, томаты, кольраби, брокколи, любая зелень.',
  '[
    {"name": "Любые сырые овощи и зелень по сезону", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте овощи удобными для еды кусочками."},
    {"text": "Выложите на тарелку в произвольном порядке."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  200,
  false,
  0,
  false,
  ARRAY[]::text[],
  ARRAY[]::text[],
  false
),
(
  'oat-pancakes',
  'pancakes',
  'Оладьи из овсянки',
  NULL,
  20,
  NULL,
  'easy',
  4,
  false,
  235, 8.0, 4, 39.0, 5.0,
  ARRAY['растительное', 'без глютена'],
  NULL,
  'Если нет овсяной муки, можно просто перемолоть овсянку долгой варки в блендере. Получаются мягкие, сытные оладьи с приятным овсяным вкусом — хороший вариант для завтрака или перекуса.',
  '1 порция = 3 оладья',
  '[
    {"name": "Овсяная мука: 270 г", "swap": null},
    {"name": "Соевое молоко: 320 г", "swap": null},
    {"name": "Разрыхлитель: 1 ч. л.", "swap": null},
    {"name": "Мёд: 1 ст. л.", "swap": "Спелый банан: 1 шт."}
  ]'::jsonb,
  '[
    {"text": "Смешайте овсяную муку и разрыхлитель."},
    {"text": "Добавьте соевое молоко и мёд или размятый банан."},
    {"text": "Перемешайте до однородного теста и дайте ему постоять 5 минут."},
    {"text": "Выпекайте оладьи на хорошо разогретой сковороде с антипригарным покрытием, предварительно слегка смазав её небольшим количеством растительного масла, по 2–3 минуты с каждой стороны."}
  ]'::jsonb,
  '[
    {"name": "Йогурт 2–5%", "amount": "150 г", "kcal": 95, "protein": 7.5, "fat": 2.5, "carbs": 10.5, "fiber": 0},
    {"name": "Творог 5%", "amount": "100 г", "kcal": 121, "protein": 17, "fat": 5, "carbs": 3, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[
    {"name": "Ягоды", "amount": "80 г", "kcal": 32, "protein": 1, "fat": 0, "carbs": 7, "fiber": 3}
  ]'::jsonb,
  NULL,
  false,
  0,
  false,
  ARRAY[]::text[],
  ARRAY[]::text[],
  false
),
(
  'bulgur-chicken-red-lentils',
  'mains',
  'Булгур с курицей, красной чечевицей и овощами',
  NULL,
  45,
  NULL,
  'medium',
  4,
  false,
  380, 29, 6, 42, 8,
  ARRAY['без сои', 'бобовые'],
  NULL,
  'Сытное и вкусное блюдо на каждый день - здесь есть и белок, и сложные углеводы, и клетчатка. Булгур и красная чечевица делают текстуру рассыпчатой и нежной одновременно, а курица добавляет блюду питательности и хорошо насыщает.',
  NULL,
  '[
    {"name": "Куриная грудка: 500 г", "swap": "Индейка: 500 г"},
    {"name": "Булгур (сухой): 150 г", "swap": null},
    {"name": "Красная чечевица (сухая): 80 г", "swap": null},
    {"name": "Лук репчатый: 1 шт.", "swap": null},
    {"name": "Морковь: 1 шт.", "swap": null},
    {"name": "Сельдерей: 2 стебля", "swap": null},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Паприка сладкая: 1 ч. л.", "swap": null},
    {"name": "Чеснок сухой: 1/2 ч. л.", "swap": null},
    {"name": "Вода: 600 мл", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Лук, морковь и сельдерей мелко нарежьте или натрите на мелкой тёрке."},
    {"text": "В глубокой сковороде или сотейнике разогрейте масло и обжарьте лук около 3 минут."},
    {"text": "Добавьте морковь и сельдерей и обжарьте ещё 5 минут."},
    {"text": "Добавьте специи, перемешайте."},
    {"text": "Куриное филе нарежьте небольшими кубиками, добавьте к овощам и готовьте 3–4 минуты, пока кусочки не побелеют."},
    {"text": "Булгур и чечевицу промойте, добавьте к курице и овощам, перемешайте."},
    {"text": "Влейте воду, доведите до кипения, накройте крышкой и готовьте на минимальном огне около 20 минут."},
    {"text": "Выключите нагрев и оставьте под крышкой ещё на 10 минут."}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  350,
  false,
  0,
  false,
  ARRAY['red-lentils', 'chicken'],
  ARRAY[]::text[],
  false
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
  dietary_flags = EXCLUDED.dietary_flags,
  dietary_verified = EXCLUDED.dietary_verified,
  updated_at = now();

DELETE FROM recipe_categories
WHERE recipe_id IN (
  'cutlets-salmon-cod-broccoli',
  'salad-radish-kohlrabi-cucumber-yogurt',
  'vegetable-plate',
  'oat-pancakes',
  'bulgur-chicken-red-lentils'
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES
  ('cutlets-salmon-cod-broccoli', 'cutlets'),
  ('salad-radish-kohlrabi-cucumber-yogurt', 'salads'),
  ('vegetable-plate', 'salads'),
  ('oat-pancakes', 'pancakes'),
  ('bulgur-chicken-red-lentils', 'mains');

COMMIT;
