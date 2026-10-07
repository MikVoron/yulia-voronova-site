-- Крем-суп из запечённых тыквы и батата.
-- Неопубликованный Pro-черновик; strict / docs/ai-recipe-input-contract.md.
-- Применить на VPS из каталога с файлом:
-- sudo -u postgres psql -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-soup-roasted-pumpkin-sweet-potato-2026-10-07.sql
--
-- Будущий анонс (не включён в карточку рецепта):
-- Нежный крем-суп из запечённых тыквы и батата с тёплым ароматом имбиря, куркумы и мускатного ореха.
--
-- _filled_from_input:
--   name: Крем-суп из запечённых тыквы и батата (подтверждено);
--   id: soup-roasted-pumpkin-sweet-potato (из названия, префикс soup-*);
--   cat: soups (inferred: крем-суп); time_min: 50; difficulty: medium;
--   servings: 6; portion_grams: 350; kcal/protein/fat/carbs/fiber: 155/3/5/27/4;
--   tags: растительное, без сои, без глютена;
--   main_ingredients: pumpkin, sweet-potato; ingredients: 12; steps: 11;
--   quote: полная авторская цитата;
--   swap: Свежий имбирь: 1 ч. л. -> Сушёный имбирь: ½ ч. л.;
--   add_protein: готовое белое мясо 70 г, тофу 130 г, эдамаме 100 г;
--   add_carbs: цельнозерновой хлеб 1 ломтик (подтверждено), сухарики 1 порция;
--   photo: NULL; steps[].photo: true (фото будут позже, контракт §2.3).
-- _needs_clarification: []
-- _not_provided: emoji, note, vk_video, yt_video, dzen_video,
--   диетическая разметка и изменение КБЖУ при замене — проверяются отдельно в редакторе.
-- Источники по прямому указанию пользователя:
--   мясо 70 г: migrations/031_sidebar_addon_amounts_and_names.sql -> 112/22/3/0/0;
--   хлеб 1 ломтик: тот же файл и docs/admin-recipe-guide.md -> 70/3/0/15/3;
--   сухарики: существующий рецепт oregano-croutons; КБЖУ берётся из БД при применении.
-- Тофу: сохраняем авторские 91/13/5/3/1; старые 3 г жира из таблицы не подставляем.
-- TODO: добавить фото; sort_order=0 — назначить вручную при публикации.
-- Повторное применение не перезаписывает существующий рецепт, его фото или публикацию.

BEGIN;

