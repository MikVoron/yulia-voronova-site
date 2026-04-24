-- Бизнес-поле is_soup — отдельный флаг рецепта-супа.
-- Не заменяет категорию (супы остаются в mains).
-- Используется для автоподбора add-ons: при is_soup=true к рецепту автоматом прилетают
-- хлеб (статический) + рецепты из категории breads (сухарики, крекеры) в слот carbs.
--
-- Применить на VPS:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-is-soup-flag.sql

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_soup BOOLEAN DEFAULT false NOT NULL;

-- Проставить флаг 7 супам
UPDATE recipes
SET is_soup = true, updated_at = now()
WHERE id IN (
  'borscht-red-beans',
  'buckwheat-soup',
  'rassolnik',
  'chickpea-noodle-soup',
  'roasted-veg-soup',
  'soup-green-lentil-milletsoup',
  'lentil-soup'
);

-- Откат предыдущего подхода (per-recipe auto_addons): теперь правило идёт через is_soup, а не через recipes.auto_addons
UPDATE recipes
SET auto_addons = '{}'::jsonb, updated_at = now()
WHERE id IN (
  'borscht-red-beans',
  'buckwheat-soup',
  'rassolnik',
  'chickpea-noodle-soup',
  'roasted-veg-soup',
  'soup-green-lentil-milletsoup',
  'lentil-soup'
);
