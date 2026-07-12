-- 019: User voting for recipes that need a video version.

CREATE TABLE IF NOT EXISTS recipe_video_requests (
  recipe_id  TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  goal       INTEGER NOT NULL DEFAULT 10 CHECK (goal > 0),
  status     VARCHAR(20) NOT NULL DEFAULT 'collecting'
             CHECK (status IN ('collecting', 'goal_reached', 'planned', 'filming', 'published')),
  reached_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_video_votes (
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (recipe_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_video_votes_recipe
  ON recipe_video_votes (recipe_id, created_at);

CREATE INDEX IF NOT EXISTS idx_recipe_video_requests_queue
  ON recipe_video_requests (status, reached_at, updated_at);

GRANT ALL ON TABLE recipe_video_requests TO smartplate;
GRANT ALL ON TABLE recipe_video_votes TO smartplate;
