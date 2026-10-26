-- One rating per reviewer stays in reviews. Discussion messages have no stars.
BEGIN;

CREATE TABLE IF NOT EXISTS review_comments (
  id SERIAL PRIMARY KEY,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  text TEXT NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS review_comments_thread_idx ON review_comments (review_id, id);
GRANT ALL ON TABLE review_comments TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE review_comments_id_seq TO smartplate;

COMMIT;
