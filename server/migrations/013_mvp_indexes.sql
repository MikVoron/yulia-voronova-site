-- 013: MVP indexes for hot auth/login paths
--
-- Verified against live schema 2026-05-10: none of these existed.
-- All hits below currently do sequential scans on every request.
--
-- Apply (run from local repo):
--   scp server/migrations/013_mvp_indexes.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/013_mvp_indexes.sql"
--
-- Idempotent: safe to re-run. Tables are tiny on MVP, so plain CREATE INDEX
-- is fine (no need for CONCURRENTLY).

-- Hot lookup on every /auth/refresh:
--   SELECT ... FROM refresh_sessions WHERE refresh_token_hash=$1 AND expires_at > now()
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_token_hash
  ON refresh_sessions(refresh_token_hash);

-- Rate-limit check on every /auth/send-code:
--   SELECT COUNT(*) FROM login_codes WHERE ip=$1 AND created_at > now() - interval '15 minutes'
CREATE INDEX IF NOT EXISTS idx_login_codes_ip_recent
  ON login_codes(ip, created_at DESC);

-- Verify-code lookup on every /auth/verify, plus rate-limit on /auth/send-code:
--   SELECT * FROM login_codes WHERE email=$1 AND used=false AND expires_at > now()
--                              ORDER BY created_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_login_codes_email_lookup
  ON login_codes(email, used, expires_at DESC, created_at DESC);

-- Rollback (if ever needed):
--   DROP INDEX IF EXISTS idx_refresh_sessions_token_hash;
--   DROP INDEX IF EXISTS idx_login_codes_ip_recent;
--   DROP INDEX IF EXISTS idx_login_codes_email_lookup;
