-- Зелёная гречка с индейкой и овощами.
-- Новый неопубликованный Pro-черновик из подтверждённого автором текста.
-- Фото будут добавлены отдельной миграцией: photo = NULL, фото шагов не заданы.

BEGIN;

-- Не допускаем, чтобы стабильный id справочника получил другое значение.
DO $catalog_guard$
DECLARE
  existing_name TEXT;
  existing_group_id TEXT;
BEGIN
  SELECT name, group_id
  INTO existing_name, existing_group_id
  FROM ingredient_catalog
  WHERE id = 'turkey';

  IF FOUND THEN
    IF existing_name <> 'Индейка' OR existing_group_id <> 'poultry' THEN
      RAISE EXCEPTION 'Ingredient id turkey already belongs to % in group %', existing_name, existing_group_id;
    END IF;
  ELSE
    INSERT INTO ingredient_catalog (id, name, group_id, sort_order)
    VALUES ('turkey', 'Индейка', 'poultry', 1000);
  END IF;
END $catalog_guard$;

-- Не допускаем перезапись другого рецепта при неожиданном совпадении id.
DO $recipe_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'green-buckwheat-turkey-vegetables'
      AND name <> 'Зелёная гречка с индейкой и овощами'
  ) THEN
    RAISE EXCEPTION 'Recipe id green-buckwheat-turkey-vegetables already belongs to another recipe';
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
  'green-buckwheat-turkey-vegetables',
  'mains',
  'Зелёная гречка с индейкой и овощами',
  NULL,
  40,
  NULL,
  'medium',
  4,
  false,
  'pro',
  329, 31, 4, 43, 7,
  ARRAY['без глютена', 'без сои'],
  NULL,
  NULL,
  'Зелёная гречка сохраняет мягкую, нежную текстуру и приятный ореховый вкус. В сочетании с индейкой и овощами она даёт сытное и хорошо сбалансированное блюдо, богатое белком и клетчаткой — идеальный вариант для полноценного обеда или ужина.',
  NULL,
  '[
    {"name": "Зелёная гречка: 200 г", "swap": null},
    {"name": "Индейка: 400 г", "swap": null, "dietary_flags": ["meat"]},
    {"name": "Репчатый лук: 1 шт.", "swap": null},
    {"name": "Морковь: 1 шт.", "swap": null},
    {"name": "Сладкий перец: 1 шт.", "swap": null},
    {"name": "Растительное масло: 1 ч. л.", "swap": null},
    {"name": "Горячая вода: 350 мл", "swap": null},
    {"name": "Сладкая паприка: ½ ч. л.", "swap": null},
    {"name": "Копчёная паприка: ½ ч. л.", "swap": null},
    {"name": "Сушёный тимьян: ½ ч. л.", "swap": null},
    {"name": "Сушёный чеснок: ½ ч. л.", "swap": "Свежий чеснок: 2 зубчика"},
    {"name": "Свежая петрушка: 15 г", "swap": null},
    {"name": "Лимонный сок: 1 ст. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Промойте зелёную гречку в нескольких водах и хорошо откиньте на сито."},
    {"text": "Индейку нарежьте небольшими кусочками. Лук, морковь и сладкий перец нарежьте небольшими кубиками."},
    {"text": "Разогрейте растительное масло в широкой сковороде. Если хотите приготовить блюдо без масла, добавьте несколько столовых ложек воды. Выложите индейку и обжаривайте/тушите 3–4 минуты на среднем огне."},
    {"text": "Добавьте лук и морковь и готовьте ещё 4–5 минут, периодически помешивая."},
    {"text": "Добавьте сладкий перец и готовьте ещё 2–3 минуты."},
    {"text": "Добавьте чеснок, сладкую и копчёную паприку, тимьян. Перемешайте и прогрейте около 30 секунд."},
    {"text": "Добавьте зелёную гречку и перемешайте её с индейкой и овощами."},
    {"text": "Влейте 350 мл горячей воды, посолите и доведите до слабого кипения."},
    {"text": "Уменьшите огонь до минимального, накройте крышкой и готовьте 15 минут."},
    {"text": "Проверьте крупу. Если гречка мягкая, а жидкости почти не осталось, выключите огонь. Если она ещё плотная, добавьте около 50 мл кипятка и готовьте ещё 3–5 минут."},
    {"text": "Добавьте лимонный сок и мелко нарезанную петрушку. Хорошо перемешайте и оставьте блюдо под крышкой на 5–7 минут перед подачей."}
  ]'::jsonb,
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  320,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['buckwheat', 'turkey'],
  ARRAY['meat'],
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('green-buckwheat-turkey-vegetables', 'mains')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, photo, main_ingredients,
       dietary_flags, dietary_verified, servings, portion_grams,
       kcal, protein, fat, carbs, fiber,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count
FROM recipes
WHERE id = 'green-buckwheat-turkey-vegetables';

SELECT id, name, group_id, sort_order
FROM ingredient_catalog
WHERE id = 'turkey';
