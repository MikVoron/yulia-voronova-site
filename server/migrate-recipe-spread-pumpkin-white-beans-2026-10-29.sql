-- Паштет из тыквы и белой фасоли.
-- Strict / docs/ai-recipe-input-contract.md. Неопубликованный Pro-черновик.
-- Применение на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-spread-pumpkin-white-beans-2026-10-29.sql
--
-- _filled_from_input:
--   name: Паштет из тыквы и белой фасоли;
--   id: spread-pumpkin-white-beans (inferred: тип блюда и название);
--   cat: spreads (inferred: паштет / намазка, контракт §2.1);
--   time_min: 45; time_label: 45 минут, включая запекание тыквы;
--   difficulty: easy; servings: 8; portion_grams: 50;
--   kcal/protein/fat/carbs/fiber: 74/4/2/11/3 на одну порцию;
--   число порций, вес порции и КБЖУ подтверждены пользователем 2026-10-29;
--   значения сохранены без пересчёта по суммарной массе ингредиентов;
--   tags: растительное, бобовое; main_ingredients: pumpkin, white-beans;
--   обе привязки уже есть в базовом platform/ingredients.js на сайте;
--   ingredient_catalog содержит только динамические дополнения/переопределения.
--   ingredients: 7; swap фасоли: белая фасоль консервированная;
--   steps: 6, полный исходный текст;
--   quote: полный исходный текст;
--   note: вступительный абзац (подтверждено пользователем);
--   photo: NULL; steps[].photo: true (фотографии позже, контракт §2.3).
-- _needs_clarification: []
-- _not_provided: emoji, vk_video, yt_video, dzen_video,
--   диетическая разметка и КБЖУ замены (не рассчитываются автоматически).
-- TODO: добавить фотографии; sort_order=0 — назначить вручную при публикации.
-- Миграция не перезаписывает существующие рецепты и не публикует черновик.

BEGIN;

LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'spread-pumpkin-white-beans'
       OR name = 'Паштет из тыквы и белой фасоли'
  ) THEN
    RAISE EXCEPTION 'Recipe spread-pumpkin-white-beans or its name already exists; refusing to overwrite it';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'spreads') THEN
    RAISE EXCEPTION 'Category spreads is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'pumpkin'
      AND (name IS DISTINCT FROM 'Тыква' OR group_id IS DISTINCT FROM 'vegetables')
  ) OR EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'white-beans'
      AND (name IS DISTINCT FROM 'Белая фасоль' OR group_id IS DISTINCT FROM 'legumes')
  ) THEN
    RAISE EXCEPTION 'Dynamic ingredient catalog conflicts with the approved pumpkin or white-beans binding';
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
  'spread-pumpkin-white-beans',
  'spreads',
  'Паштет из тыквы и белой фасоли',
  NULL,
  45, '45 минут, включая запекание тыквы', 'easy', 8, false, 'pro',
  74, 4, 2, 11, 3,
  ARRAY['растительное', 'бобовое'],
  NULL,
  'Нежный, сладковатый и питательный паштет из тыквы и белой фасоли - с мягким ароматом копчёной паприки; добавьте щепотку чили, если хочется остроты.',
  'Нежный паштет из запечённой тыквы и белой фасоли — с тахини, лимоном и копчёной паприкой.',
  '[
    {"name": "Белая фасоль отварная: 250 г", "swap": "белая фасоль консервированная"},
    {"name": "Запечённая тыква: 250 г", "swap": null},
    {"name": "Тахини: 25 г", "swap": null},
    {"name": "Лимонный сок: 1 ст. л.", "swap": null},
    {"name": "Соевый соус: 1 ч. л.", "swap": null},
    {"name": "Копчёная паприка: ½ ч. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разрежьте тыкву вдоль пополам, удалите семена, положите срезом вниз на противень с пергаментом и запеките при 200 °C 35–45 минут до полной мягкости.", "photo": true},
    {"text": "Немного остудите, выньте мякоть ложкой и отвесьте 250 г.", "photo": true},
    {"text": "Если используете консервированную фасоль, слейте жидкость и хорошо промойте.", "photo": true},
    {"text": "Положите в блендер фасоль, тыкву, тахини, лимонный сок, соевый соус и копчёную паприку.", "photo": true},
    {"text": "Пробейте до максимально гладкой массы. Если намазка слишком густая, добавьте воду по 1 ст. л. до нужной консистенции.", "photo": true},
    {"text": "При необходимости посолите и добавьте ещё лимонного сока.", "photo": true}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  50, false, 0, '{}'::jsonb, false,
  ARRAY['pumpkin', 'white-beans']
);

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('spread-pumpkin-white-beans', 'spreads');

COMMIT;

SELECT id, name, cat, is_published, access_level, emoji, photo, main_ingredients,
       time_min, time_label, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       ingredients->0 AS white_beans_with_swap,
       add_protein, add_fat, add_carbs, add_fiber, quote, note
FROM recipes WHERE id = 'spread-pumpkin-white-beans';
