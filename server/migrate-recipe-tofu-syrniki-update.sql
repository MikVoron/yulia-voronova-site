-- Рецепт: Сырники из тофу — ОБНОВЛЕНИЕ существующей опубликованной карточки tofu-syrniki.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-tofu-syrniki-update.sql
--
-- strict / No Guessing. См. docs/ai-recipe-input-contract.md
-- ВАЖНО: это UPDATE существующей карточки (id=tofu-syrniki), НЕ создание новой.
--   • Гард ROW_COUNT: если строки tofu-syrniki нет — RAISE EXCEPTION прерывает транзакцию.
--   • НЕ трогаем поля, которых автор в тексте не называл и которые рискованно перезаписать:
--     photo, is_free, is_published, note, vk_video/yt_video/dzen_video, auto_addons,
--     sort_order, is_soup — остаются как в проде.
--   • ПЕРЕЗАПИСЫВАЕМ по решению пользователя: cat='breakfasts' и recipe_categories='breakfasts'.
--   • ПЕРЕЗАПИСЫВАЕМ по новому тексту: name, emoji(=NULL), time_min, time_label,
--     difficulty, servings, portion_grams, КБЖУ, tags, quote, ingredients, steps,
--     add_* (=[]), main_ingredients.
-- ВНИМАНИЕ:
--   • add_* перезаписываются пустыми массивами. Если в проде у tofu-syrniki были РУЧНЫЕ
--     добавки — они удалятся. Проверить перед применением (auto_addons категории не затрагиваются).
--   • fiber=2 — в тексте было 2.3 г, округлено до 2 по решению пользователя
--     (колонки КБЖУ в БД — integer, см. migrate-recipe-bean-meatballs.sql).

BEGIN;

DO $mig$
DECLARE
  n integer;
BEGIN
  UPDATE recipes SET
    name = 'Сырники из тофу',
    cat = 'breakfasts',
    emoji = NULL,
    time_min = 20,
    time_label = NULL,
    difficulty = 'easy',
    servings = 8,
    portion_grams = 80,
    kcal = 120,
    protein = 11,
    fat = 6,
    carbs = 11,
    fiber = 2,
    tags = ARRAY['растительное', 'бобовые'],
    quote = 'Соевые продукты, такие как тофу, отличный источник полноценного растительного белка со всеми незаменимыми аминокислотами. Эти сырники не разваливаются при жарке, очень просты в приготовлении и получаются невероятно вкусными и нежными. Отличный способ разнообразить рацион растительными продуктами!',
    ingredients = '[
      {"name": "Тофу: 500 г", "swap": null},
      {"name": "Сок лимона: 1 ст. л.", "swap": null},
      {"name": "Цедра: 1/2 лимона", "swap": null},
      {"name": "Мука цельнозерновая: 3 ст. л.", "swap": "Безглютеновая мука"},
      {"name": "Мёд: 1 ч. л.", "swap": "Можно без него или заменить на любой подсластитель по вкусу"},
      {"name": "Банан спелый: 1 шт", "swap": null},
      {"name": "Изюм: 2 ст. л.", "swap": null},
      {"name": "Растительное масло для жарки: 1 ч. л.", "swap": null}
    ]'::jsonb,
    steps = '[
      {"text": "Залейте изюм горячей водой на 10 минут для мягкости (необязательно)."},
      {"text": "Разомните тофу и банан вилкой или воспользуйтесь блендером до однородности."},
      {"text": "Добавьте муку и хорошо перемешайте."},
      {"text": "Добавьте цедру, сок лимона, мёд, изюм (его можно порезать мельче) и перемешайте."},
      {"text": "Сформируйте сырники и обжарьте до румяной корочки с двух сторон на растительном масле."}
    ]'::jsonb,
    add_protein = '[]'::jsonb,
    add_fat = '[]'::jsonb,
    add_carbs = '[]'::jsonb,
    add_fiber = '[]'::jsonb,
    main_ingredients = ARRAY['tofu'],
    updated_at = now()
  WHERE id = 'tofu-syrniki';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'tofu-syrniki: ожидалось обновление 1 карточки, затронуто %. Миграция предназначена ТОЛЬКО для обновления существующего рецепта — прерываю.', n;
  END IF;

  DELETE FROM recipe_categories WHERE recipe_id = 'tofu-syrniki';
  INSERT INTO recipe_categories (recipe_id, category_id)
  VALUES ('tofu-syrniki', 'breakfasts')
  ON CONFLICT DO NOTHING;
END
$mig$;

COMMIT;

-- Проверка
SELECT id, name, cat, is_published, photo, time_min, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags, main_ingredients
FROM recipes WHERE id = 'tofu-syrniki';
