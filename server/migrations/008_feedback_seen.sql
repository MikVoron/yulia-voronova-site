-- 008: Feedback reply seen badge
ALTER TABLE feedback_messages ADD COLUMN IF NOT EXISTS reply_seen BOOLEAN NOT NULL DEFAULT false;
