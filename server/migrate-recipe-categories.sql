-- Миграция: таблица recipe_categories (многие-ко-многим)
-- Запустить на VPS:
-- ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-categories.sql

BEGIN;

-- 1. Создать таблицу связи
CREATE TABLE IF NOT EXISTS recipe_categories (
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, category_id)
);

-- 2. Индекс для быстрого поиска рецептов по категории
CREATE INDEX IF NOT EXISTS idx_recipe_categories_category
    ON recipe_categories(category_id);

-- 3. Перенести данные из recipes.cat в новую таблицу
INSERT INTO recipe_categories (recipe_id, category_id)
SELECT id, cat FROM recipes WHERE cat IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
