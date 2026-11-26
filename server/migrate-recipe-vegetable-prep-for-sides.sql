-- Овощная заготовка для гарниров.
-- Strict / docs/ai-recipe-input-contract.md. Неопубликованный Pro-черновик.
-- Применение на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-vegetable-prep-for-sides.sql
--
-- _filled_from_input:
--   id: vegetable-prep-for-sides (inferred from recipe name);
--   cat: bases (explicitly selected by user);
--   time_min: 35; time_label: "около 35 минут, без учёта замораживания";
--   difficulty: easy; servings: 6 cubes (recipe yield); serving unit: 1 cube;
--   nutrition per cube: 142/3/5/24/5;
--   omit olive oil: 40 kcal, 0 protein, 5 fat, 0 carbs, 0 fiber,
--     derived by subtracting the provided without-oil values from the with-oil values;
--   ingredients: 5; steps: 7; quote: provided in full;
--   note: introduction, yield, nutrition basis and preparation/storage tips;
--   main_ingredients: carrot, celery (explicitly named as primary ingredients).
-- _needs_clarification: []
-- _not_provided: emoji, portion_grams, tags, photo, video URLs,
--   dietary flags, add-ons.
-- TODO: add photos; sort_order=0 — assign manually when publishing.
-- Refuses to overwrite an existing recipe id or name.

BEGIN;

LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'vegetable-prep-for-sides'
       OR name = 'Овощная заготовка для гарниров'
  ) THEN
    RAISE EXCEPTION 'Recipe vegetable-prep-for-sides or its name already exists; refusing to overwrite it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'bases') THEN
    RAISE EXCEPTION 'Category bases is required';
  END IF;
END $guard$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free, access_level,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  vk_video, yt_video, dzen_video,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients
) VALUES (
  'vegetable-prep-for-sides',
  'bases',
  'Овощная заготовка для гарниров',
  NULL,
  35, 'около 35 минут, без учёта замораживания', 'easy', 6, false, 'pro',
  142, 3, 5, 24, 5,
  ARRAY[]::text[],
  NULL,
  'Если в вашем рационе мало овощей, такая заготовка поможет понемногу добавлять их в привычные блюда. Это удобное дополнение к гарнирам, но не замена полноценной порции овощей.',
  $note$Замороженные овощные кубики помогут быстро приготовить ароматный гарнир без необходимости каждый раз чистить и нарезать овощи. Заготовка подходит для гречки, риса, булгура, киноа, пшена, перловки и кускуса.

Выход — 6 кубиков по 125 мл. КБЖУ указано на 1 кубик.

Для замораживания овощной заготовки удобно использовать силиконовые формы с крышкой. У меня форма на 6 ячеек объёмом 125 мл каждая. Из таких форм легко доставать замороженные кубики и использовать нужное количество в зависимости от числа порций гарнира. Один овощной кубик такого объема рассчитан на 4 порции гарнира. Не добавляйте соль и специи в саму заготовку: так она останется универсальной, а вкус гарнира можно будет менять в зависимости от основного блюда. Храните до 3 месяцев при температуре −18 °C для сохранения хорошего вкуса и текстуры.$note$,
  '[
    {"name": "Морковь: 650 г", "swap": null},
    {"name": "Репчатый лук: 300 г", "swap": null},
    {"name": "Лук-порей: 200 г", "swap": null},
    {"name": "Корень сельдерея: 250 г", "swap": null},
    {"name": "Оливковое масло: 2 ст. л.", "swap": "Можно без него", "omit_nutrition": {"kcal": 40, "protein": 0, "fat": 5, "carbs": 0, "fiber": 0}}
  ]'::jsonb,
  '[
    {"text": "Вымойте и очистите овощи. У лука-порея используйте белую и нежную светло-зелёную часть."},
    {"text": "Мелко нарежьте овощи или измельчите в кухонном комбайне, сохраняя небольшие кусочки и не превращая смесь в пюре."},
    {"text": "Разогрейте масло в глубокой сковороде. Обжарьте репчатый лук и лук-порей около 7 минут. Если готовите без масла, потушите их с небольшим количеством воды."},
    {"text": "Добавьте морковь и сельдерей. Тушите без крышки около 10–15 минут, периодически перемешивая. При необходимости добавьте немного воды."},
    {"text": "Доведите овощи до полуготовности, снимите с огня и подготовьте силиконовые формы объёмом 125 мл для замораживания."},
    {"text": "Остудите смесь и распределите по формочкам."},
    {"text": "Заморозьте. После полного замораживания достаньте кубики из формочек и переложите в пакет или контейнер для хранения в морозильной камере."}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  NULL, false, 0, '{}'::jsonb, false,
  ARRAY['carrot', 'celery']
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('vegetable-prep-for-sides', 'bases')
ON CONFLICT (recipe_id, category_id) DO NOTHING;

SELECT row_to_json(recipe_check)
FROM (
  SELECT r.id, r.name, r.cat, r.is_published, r.access_level, r.photo, r.main_ingredients,
         r.time_min, r.time_label, r.difficulty, r.servings, r.portion_grams,
         r.kcal, r.protein, r.fat, r.carbs, r.fiber, r.ingredients, r.steps, r.quote, r.note,
         ARRAY(SELECT category_id FROM recipe_categories WHERE recipe_id = r.id ORDER BY category_id) AS categories
  FROM recipes r
  WHERE r.id = 'vegetable-prep-for-sides'
) AS recipe_check;

COMMIT;
