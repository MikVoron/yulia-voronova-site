-- 017: Prevent duplicate pending payment submissions per user.
--
-- A user may have many historical payments, but only one payment awaiting
-- admin review at a time. This closes the race between the API's pre-check
-- and the INSERT when two requests arrive in parallel.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_pending_per_user
  ON payments(user_id)
  WHERE status = 'pending';

-- Rollback (if ever needed):
--   DROP INDEX IF EXISTS idx_payments_one_pending_per_user;
