-- Точечные правки 2026-04-26 (v4):
--   1. cabbage-salmon-pie: проставить КБЖУ (338/20/14/36/7) — раньше были нули.
--   2. chickpea-meatballs: emoji '🫛' → '🍡' (пользователь: «всем котлетам/тефтелькам — эмодзи котлет»).
--   3. oregano-croutons: servings 15 → 14 (по контракту: нижняя граница диапазона «14–16»).
--
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-fixes-2026-04-26-v4.sql

UPDATE recipes
SET kcal = 338,
    protein = 20,
    fat = 14,
    carbs = 36,
    fiber = 7,
    updated_at = now()
WHERE id = 'cabbage-salmon-pie';

UPDATE recipes
SET emoji = '🍡',
    updated_at = now()
WHERE id = 'chickpea-meatballs';

UPDATE recipes
SET servings = 14,
    updated_at = now()
WHERE id = 'oregano-croutons';
