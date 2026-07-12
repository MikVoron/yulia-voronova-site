-- Миграция: финальный cleanup путей для recipe-images
--
-- 1) buckwheat-quinoa-soup
--    Раньше r.photo указывал на -final.webp как fallback (cover.webp не было
--    на диске). Теперь cover.webp создан и в main → переключаем r.photo на
--    -cover.webp. -final.webp остаётся только для авто-блока «Приятного
--    аппетита» в фронте.
--
-- 2) lentil-mushroom-pilaf
--    Папка/файлы переименованы под recipe id: pilaf-lentils-mushrooms/* →
--    lentil-mushroom-pilaf/*. Обновляем r.photo и steps[].photo на новый путь.
--    На диске -cover.webp нет — r.photo продолжает указывать на -final.webp
--    (соответствует комментарию в migrate-recipe-lentil-mushroom-pilaf.sql).
--
-- В steps[].photo НЕ кладём -start.webp / -final.webp (фронт авто-рендерит).
--
-- Применить:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" \
--     < server/migrate-recipe-paths-cleanup.sql

BEGIN;

-- ─── buckwheat-quinoa-soup: cover теперь настоящий ─────────────────────────
UPDATE recipes
SET
  photo = 'images/recipes/buckwheat-quinoa-soup/buckwheat-quinoa-soup-cover.webp',
  updated_at = now()
WHERE id = 'buckwheat-quinoa-soup';

-- ─── lentil-mushroom-pilaf: пути под recipe id ─────────────────────────────
UPDATE recipes
SET
  photo = 'images/recipes/lentil-mushroom-pilaf/lentil-mushroom-pilaf-final.webp',
  steps = '[
    {"text": "Лук нарежьте и обжарьте на оливковом масле 1 минуту.", "photo": null},
    {"text": "Добавьте тёртую морковь и жарьте ещё 2 минуты.", "photo": "images/recipes/lentil-mushroom-pilaf/lentil-mushroom-pilaf-2.webp"},
    {"text": "Добавьте чеснок и специи, перемешайте.", "photo": null},
    {"text": "Добавьте грибы и готовьте 1 минуту.", "photo": "images/recipes/lentil-mushroom-pilaf/lentil-mushroom-pilaf-4.webp"},
    {"text": "Добавьте томатную пасту, перемешайте.", "photo": null},
    {"text": "Всыпьте рис и чечевицу, перемешайте.", "photo": "images/recipes/lentil-mushroom-pilaf/lentil-mushroom-pilaf-6.webp"},
    {"text": "Влейте воду, добавьте овощной концентрат (можно без него), посолите.", "photo": "images/recipes/lentil-mushroom-pilaf/lentil-mushroom-pilaf-7.webp"},
    {"text": "Доведите до кипения, накройте крышкой и готовьте на слабом огне 25 минут.", "photo": null},
    {"text": "В конце попробуйте и при необходимости досолите.", "photo": null},
    {"text": "Выключите огонь и дайте настояться под крышкой 10 минут.", "photo": null}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'lentil-mushroom-pilaf';

COMMIT;
