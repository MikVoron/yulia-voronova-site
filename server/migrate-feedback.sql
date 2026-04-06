-- Миграция: обращения пользователей (feedback)
-- Выполнить на VPS: psql -U smartplate -d smartplate -f migrate-feedback.sql

CREATE TABLE IF NOT EXISTS feedback_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category VARCHAR(20) NOT NULL DEFAULT 'wish' CHECK (category IN ('wish', 'recipe', 'problem')),
  text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'answered')),
  admin_reply TEXT,
  admin_replied_at TIMESTAMPTZ,
  admin_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_messages (status);

GRANT ALL ON TABLE feedback_messages TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE feedback_messages_id_seq TO smartplate;
