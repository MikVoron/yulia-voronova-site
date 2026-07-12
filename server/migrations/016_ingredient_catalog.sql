-- Dynamic ingredient catalog entries added from the recipe editor.
-- Static defaults still live in platform/ingredients.js.

CREATE TABLE IF NOT EXISTS ingredient_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_catalog_group_sort
  ON ingredient_catalog(group_id, sort_order, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingredient_catalog TO smartplate;
