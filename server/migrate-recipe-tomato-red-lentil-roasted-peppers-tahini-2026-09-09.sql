-- Томатный суп с красной чечевицей, печеными перцем и тахини.
-- Новый неопубликованный Pro-черновик из подтверждённого автором текста.
-- Фото будут добавлены отдельной миграцией: photo = NULL, фото шагов не заданы.
-- Применить на VPS:
--   scp server/migrate-recipe-tomato-red-lentil-roasted-peppers-tahini-2026-09-09.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-tomato-red-lentil-roasted-peppers-tahini-2026-09-09.sql"

BEGIN;

-- Не допускаем перезапись другого рецепта при неожиданном совпадении id.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'soup-tomato-red-lentil-roasted-peppers-tahini'
      AND name <> 'Томатный суп с красной чечевицей, печеными перцем и тахини'
  ) THEN
    RAISE EXCEPTION 'Recipe id soup-tomato-red-lentil-roasted-peppers-tahini already belongs to another recipe';
  END IF;
END $guard$;

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
  'soup-tomato-red-lentil-roasted-peppers-tahini',
  'soups',
  'Томатный суп с красной чечевицей, печеными перцем и тахини',
  NULL,
  50,
  NULL,
  'medium',
  8,
  false,
  'pro',
  174, 10, 4, 26, 7,
  ARRAY['растительное', 'без глютена', 'без сои', 'бобовые'],
  NULL,
  NULL,
  'Густой, насыщенный суп, в котором чечевица и томаты остаются примерно равноправными по вкусу, а тахини даёт мягкий кунжутный акцент и немного кремовости. Вы можете пробить его до идеальной гладкости, а можете оставить небольшие кусочки для текстуры.',
  NULL,
  '[
    {"name": "Красная чечевица: 250 г", "swap": null},
    {"name": "Томаты: 650 г", "swap": null},
    {"name": "Болгарский перец сладкий: 2 крупных шт.", "swap": null},
    {"name": "Лук репчатый: 1 средний", "swap": null},
    {"name": "Чеснок: 2 зубчика", "swap": null},
    {"name": "Тахини: 30 г", "swap": null},
    {"name": "Лимонный сок: 1 ст. л.", "swap": null},
    {"name": "Растительное масло: 1 ст. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разогрейте духовку до 200 °C. Положите перцы целиком на противень и запекайте около 25 минут, пока кожица не потемнеет и местами не покроется подпалинами."},
    {"text": "Лук порежьте небольшими кубиками, чеснок мелко порубите, помидоры нарежьте произвольными небольшими кусочками."},
    {"text": "Разогрейте в кастрюле растительное масло. Добавьте лук и готовьте около 5 минут на небольшом огне до лёгкой золотистости."},
    {"text": "Добавьте чеснок и прогрейте около 30 секунд."},
    {"text": "Добавьте помидоры и готовьте без крышки 8–10 минут, периодически помешивая, чтобы они размягчились, дали сок и немного уварились."},
    {"text": "Переложите готовые горячие перцы в миску, накройте и оставьте на 10 минут — так вам легче будет снимать с них кожуру. Снимите кожуру, удалите семена и нарежьте мякоть на небольшие кусочки."},
    {"text": "Добавьте в кастрюлю промытую красную чечевицу и запечённый перец к помидорам."},
    {"text": "Влейте 2 л воды, посолите и при желании поперчите."},
    {"text": "Доведите до кипения, уменьшите огонь и варите около 15–20 минут, пока чечевица полностью не станет мягкой."},
    {"text": "Добавьте тахини и лимонный сок, хорошо перемешайте."},
    {"text": "Пробейте погружным блендером до нужной вам консистенции."},
    {"text": "Попробуйте и при необходимости добавьте соль, перец или ещё немного лимонного сока."}
  ]'::jsonb,
  NULL,
  NULL,
  NULL,
  '[
    {"name": "Белое мясо", "amount": "50 г", "kcal": 80, "protein": 16, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "100 г", "kcal": 78, "protein": 9, "fat": 5, "carbs": 2, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  400,
  false,
  0,
  '{}'::jsonb,
  true,
  ARRAY['red-lentils', 'tomatoes'],
  ARRAY[]::text[],
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-tomato-red-lentil-roasted-peppers-tahini', 'soups')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, photo, main_ingredients,
       dietary_flags, dietary_verified, servings, portion_grams,
       kcal, protein, fat, carbs, fiber
FROM recipes
WHERE id = 'soup-tomato-red-lentil-roasted-peppers-tahini';
