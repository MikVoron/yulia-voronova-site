-- Публичные ответы автора платформы под отзывами к рецептам.
-- Выполнить на VPS:
-- sudo -u postgres psql smartplate_db -f /tmp/023_review_replies.sql

BEGIN;

CREATE TABLE IF NOT EXISTS review_replies (
  review_id  INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  admin_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON TABLE review_replies TO smartplate;

COMMIT;
