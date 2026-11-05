-- Чечевичные кексы с морковью и петрушкой.
-- Strict / docs/ai-recipe-input-contract.md. Неопубликованный Pro-черновик.
-- Применение на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-muffins-red-lentil-carrot-parsley-2026-11-05.sql
--
-- _filled_from_input:
--   id: muffins-red-lentil-carrot-parsley (inferred: название и тип блюда);
--   name: Чечевичные кексы с морковью и петрушкой;
--   cat: breads; раздел «Хлеб и Крекеры» переименовать в «Выпечка»;
--   существующий id раздела и все прежние привязки остаются прежними;
--   time_min: 40; time_label: около 40 минут плюс замачивание;
--   difficulty: easy; servings: 5 (предварительно подтверждено пользователем);
--   portion_grams: 100; 1 порция: 2 кекса;
--   kcal/protein/fat/carbs/fiber: 93/7/1/15/3 на порцию из 2 кексов;
--   tags: растительное, без сои, бобовое (подтверждены пользователем);
--   main_ingredients: red-lentils, carrot (есть в platform/ingredients.js);
--   ingredients: 12; steps: 8, полный исходный текст;
--   quote: полный исходный текст;
--   note: вступление, описание порции и полный блок «Важно при приготовлении»;
--   лён вместо яйца указан только в note, без swap/swap_options,
--   интерактивных замен, пересчёта КБЖУ или изменения диетических фильтров.
-- _needs_clarification: []
-- _not_provided: emoji, фото, vk_video, yt_video, dzen_video,
--   диетическая разметка (проверяется отдельно в редакторе).
-- TODO: уточнить у автора общее число порций; пока сохранено подтверждённое 5.
-- TODO: добавить фото; sort_order=0 — назначить вручную при публикации.
-- Все старые рецепты, их категории и ссылки сохраняются.
-- При конфликте или повторном запуске вся транзакция отменяется.

BEGIN;

LOCK TABLE categories, recipes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'muffins-red-lentil-carrot-parsley'
       OR name = 'Чечевичные кексы с морковью и петрушкой'
  ) THEN
    RAISE EXCEPTION 'Recipe muffins-red-lentil-carrot-parsley or its name already exists; refusing to overwrite it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM categories
    WHERE id = 'breads'
      AND lower(name) IN ('хлеб и крекеры', 'выпечка')
  ) OR EXISTS (
    SELECT 1 FROM categories
    WHERE id <> 'breads' AND lower(name) = 'выпечка'
  ) THEN
    RAISE EXCEPTION 'Category breads / Выпечка conflicts with the expected category; inspect before applying';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'red-lentils'
      AND (name IS DISTINCT FROM 'Красная чечевица' OR group_id IS DISTINCT FROM 'legumes')
  ) OR EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'carrot'
      AND (name IS DISTINCT FROM 'Морковь' OR group_id IS DISTINCT FROM 'vegetables')
  ) THEN
    RAISE EXCEPTION 'Dynamic ingredient catalog conflicts with the approved red-lentils or carrot binding';
  END IF;
END $guard$;

UPDATE categories SET name = 'Выпечка' WHERE id = 'breads';

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
  'muffins-red-lentil-carrot-parsley',
  'breads',
  'Чечевичные кексы с морковью и петрушкой',
  NULL,
  40, 'около 40 минут плюс замачивание', 'easy', 5, false, 'pro',
  93, 7, 1, 15, 3,
  ARRAY['растительное', 'без сои', 'бобовое'],
  NULL,
  'Морковь, свежая петрушка и тёплые специи превращают простую чечевицу в мягкие и вкусные кексы - сытно, по-домашнему и совсем не скучно.',
  'Мягкие кексы из красной чечевицы с морковью, петрушкой и тёплыми специями — без муки, с приятным вкусом.

1 порция: 2 кекса, 100 г

Если хотите приготовить без яйца, то смешайте 10 г молотых семян льна с 30 мл воды и оставьте на 10 минут. Добавьте получившуюся смесь вместо яйца. При необходимости при измельчении чечевицы добавьте ещё немного воды, так как вариант с льном может получиться более густым.',
  '[
    {"name": "Красная чечевица: 200 г", "swap": null},
    {"name": "Яйцо: 1 шт.", "swap": null},
    {"name": "Вода: 80 г", "swap": null},
    {"name": "Морковь: 100 г", "swap": null},
    {"name": "Петрушка: 15 г", "swap": null},
    {"name": "Луковый порошок: 1 ч. л.", "swap": null},
    {"name": "Чесночный порошок: ¼ ч. л.", "swap": null},
    {"name": "Сладкая паприка: ½ ч. л.", "swap": null},
    {"name": "Копчёная паприка: ½ ч. л.", "swap": null},
    {"name": "Куркума: ¼ ч. л.", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Разрыхлитель: 1½ ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Замочите чечевицу минимум на 3 часа, можно на ночь, хорошо промойте и полностью слейте воду."},
    {"text": "Переложите чечевицу в блендер, добавьте яйцо и 80 г воды. Пробейте до максимально гладкой массы. Тесто должно быть густым, но легко набираться ложкой и медленно с неё сползать. Если масса слишком плотная, добавьте ещё 10–15 г воды."},
    {"text": "Морковь мелко натрите, петрушку мелко нарежьте."},
    {"text": "Добавьте к чечевичной массе морковь, петрушку, луковый и чесночный порошок, сладкую и копчёную паприку, куркуму, соль и разрыхлитель."},
    {"text": "Тщательно перемешайте ингредиенты."},
    {"text": "Разложите тесто по формочкам, заполняя их примерно на ¾ объёма."},
    {"text": "Выпекайте при 180 °C 25–30 минут, до лёгкого подрумянивания."},
    {"text": "После выпечки оставьте кексы в форме на 2–3 минуты, затем аккуратно достаньте и полностью остудите на решётке."}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  100, false, 0, '{}'::jsonb, false,
  ARRAY['red-lentils', 'carrot']
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('muffins-red-lentil-carrot-parsley', 'breads');

COMMIT;

SELECT id, name FROM categories WHERE id = 'breads';

SELECT id, name, cat, servings, portion_grams, time_min, time_label, difficulty,
       kcal, protein, fat, carbs, fiber, tags, main_ingredients,
       is_published, access_level, emoji, photo,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       ingredients->1 AS egg_without_interactive_swap,
       quote, note, add_protein, add_fat, add_carbs, add_fiber
FROM recipes WHERE id = 'muffins-red-lentil-carrot-parsley';
