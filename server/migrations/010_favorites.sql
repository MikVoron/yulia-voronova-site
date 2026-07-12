CREATE TABLE IF NOT EXISTS user_favorites (
    user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id TEXT    NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);
