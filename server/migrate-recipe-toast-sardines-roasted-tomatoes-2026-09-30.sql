-- Тосты с сардинами и печёными томатами.
-- Неопубликованный Pro-черновик; strict / docs/ai-recipe-input-contract.md.
-- Применить на VPS из каталога с файлом:
-- sudo -u postgres psql -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-toast-sardines-roasted-tomatoes-2026-09-30.sql
--
-- _filled_from_input:
--   name: Тосты с сардинами и печёными томатами;
--   id: toast-sardines-roasted-tomatoes (из названия);
--   cat: breakfasts (подтверждено); time_min: 30; difficulty: easy;
--   servings: 4; portion_grams: 145; kcal/protein/fat/carbs/fiber: 225/16/7/24/4;
--   ingredients: 10; steps: 7; quote: полная авторская цитата;
--   main_ingredients: sardines, tomatoes (подтверждено; сардины — новый ингредиент);
--   dietary_flags: fish, gluten (сардины; глютен подтверждён автором);
--   photo: NULL; steps[].photo: true (фото будут позже, по контракту §2.3).
-- _needs_clarification: []
-- _not_provided: emoji, tags, note, vk_video, yt_video, dzen_video,
--   замены ингредиентов, добавки — пустые значения, без выдуманных данных.
-- Вступление для будущего анонса намеренно не включено в карточку.
-- TODO: добавить фото; sort_order=0 — назначить вручную при публикации.
-- Повторное применение сохраняет существующий рецепт и его будущие фото.

BEGIN;

DO $catalog_guard$
DECLARE
  existing_name TEXT;
  existing_group_id TEXT;
BEGIN
  SELECT name, group_id
  INTO existing_name, existing_group_id
  FROM ingredient_catalog
  WHERE id = 'sardines';

  IF FOUND THEN
    IF existing_name IS DISTINCT FROM 'Сардины' OR existing_group_id IS DISTINCT FROM 'fish' THEN
      RAISE EXCEPTION 'Ingredient id sardines already belongs to % in group %', existing_name, existing_group_id;
    END IF;
  ELSE
    INSERT INTO ingredient_catalog (id, name, group_id, sort_order)
    VALUES ('sardines', 'Сардины', 'fish', 1000);
  END IF;
END $catalog_guard$;

DO $recipe_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'toast-sardines-roasted-tomatoes'
      AND (name IS DISTINCT FROM 'Тосты с сардинами и печёными томатами'
           OR cat IS DISTINCT FROM 'breakfasts')
  ) THEN
    RAISE EXCEPTION 'Recipe id toast-sardines-roasted-tomatoes already belongs to another recipe or category';
  END IF;
END $recipe_guard$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free, access_level,
  kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote, note,
  ingredients, steps,
  vk_video, yt_video, dzen_video,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients, dietary_flags, dietary_verified
) VALUES (
  'toast-sardines-roasted-tomatoes',
  'breakfasts',
  'Тосты с сардинами и печёными томатами',
  NULL,
  30,
  NULL,
  'easy',
  4,
  false,
  'pro',
  225, 16, 7, 24, 4,
  ARRAY[]::text[],
  NULL,
  NULL,
  'Сардины придают этим тостам насыщенный вкус и добавляют белок и омега-3 жирные кислоты. А если выбрать сардины с мягкими съедобными косточками, они станут ещё и источником кальция.',
  NULL,
  '[
    {"name": "Цельнозерновой хлеб: 200 г", "swap": null, "dietary_flags": ["gluten"]},
    {"name": "Сардины без жидкости: 140 г", "swap": null, "dietary_flags": ["fish"]},
    {"name": "Помидоры: 2 средних", "swap": null},
    {"name": "Красный лук: ½ средней луковицы", "swap": null},
    {"name": "Оливковое масло: 1 ч. л.", "swap": null},
    {"name": "Дижонская горчица: 1 ч. л.", "swap": null},
    {"name": "Лимонный сок: 1 ч. л.", "swap": null},
    {"name": "Петрушка: 10 г", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null},
    {"name": "Соль: щепотка", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте помидоры кружочками толщиной 1–1,5 см, а красный лук — тонкими четверть-кольцами.", "photo": true},
    {"text": "Выложите помидоры и лук в форму или на противень. Добавьте оливковое масло, немного чёрного перца и щепотку соли. Осторожно перемешайте, чтобы масло распределилось по овощам.", "photo": true},
    {"text": "Запекайте 15–20 минут при температуре 220 °C в режиме «верх-низ», пока помидоры не станут мягкими и слегка не подрумянятся по краям, но ещё будут держать форму.", "photo": true},
    {"text": "Слейте жидкость с сардин, переложите их в миску и слегка разомните вилкой.", "photo": true},
    {"text": "Достаньте помидоры и лук из духовки, сбрызните лимонным соком и аккуратно перемешайте.", "photo": true},
    {"text": "Подсушите хлеб до лёгкого хруста или в тостере. Тонко смажьте каждый тост дижонской горчицей, выложите печёные помидоры с луком.", "photo": true},
    {"text": "Аккуратно выложите на помидоры сардины и посыпьте мелко нарезанной петрушкой.", "photo": true}
  ]'::jsonb,
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  145,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['sardines', 'tomatoes'],
  ARRAY['fish', 'gluten'],
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('toast-sardines-roasted-tomatoes', 'breakfasts')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, photo, main_ingredients,
       dietary_flags, dietary_verified, servings, portion_grams,
       kcal, protein, fat, carbs, fiber,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count
FROM recipes
WHERE id = 'toast-sardines-roasted-tomatoes';

SELECT id, name, group_id, sort_order
FROM ingredient_catalog
WHERE id = 'sardines';
