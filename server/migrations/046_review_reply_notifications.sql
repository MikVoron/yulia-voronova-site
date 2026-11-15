BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_review_replies BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_review_replies BOOLEAN NOT NULL DEFAULT true;
-- Only new messages enqueue events. Deliberately no backfill of existing replies.
CREATE TABLE IF NOT EXISTS review_reply_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  comment_id INTEGER UNIQUE REFERENCES review_comments(id) ON DELETE CASCADE,
  reply_id INTEGER UNIQUE REFERENCES review_replies(review_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sending','sent','skipped','failed','uncertain')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  message_id TEXT,
  error_code TEXT,
  CHECK ((comment_id IS NOT NULL)::int + (reply_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS review_reply_notifications_due_idx ON review_reply_notifications(due_at) WHERE email_status='pending';
CREATE INDEX IF NOT EXISTS review_reply_notifications_user_idx ON review_reply_notifications(user_id,id DESC);
GRANT SELECT,INSERT,UPDATE,DELETE ON review_reply_notifications TO smartplate;
GRANT USAGE,SELECT ON SEQUENCE review_reply_notifications_id_seq TO smartplate;
COMMIT;
