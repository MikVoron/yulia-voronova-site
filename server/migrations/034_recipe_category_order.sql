-- Independent ordering of recipes inside each category.
-- A recipe may be in several categories, so its place must not be stored in recipes.sort_order.

CREATE TABLE IF NOT EXISTS recipe_category_order (
  recipe_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, category_id),
  CONSTRAINT recipe_category_order_recipe_category_fkey
    FOREIGN KEY (recipe_id, category_id)
    REFERENCES recipe_categories(recipe_id, category_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_category_order_category_sort
  ON recipe_category_order(category_id, sort_order, recipe_id);

-- Keep the currently visible ordering as the initial per-category ordering.
INSERT INTO recipe_category_order (recipe_id, category_id, sort_order)
SELECT rc.recipe_id, rc.category_id,
       ROW_NUMBER() OVER (
         PARTITION BY rc.category_id
         ORDER BY r.sort_order, r.created_at, r.id
       )::integer * 10
  FROM recipe_categories rc
  JOIN recipes r ON r.id = rc.recipe_id
ON CONFLICT (recipe_id, category_id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_recipe_category_order()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO recipe_category_order (recipe_id, category_id, sort_order)
  VALUES (
    NEW.recipe_id,
    NEW.category_id,
    COALESCE(
      (SELECT MAX(sort_order) + 10
         FROM recipe_category_order
        WHERE category_id = NEW.category_id),
      10
    )
  )
  ON CONFLICT (recipe_id, category_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recipe_category_order_insert ON recipe_categories;
CREATE TRIGGER trg_recipe_category_order_insert
  AFTER INSERT ON recipe_categories
  FOR EACH ROW EXECUTE FUNCTION sync_recipe_category_order();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE recipe_category_order TO smartplate;
