-- Пирог со сливами на цельнозерновой муке.
-- Strict / docs/ai-recipe-input-contract.md. Неопубликованный Pro-черновик.
-- Применение на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-pie-plums-wholegrain-2026-10-22.sql
--
-- _filled_from_input:
--   name: Пирог со сливами на цельнозерновой муке;
--   id: pie-plums-wholegrain (inferred: тип блюда и название);
--   cat: sweets (inferred: явно запрошенная новая категория «Сладкое»);
--   time_min: 60; difficulty: easy; servings: 6; portion_grams: 130;
--   kcal/protein/fat/carbs/fiber: 269/6/7/47/7;
--   tags: растительное, без сои;
--   ingredients: 9, принадлежность к тесту/начинке сохранена в названиях;
--   сахар в тесте: возможность «не добавлять»;
--   omit_nutrition: 7/0/0/3/0 (разность двух указанных наборов КБЖУ);
--   без сахара в тесте: 262/6/7/44/7 на порцию;
--   steps: 11, полный исходный текст, включая 35–40 минут при 190 °C;
--   quote: полный исходный текст; note: вступление (подтверждено автором);
--   main_ingredients: [] (подтверждено: пока без привязок);
--   photo: NULL; steps[].photo: true (фотографии позже, контракт §2.3).
-- _needs_clarification: []
-- _not_provided: emoji, vk_video, yt_video, dzen_video,
--   диетическая разметка (проверяется отдельно в редакторе).
-- TODO: добавить фотографии; sort_order=0 — назначить при публикации.
-- Оформление новой категории: пустые emoji/description, нейтральный цвет #999
-- как в POST /admin/categories; порядок — после существующих категорий.
-- Миграция не обновляет существующие рецепты/категории и не публикует рецепт.

BEGIN;

-- Исключить конкурирующее создание категории/рецепта между проверкой и INSERT.
LOCK TABLE categories, recipes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM recipes WHERE id = 'pie-plums-wholegrain') THEN
    RAISE EXCEPTION 'Recipe pie-plums-wholegrain already exists; refusing to overwrite it';
  END IF;

  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE name = 'Пирог со сливами на цельнозерновой муке'
  ) THEN
    RAISE EXCEPTION 'A recipe with this name already exists; inspect its id before importing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM categories
    WHERE (id = 'sweets' AND name IS DISTINCT FROM 'Сладкое')
       OR (name = 'Сладкое' AND id <> 'sweets')
  ) THEN
    RAISE EXCEPTION 'Category sweets / Сладкое conflicts with an existing category';
  END IF;
END $guard$;

INSERT INTO categories (id, name, emoji, color, description, sort_order, auto_addons)
SELECT 'sweets', 'Сладкое', '', '#999', '',
       COALESCE(MAX(sort_order), 0) + 1, '{}'::jsonb
FROM categories
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
  'pie-plums-wholegrain',
  'sweets',
  'Пирог со сливами на цельнозерновой муке',
  NULL,
  60, NULL, 'easy', 6, false, 'pro',
  269, 6, 7, 47, 7,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Сочные сливы, пряный аромат корицы и тонкое тесто - этот пирог хорош и тёплым, сразу после выпечки, и холодным на следующий день.',
  'Простой пирог со сливовой начинкой на цельнозерновом тесте — с кислинкой слив, корицей и плотной текстурой цельнозерновой муки.',
  '[
    {"name": "Цельнозерновая пшеничная мука (для теста): 300 г", "swap": null},
    {"name": "Оливковое масло (для теста): 40 мл", "swap": null},
    {"name": "Горячая вода (для теста): 160 мл", "swap": null},
    {"name": "Соль (для теста): ¼ ч. л.", "swap": null},
    {
      "name": "Сахар (для теста): 1 ст. л.",
      "swap": null,
      "omit": "Не добавлять",
      "omit_nutrition": {"kcal": 7, "protein": 0, "fat": 0, "carbs": 3, "fiber": 0},
      "omit_delta": {"kcal": -7, "protein": 0, "fat": 0, "carbs": -3, "fiber": 0}
    },
    {"name": "Сливы (для начинки): 700 г", "swap": null},
    {"name": "Сахар (для начинки): 2 ст. л.", "swap": null},
    {"name": "Корица (для начинки): ½ ч. л.", "swap": null},
    {"name": "Цельнозерновая мука (для начинки): 1½ ст. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Смешайте муку, соль и сахар.", "photo": true},
    {"text": "Влейте оливковое масло и перемешайте.", "photo": true},
    {"text": "Постепенно влейте горячую воду и замесите тесто.", "photo": true},
    {"text": "Соберите тесто в шар, накройте и оставьте отдыхать на 15 минут.", "photo": true},
    {"text": "Сливы разрежьте пополам, удалите косточки и нарежьте дольками.", "photo": true},
    {"text": "Смешайте сливы с сахаром, корицей и 1½ ст. л. цельнозерновой муки. Надолго не оставляйте: сливы начнут давать много сока.", "photo": true},
    {"text": "Тесто раскатайте на пергаменте в круг диаметром примерно 30–32 см.", "photo": true},
    {"text": "Выложите сливовую начинку в центр, оставляя по краям 3–4 см свободного теста.", "photo": true},
    {"text": "Заверните края теста внутрь, слегка накладывая один участок на другой.", "photo": true},
    {"text": "Перенесите пирог вместе с пергаментом на противень.", "photo": true},
    {"text": "Выпекайте 35–40 минут при 190 °C, пока края не станут темнее, а сливовый сок в центре не начнёт заметно густеть.", "photo": true}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  130, false, 0, '{}'::jsonb, false,
  ARRAY[]::text[]
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('pie-plums-wholegrain', 'sweets');

COMMIT;

SELECT id, name, emoji, color, description, sort_order
FROM categories WHERE id = 'sweets';

SELECT id, name, cat, is_published, access_level, emoji, photo, main_ingredients,
       time_min, time_label, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       ingredients->4 AS optional_dough_sugar,
       add_protein, add_fat, add_carbs, add_fiber, quote, note
FROM recipes WHERE id = 'pie-plums-wholegrain';
