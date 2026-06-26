-- 018: Keep refresh-session cleanup/capping cheap per user.

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user_expires
  ON refresh_sessions(user_id, expires_at DESC);

-- Rollback:
--   DROP INDEX IF EXISTS idx_refresh_sessions_user_expires;
