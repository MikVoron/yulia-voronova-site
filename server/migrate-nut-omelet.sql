-- Рецепт: Омлет из нута (id: nut-omelet) — ОБНОВЛЕНИЕ существующей записи
-- Применить на VPS: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-nut-omelet.sql
--
-- ВАЖНО: это UPDATE, а не INSERT. Запись nut-omelet уже существует.
-- Намеренно НЕ трогаем (сохраняем текущие значения записи):
--   photo, img_position, emoji, access_level, sort_order, is_published,
--   note, main_ingredients, vk_video, yt_video, dzen_video,
--   is_free, add_protein, add_fat, add_fiber, auto_addons, is_soup, is_seasonal.
-- Обложка остаётся текущей (chickpea-omelette.webp) по решению заказчика;
-- настоящие фото в images/recipes/nut-omelet/ — отдельной задачей.
--
-- Формат ingredients: {name, swap}. Формат step.photo: string | string[] | true | null.

BEGIN;

-- Гард: миграция рассчитана на ОБНОВЛЕНИЕ существующей записи.
-- Если nut-omelet не найден — прерываемся с ошибкой, чтобы UPDATE не прошёл
-- молча при 0 обновлённых строк (создание ID — отдельная задача).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM recipes WHERE id = 'nut-omelet') THEN
    RAISE EXCEPTION 'Рецепт nut-omelet не найден — UPDATE отменён. Создание записи должно быть отдельной задачей.';
  END IF;
END $$;

UPDATE recipes SET
  name = 'Омлет из нута',
  cat = 'breakfasts',
  time_min = 35,
  difficulty = 'easy',
  servings = 3,
  portion_grams = 230,
  kcal = 201,
  protein = 11,
  fat = 4,
  carbs = 32,
  fiber = 7,
  time_label = NULL,  -- источник: «35 минут» без диапазона → фронт показывает time_min (35 мин)
  tags = ARRAY['без глютена', 'растительное', 'без сои', 'бобовые'],
  quote = 'Омлет из нута — это способ разнообразить привычный завтрак: нутовая мука делает его сытным, а овощи добавляют сочность, клетчатку и яркий вкус.',
  ingredients = '[
    {"name": "Нутовая мука — 100 г", "swap": null},
    {"name": "Вода — 200 мл", "swap": null},
    {"name": "Соль — 1/2 ч. л. для муки", "swap": null},
    {"name": "Петрушка — 10 г", "swap": null},
    {"name": "Лимонный сок — 1 ч. л.", "swap": null},
    {"name": "Растительное масло — 1 ч. л.", "swap": null},
    {"name": "Лук — 1 шт.", "swap": null},
    {"name": "Чеснок — 1 зубчик", "swap": null},
    {"name": "Кабачок — 1 шт.", "swap": null},
    {"name": "Болгарский перец — 1 шт.", "swap": null},
    {"name": "Томаты — 150 г", "swap": null},
    {"name": "Протёртые томаты — 100 г", "swap": null},
    {"name": "Молотый кориандр — 1/2 ч. л.", "swap": null},
    {"name": "Копчёная паприка — 1/2 ч. л.", "swap": null},
    {"name": "Соль — 1/2 ч. л. для овощей", "swap": null}
  ]'::jsonb,
  steps = '[
    {"text": "Залейте нутовую муку водой и хорошо перемешайте, чтобы не было комочков.", "photo": null},
    {"text": "Добавьте соль, мелко порезанную петрушку и лимонный сок, перемешайте.", "photo": null},
    {"text": "Мелко нарежьте овощи.", "photo": null},
    {"text": "На растительном масле поджарьте лук в течение 3 минут.", "photo": null},
    {"text": "Добавьте чеснок и специи, перемешайте.", "photo": null},
    {"text": "Добавьте овощи, протёртые томаты и соль, перемешайте и тушите около 10 минут под полузакрытой крышкой.", "photo": null},
    {"text": "Залейте овощи нутовой смесью.", "photo": null},
    {"text": "Перемешайте, разровняйте, накройте крышкой и тушите около 7 минут на небольшом огне до готовности.", "photo": null}
  ]'::jsonb,
  add_carbs = '[
    {"name": "Цельнозерновой хлеб", "amount": "1 ломтик", "kcal": 70, "protein": 3, "fat": 0, "carbs": 15, "fiber": 3}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'nut-omelet';

-- Категория уже привязана; на всякий случай идемпотентно подтверждаем.
INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('nut-omelet', 'breakfasts')
ON CONFLICT DO NOTHING;

COMMIT;
