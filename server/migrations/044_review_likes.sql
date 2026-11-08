BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_review_likes BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_review_likes BOOLEAN NOT NULL DEFAULT false;

-- Inactive rows remember the first like, preventing repeated notifications on re-like.
CREATE TABLE IF NOT EXISTS review_likes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  comment_id INTEGER REFERENCES review_comments(id) ON DELETE CASCADE,
  reply_id INTEGER REFERENCES review_replies(review_id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(review_id, comment_id, reply_id) = 1),
  UNIQUE (user_id, review_id),
  UNIQUE (user_id, comment_id),
  UNIQUE (user_id, reply_id)
);
CREATE INDEX IF NOT EXISTS review_likes_review_idx ON review_likes(review_id) WHERE active;
CREATE INDEX IF NOT EXISTS review_likes_comment_idx ON review_likes(comment_id) WHERE active;
CREATE INDEX IF NOT EXISTS review_likes_reply_idx ON review_likes(reply_id) WHERE active;

CREATE TABLE IF NOT EXISTS review_like_notifications (
  id BIGSERIAL PRIMARY KEY,
  like_id BIGINT NOT NULL UNIQUE REFERENCES review_likes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  email_claimed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS review_like_notifications_unread_idx
  ON review_like_notifications(user_id, id DESC) WHERE read_at IS NULL;

-- Preserve existing helpful reactions as likes, without sending old notifications.
INSERT INTO review_likes(user_id, reply_id, created_at)
SELECT r.user_id, r.review_id, r.created_at FROM review_reply_reactions r
JOIN review_replies reply ON reply.review_id=r.review_id
ON CONFLICT (user_id, reply_id) DO NOTHING;

GRANT ALL ON TABLE review_likes, review_like_notifications TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE review_likes_id_seq, review_like_notifications_id_seq TO smartplate;
COMMIT;
