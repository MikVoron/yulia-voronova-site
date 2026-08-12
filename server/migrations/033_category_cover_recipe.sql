-- Selected category cover.  Kept on the category rather than recipes because
-- recipes may belong to more than one category.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS cover_recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_cover_recipe_id
  ON categories (cover_recipe_id)
  WHERE cover_recipe_id IS NOT NULL;
