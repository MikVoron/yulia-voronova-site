-- Рецепт: Скрэмбл из тофу — ОБНОВЛЕНИЕ существующей опубликованной карточки tofu-scramble.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-tofu-scramble.sql
--
-- ВАЖНО: это UPDATE существующей карточки, а НЕ создание новой. Новый id не заводим.
--   • Миграция ОБЯЗАНА обновить ровно одну строку tofu-scramble. Если строки нет —
--     RAISE EXCEPTION прерывает транзакцию ДО синхронизации recipe_categories
--     (иначе INSERT категорий упал бы на внешнем ключе с невнятной ошибкой).
--   • photo НЕ трогаем — у карточки в проде уже есть опубликованное фото
--     (images/img-guides/plant-based/tofu-scrambel.webp). Сохраняем как есть.
--   • НЕ трогаем поля, которые автор не называл: is_free, note, vk_video/yt_video/dzen_video,
--     auto_addons, sort_order, is_soup — остаются как в проде.
--   • ПЕРЕЗАПИСЫВАЕМ по новому рецепту: name, emoji(=NULL), time_min, difficulty, servings,
--     portion_grams, КБЖУ, tags, quote, ingredients, steps, add_* (=[]), is_published, main_ingredients, cat.
--   • add_* в проде уже пустые ([]) — запись пустыми массивами ничего не удаляет.
-- TODO:
--   • main_ingredients содержит 'tofu' — слаг добавлен в platform/ingredients.js (group=legumes).
--     Для навигации нужен деплой platform/ingredients.js + страниц с поднятой версией ingredients.js?v=2.

BEGIN;

DO $mig$
DECLARE
  n integer;
BEGIN
  UPDATE recipes SET
    cat = 'breakfasts',
    name = 'Скрэмбл из тофу',
    emoji = NULL,
    time_min = 25,
    time_label = NULL,
    difficulty = 'easy',
    servings = 4,
    portion_grams = 300,
    kcal = 175,
    protein = 17,
    fat = 8,
    carbs = 12,
    fiber = 4,
    tags = ARRAY['растительное', 'без глютена'],
    quote = 'Этот скрэмбл получается особенно удачным за счёт сочетания мягкого тофу, сочных овощей и пряностей: куркума даёт тёплый золотистый цвет, паприка добавляет глубину вкуса, а лимонный сок слегка освежает блюдо. Благодаря овощам скрэмбл выходит не сухим, а сочным и очень ароматным, поэтому хорошо подходит и на завтрак, и как лёгкий ужин.',
    ingredients = '[
      {"name": "Тофу — 400 г", "swap": null},
      {"name": "Лук — 1 шт.", "swap": null},
      {"name": "Кабачок — 1 шт.", "swap": null},
      {"name": "Болгарский перец — 1 шт.", "swap": null},
      {"name": "Томаты черри — 8 шт.", "swap": null},
      {"name": "Помидоры — 200 г", "swap": null},
      {"name": "Чеснок — 3 зубчика", "swap": null},
      {"name": "Растительное масло — 1 ст. л.", "swap": null},
      {"name": "Соль — 1 ч. л.", "swap": null},
      {"name": "Сок лимона — 1 ч. л.", "swap": null},
      {"name": "Куркума — 1/2 ч. л.", "swap": null},
      {"name": "Паприка — 1 ч. л.", "swap": null},
      {"name": "Тимьян — 1/2 ч. л.", "swap": null},
      {"name": "Зелень — 10 г", "swap": null}
    ]'::jsonb,
    steps = '[
      {"text": "Мелко нарежьте лук и чеснок, овощи нарежьте кубиками."},
      {"text": "Обжарьте лук на растительном масле около 3 минут."},
      {"text": "Добавьте чеснок и специи, перемешайте."},
      {"text": "Добавьте кабачок и болгарский перец, перемешайте и потушите около 3 минут."},
      {"text": "Добавьте черри и помидоры, перемешайте и тушите овощи около 10 минут до мягкости."},
      {"text": "Добавьте соль и лимонный сок."},
      {"text": "Введите раскрошенный тофу, добавьте мелко порезанную зелень, перемешайте и прогрейте 1–2 минуты."}
    ]'::jsonb,
    add_protein = '[]'::jsonb,
    add_fat = '[]'::jsonb,
    add_carbs = '[]'::jsonb,
    add_fiber = '[]'::jsonb,
    is_published = true,
    main_ingredients = ARRAY['tofu', 'zucchini', 'tomatoes'],
    updated_at = now()
  WHERE id = 'tofu-scramble';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'tofu-scramble: ожидалось обновление 1 карточки, затронуто %. Миграция предназначена ТОЛЬКО для обновления существующего рецепта — прерываю.', n;
  END IF;

  -- Полная синхронизация категорий именно этого рецепта (рецепт гарантированно существует — проверено выше).
  DELETE FROM recipe_categories WHERE recipe_id = 'tofu-scramble';
  INSERT INTO recipe_categories (recipe_id, category_id)
  VALUES ('tofu-scramble', 'breakfasts'),
         ('tofu-scramble', 'mains');
END
$mig$;

COMMIT;

-- Проверка
SELECT id, name, cat, is_published, photo, time_min, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, main_ingredients
FROM recipes WHERE id = 'tofu-scramble';
SELECT recipe_id, category_id FROM recipe_categories WHERE recipe_id = 'tofu-scramble' ORDER BY category_id;
