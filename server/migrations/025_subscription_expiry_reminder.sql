-- 025: one reminder three days before an active paid subscription expires
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_active_expiry_reminder
  ON subscriptions (active_until)
  WHERE status = 'active' AND expiry_reminder_sent_at IS NULL;
