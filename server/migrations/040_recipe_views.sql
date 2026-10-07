-- Browser-reported recipe openings. No IP, email, fingerprint or recipe content.
CREATE TABLE IF NOT EXISTS recipe_views (
    event_id UUID PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    visitor_id UUID,
    view_mode TEXT NOT NULL CHECK (view_mode IN ('full', 'preview')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((user_id IS NULL) <> (visitor_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_recipe_views_period
    ON recipe_views (created_at, recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_views_recipe
    ON recipe_views (recipe_id, created_at);

GRANT SELECT, INSERT ON recipe_views TO smartplate;
