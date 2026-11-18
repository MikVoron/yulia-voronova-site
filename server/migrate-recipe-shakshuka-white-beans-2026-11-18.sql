-- Неопубликованный завтрак № 103 и пункт «Яйца» для обеих шакшук.
-- На VPS после checkpoint и dry-run:
-- sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-shakshuka-white-beans-2026-11-18.sql
--
-- _filled_from_input:
--   name: Шакшука с белой фасолью; id: shakshuka-white-beans (из названия).
--   cat: breakfasts для обеих шакшук по уточнению пользователя.
--   25 минут, лёгкая, 4 порции по 170 г; КБЖУ и клетчатка: 173/13/8/13/3 на порцию.
--   tags: «без сои», «бобовые» (значение «бобовое» приведено к ключу фильтра).
--   main_ingredients: eggs, tomatoes, white-beans; у зелёной шакшуки добавляется eggs.
--   10 ингредиентов, включая замену фасоли; 7 шагов, цитата и вступление в note.
--   add_carbs: цельнозерновой хлеб, 1 ломтик, 70/3/0/15/3; жиры подтверждены.
-- _needs_clarification: []
-- _not_provided: emoji, фото, ссылки на видео, диетическая разметка редактора.
-- TODO: добавить фото после получения, порядок задать перед публикацией.

BEGIN;

LOCK TABLE recipes, ingredient_catalog IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'shakshuka-white-beans' OR name = 'Шакшука с белой фасолью'
  ) THEN
    RAISE EXCEPTION 'Recipe shakshuka-white-beans or its name already exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'breakfasts') THEN
    RAISE EXCEPTION 'Category breakfasts is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM recipes r
    JOIN recipe_categories rc ON rc.recipe_id = r.id AND rc.category_id = 'breakfasts'
    WHERE r.id = 'green-shakshuka'
      AND r.name IN ('Зеленая шакшука', 'Зелёная шакшука')
      AND r.cat = 'breakfasts'
  ) THEN
    RAISE EXCEPTION 'Expected green-shakshuka in breakfasts';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE (id = 'eggs' AND (name <> 'Яйца' OR group_id <> 'other'))
       OR (id <> 'eggs' AND lower(btrim(name)) = 'яйца')
       OR (id = 'tomatoes' AND (name <> 'Томаты' OR group_id <> 'vegetables'))
       OR (id = 'white-beans' AND (name <> 'Белая фасоль' OR group_id <> 'legumes'))
  ) THEN
    RAISE EXCEPTION 'Ingredient catalog conflicts with the expected eggs, tomatoes or white-beans binding';
  END IF;
END $guard$;

INSERT INTO ingredient_catalog (id, name, group_id)
VALUES ('eggs', 'Яйца', 'other')
ON CONFLICT (id) DO NOTHING;

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
  'shakshuka-white-beans', 'breakfasts', 'Шакшука с белой фасолью', NULL,
  25, NULL, 'easy', 4, false, 'pro',
  173, 13, 8, 13, 3, ARRAY['без сои', 'бобовые'], NULL,
  'Фасоль делает шакшуку более сытной и добавляет клетчатку, а сочный томатный соус с паприкой и копчёной ноткой получается ароматным и согревающим.',
  'Томатная шакшука с белой фасолью и яйцами - сытное блюдо с нежной текстурой и насыщенным томатным вкусом.',
  '[
    {"name": "Яйца: 4 шт.", "swap": null},
    {"name": "Белая фасоль отварная: 200 г", "swap": "консервированная белая фасоль"},
    {"name": "Томаты в собственном соку или пассата: 400 г", "swap": null},
    {"name": "Лук: 1 шт.", "swap": null},
    {"name": "Чеснок сушёный: ½ ч. л.", "swap": null},
    {"name": "Сладкая паприка: 1 ч. л.", "swap": null},
    {"name": "Копчёная паприка: ½ ч. л.", "swap": null},
    {"name": "Оливковое масло: 1 ст. л.", "swap": null},
    {"name": "Петрушка: 10 г", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Мелко нарежьте лук и обжарьте на оливковом масле на среднем огне около 5 минут, до мягкости."},
    {"text": "Добавьте чеснок, сладкую и копчёную паприку. Прогрейте 30 секунд, чтобы специи раскрыли аромат."},
    {"text": "Влейте томаты, разомните их лопаткой, посолите и тушите около 10 минут, чтобы соус немного загустел."},
    {"text": "Добавьте белую фасоль и готовьте ещё 5 минут."},
    {"text": "Сделайте в соусе 4 углубления и аккуратно разбейте туда яйца."},
    {"text": "Накройте крышкой и готовьте на слабом огне примерно 5–7 минут, пока белок не схватится, а желток останется жидким."},
    {"text": "Посыпьте петрушкой и подавайте сразу."}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb,
  '[{"name": "Цельнозерновой хлеб", "amount": "1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}]'::jsonb,
  '[]'::jsonb,
  170, false, 0, '{}'::jsonb, false,
  ARRAY['eggs', 'tomatoes', 'white-beans']
);

UPDATE recipes
SET main_ingredients = array_append(COALESCE(main_ingredients, ARRAY[]::text[]), 'eggs'),
    updated_at = now()
WHERE id = 'green-shakshuka'
  AND NOT COALESCE('eggs' = ANY(main_ingredients), false);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('shakshuka-white-beans', 'breakfasts')
ON CONFLICT (recipe_id, category_id) DO NOTHING;

COMMIT;

SELECT r.id, r.name, r.cat, r.is_published, r.access_level, r.photo, r.main_ingredients,
       ARRAY(SELECT category_id FROM recipe_categories WHERE recipe_id = r.id ORDER BY category_id) AS categories
FROM recipes r
WHERE r.id IN ('shakshuka-white-beans', 'green-shakshuka')
ORDER BY r.id;

SELECT id, name, group_id FROM ingredient_catalog WHERE id = 'eggs';
