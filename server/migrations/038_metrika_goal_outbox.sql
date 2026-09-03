-- 038: durable server-side delivery for critical Yandex Metrica goals.
-- ClientID is cleared after successful delivery to minimise retained analytics data.
CREATE TABLE IF NOT EXISTS metrika_goal_outbox (
  id BIGSERIAL PRIMARY KEY,
  goal_id VARCHAR(64) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metrika_client_id VARCHAR(32),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'sending', 'retry', 'delivered'))
);

-- A user can create only one new account, so this protects the canonical
-- registration conversion from accidental duplicate delivery.
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrika_goal_outbox_registration_user
  ON metrika_goal_outbox (user_id, goal_id)
  WHERE user_id IS NOT NULL AND goal_id = 'registration_completed';
CREATE INDEX IF NOT EXISTS idx_metrika_goal_outbox_pending
  ON metrika_goal_outbox (status, next_attempt_at, occurred_at);

GRANT ALL ON TABLE metrika_goal_outbox TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE metrika_goal_outbox_id_seq TO smartplate;