DO $guard$
DECLARE
  existing_name TEXT;
  existing_group_id TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'soup-roasted-pumpkin-sweet-potato'
      AND (name IS DISTINCT FROM 'Крем-суп из запечённых тыквы и батата'
           OR cat IS DISTINCT FROM 'soups')
  ) THEN
    RAISE EXCEPTION 'Recipe id soup-roasted-pumpkin-sweet-potato already belongs to another recipe or category';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'oregano-croutons' AND is_published = true
      AND kcal IS NOT NULL AND protein IS NOT NULL AND fat IS NOT NULL
      AND carbs IS NOT NULL AND fiber IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Published oregano-croutons recipe with complete nutrition is required';
  END IF;

  SELECT name, group_id INTO existing_name, existing_group_id
  FROM ingredient_catalog WHERE id = 'pumpkin';

  IF FOUND THEN
    IF existing_name IS DISTINCT FROM 'Тыква' OR existing_group_id IS DISTINCT FROM 'vegetables' THEN
      RAISE EXCEPTION 'Ingredient id pumpkin already belongs to % in group %', existing_name, existing_group_id;
    END IF;
  ELSE
    INSERT INTO ingredient_catalog (id, name, group_id, sort_order)
    VALUES ('pumpkin', 'Тыква', 'vegetables', 1000);
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
  'soup-roasted-pumpkin-sweet-potato',
  'soups',
  'Крем-суп из запечённых тыквы и батата',
  NULL,
  50, NULL, 'medium', 6, false, 'pro',
  155, 3, 5, 27, 4,
  ARRAY['растительное', 'без сои', 'без глютена'],
  NULL,
  'Запекание делает вкус тыквы и батата особенно насыщенным и сладковатым, а чеснок, имбирь и специи добавляют супу глубину и аромат. Получается тёплое, нежное и очень уютное сезонное блюдо.',
  NULL,
  '[
    {"name": "Тыква: 800 г", "swap": null},
    {"name": "Батат: 450 г", "swap": null},
    {"name": "Морковь: 1 шт.", "swap": null},
    {"name": "Репчатый лук: 1 шт.", "swap": null},
    {"name": "Чеснок: 3 зубчика", "swap": null},
    {"name": "Оливковое масло: 2 ст. л.", "swap": null},
    {"name": "Куркума: ½ ч. л.", "swap": null},
    {"name": "Свежий имбирь: 1 ч. л.", "swap": "Сушёный имбирь: ½ ч. л."},
    {"name": "Мускатный орех: щепотка", "swap": null},
    {"name": "Горячая вода: до 1,8 л", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "Чёрный перец — по желанию", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Тыкву и батат нарежьте кубиками примерно 2–2,5 см. Морковь нарежьте кружочками, а лук — крупными дольками. Чеснок оставьте целыми зубчиками в кожуре, чтобы он не сгорел.", "photo": true},
    {"text": "Выложите тыкву, батат, морковь и лук на противень, застеленный пергаментом.", "photo": true},
    {"text": "В оливковое масло добавьте куркуму, имбирь и немного соли. Хорошо перемешайте.", "photo": true},
    {"text": "Полейте овощи масляной смесью и перемешайте руками, чтобы масло и специи распределились равномерно.", "photo": true},
    {"text": "Добавьте на противень зубчики чеснока в кожуре.", "photo": true},
    {"text": "Запекайте овощи 30–40 минут при 200 °C в режиме «верх-низ». Они должны стать полностью мягкими и местами хорошо подрумяниться.", "photo": true},
    {"text": "Достаньте чеснок из кожуры.", "photo": true},
    {"text": "Переложите запечённые овощи в большую кастрюлю или чашу мощного блендера. Добавьте сначала 1 л горячей воды и пробейте до гладкой кремовой консистенции.", "photo": true},
    {"text": "Постепенно добавляйте оставшуюся горячую воду — примерно до 1,8 л, пока суп не достигнет желаемой густоты. Не обязательно вливать всю воду сразу.", "photo": true},
    {"text": "Добавьте мускатный орех, оставшуюся соль и, при желании, чёрный перец.", "photo": true},
    {"text": "Прогрейте суп 3–5 минут на небольшом огне, не доводя до сильного кипения.", "photo": true}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[
    {"name": "Готовое белое мясо", "amount": "70 г", "kcal": 112, "protein": 22, "fat": 3, "carbs": 0, "fiber": 0},
    {"name": "Тофу", "amount": "130 г", "kcal": 91, "protein": 13, "fat": 5, "carbs": 3, "fiber": 1},
    {"name": "Соевые бобы эдамаме", "amount": "100 г", "kcal": 109, "protein": 12, "fat": 5, "carbs": 3, "fiber": 5}
  ]'::jsonb,
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object(
      'name', 'Цельнозерновой хлеб', 'amount', '1 ломтик',
      'kcal', 70, 'protein', 3, 'fat', 0, 'carbs', 15, 'fiber', 3
    ),
    (SELECT jsonb_build_object(
      'name', name, 'amount', '1 порция', 'recipeId', id,
      'kcal', kcal, 'protein', protein, 'fat', fat, 'carbs', carbs, 'fiber', fiber
    ) FROM recipes WHERE id = 'oregano-croutons')
  ),
  '[]'::jsonb,
  350, false, 0, '{}'::jsonb, true,
  ARRAY['pumpkin', 'sweet-potato']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('soup-roasted-pumpkin-sweet-potato', 'soups')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, emoji, photo, main_ingredients,
       servings, portion_grams, kcal, protein, fat, carbs, fiber,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       add_protein, add_carbs
FROM recipes WHERE id = 'soup-roasted-pumpkin-sweet-potato';

SELECT id, name, group_id FROM ingredient_catalog WHERE id = 'pumpkin';
