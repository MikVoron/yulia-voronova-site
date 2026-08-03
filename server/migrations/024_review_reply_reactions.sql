-- Реакции «Полезный ответ» под публичными ответами Юлии на отзывы к рецептам.
-- Выполнить на VPS:
-- sudo -u postgres psql smartplate_db -f /tmp/024_review_reply_reactions.sql

BEGIN;

CREATE TABLE IF NOT EXISTS review_reply_reactions (
  review_id  INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_reply_reactions_review_id_idx
  ON review_reply_reactions (review_id);

GRANT ALL ON TABLE review_reply_reactions TO smartplate;

COMMIT;
