BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS review_friend_badge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_review_badge TEXT
    CHECK (public_review_badge IN ('friend', 'cooks-with-us', 'shares-experience'));

CREATE TABLE IF NOT EXISTS user_review_badges_seen (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge TEXT NOT NULL CHECK (badge IN ('friend', 'cooks-with-us', 'shares-experience')),
  PRIMARY KEY (user_id, badge)
);

GRANT SELECT, INSERT ON TABLE user_review_badges_seen TO smartplate;

COMMIT;
