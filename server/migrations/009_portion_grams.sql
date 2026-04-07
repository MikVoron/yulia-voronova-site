-- 009: Portion grams column for recipes
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS portion_grams INT DEFAULT 300;
