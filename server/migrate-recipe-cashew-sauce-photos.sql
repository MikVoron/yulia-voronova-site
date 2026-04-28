-- Рецепт: Соус из кешью (cashew-sauce)
-- Подключаем cover + step 3 из images/recipes/cashew-sauce/.
-- Только UPDATE — рецепт уже есть в БД.
--
-- Конвенция (см. server/migrate-recipe-photos-convention.sql):
--   • r.photo указывает на -final.webp. До миграции photo указывал на
--     -cover.webp, который был удалён → битая обложка. Файл -cover.webp
--     теперь восстановлен из PNG-сета, но photo приводим к канону (-final).
--   • Фронт platform/recipe.html автоматически выводит -start.webp после
--     ингредиентов и -final.webp как «Приятного аппетита» в самом конце.
--   • В steps[].photo НЕ должно быть -start и -final.
--   • -3.webp → шаг 3 (взбить в блендере).
--   • Шаги 1–2 фото не получают: реальных кадров нет.
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-cashew-sauce-photos.sql

BEGIN;

UPDATE recipes
SET
  photo = 'images/recipes/cashew-sauce/cashew-sauce-final.webp',
  steps = '[
    {"text": "Замочить кешью минимум на 4–6 часов, можно на ночь.", "photo": null},
    {"text": "Замоченный кешью слить и промыть.", "photo": null},
    {"text": "Сложить все ингредиенты в блендер, взбить до кремовой однородной текстуры.", "photo": "images/recipes/cashew-sauce/cashew-sauce-3.webp"}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'cashew-sauce';

COMMIT;
