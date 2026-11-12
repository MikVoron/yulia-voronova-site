-- Томатная овсянка.
-- Strict / docs/ai-recipe-input-contract.md. Неопубликованный Pro-черновик.
-- Применение на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-side-tomato-oatmeal-2026-11-12.sql
--
-- _filled_from_input:
--   name: Томатная овсянка;
--   id: side-tomato-oatmeal (inferred: название и явно указанный тип «гарнир»);
--   cat: sides (inferred: «сытный гарнир» во вступлении);
--   time_min: 20; time_label: NULL (одиночное значение «20 минут»);
--   difficulty: easy; servings: 4; portion_grams: 170;
--   kcal/protein/fat/carbs/fiber: 201/7/5/33/5 на одну порцию, без пересчёта;
--   tags: растительное; «без сои» убрано по уточнению пользователя;
--   main_ingredients: oats, tomatoes (есть в platform/ingredients.js);
--   ingredients: 10; мисо-паста: 15 г, swap: «Можно без неё»;
--   кнопка исключения мисо-пасты подтверждена пользователем;
--   steps: 6, исходный текст сохранён, включая пояснение об исключении мисо;
--   quote: полный исходный текст;
--   note: вступительный абзац (подтверждено пользователем).
-- _needs_clarification: []
-- _not_provided: emoji, фото, vk_video, yt_video, dzen_video,
--   диетическая разметка, КБЖУ исключаемой мисо-пасты и ручные добавки.
-- TODO: добавить фото; sort_order=0 — назначить вручную при публикации.
-- При конфликте id или названия транзакция отменяется без перезаписи рецептов.

BEGIN;

LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'side-tomato-oatmeal'
       OR name = 'Томатная овсянка'
  ) THEN
    RAISE EXCEPTION 'Recipe side-tomato-oatmeal or its name already exists; refusing to overwrite it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'sides') THEN
    RAISE EXCEPTION 'Category sides is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'oats'
      AND (name IS DISTINCT FROM 'Овсянка' OR group_id IS DISTINCT FROM 'grains')
  ) OR EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'tomatoes'
      AND (name IS DISTINCT FROM 'Томаты' OR group_id IS DISTINCT FROM 'vegetables')
  ) THEN
    RAISE EXCEPTION 'Dynamic ingredient catalog conflicts with the approved oats or tomatoes binding';
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
  'side-tomato-oatmeal',
  'sides',
  'Томатная овсянка',
  NULL,
  20, NULL, 'easy', 4, false, 'pro',
  201, 7, 5, 33, 5,
  ARRAY['растительное'],
  NULL,
  'Нежная томатная овсянка с тёплым ароматом паприки и орегано — привычная каша в новом исполнении. Она хорошо сочетается с мясом, рыбой и бобовыми, а если не хотите добавлять белок, просто посыпьте овсянку сыром, получится очень вкусно!',
  'Нежная томатная овсянка с луком, паприкой и орегано — привычная каша в новом исполнении: сытный гарнир с лёгкой копчёной ноткой.',
  '[
    {"name": "Овсяные хлопья долгой варки: 160 г", "swap": null},
    {"name": "Томаты в собственном соку (пассата): 250 г", "swap": null},
    {"name": "Лук: 1 средний", "swap": null},
    {"name": "Вода: 260 мл", "swap": null},
    {"name": "Мисо-паста: 15 г", "swap": "Можно без неё"},
    {"name": "Растительное масло: 1 ч. л.", "swap": null},
    {"name": "Сладкая паприка: ½ ч. л.", "swap": null},
    {"name": "Копчёная паприка: ⅓ ч. л.", "swap": null},
    {"name": "Орегано: 1 ч. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Мелко нарежьте лук и поджарьте его с 1 ч. л. растительного масла до мягкости около 3 минут."},
    {"text": "К луку добавьте сладкую и копчёную паприку, орегано, перемешайте в течение нескольких секунд."},
    {"text": "Влейте томаты, хорошо перемешайте и потушите около 5 минут."},
    {"text": "Добавьте овсяные хлопья и 260 мл горячей воды и варите на слабом огне 7–10 минут, периодически помешивая. Если овсянка становится слишком густой до того, как хлопья готовы, добавьте ещё немного воды."},
    {"text": "Снимите кастрюлю с огня, добавьте мисо-пасту и хорошо перемешайте до однородности. При необходимости посолите."},
    {"text": "Мисо-пасту можно не добавлять. В этом случае просто отрегулируйте соль по вкусу."}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  170, false, 0, '{}'::jsonb, false,
  ARRAY['oats', 'tomatoes']
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('side-tomato-oatmeal', 'sides');

COMMIT;

SELECT id, name, cat, is_published, access_level, emoji, photo, main_ingredients,
       time_min, time_label, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       ingredients->4 AS optional_miso,
       add_protein, add_fat, add_carbs, add_fiber, quote, note
FROM recipes WHERE id = 'side-tomato-oatmeal';
