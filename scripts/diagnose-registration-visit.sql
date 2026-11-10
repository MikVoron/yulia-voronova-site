-- Read-only. Supply psql variables: client_id, email_pattern, day_start, day_end.
-- email_pattern is a candidate search from the visible mask, not an identity match.
-- Never select code_hash, tokens, or submitted verification codes.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL statement_timeout = '10s';

SELECT now() AS checked_at_utc;

-- Delivered Metrika events may already have had their ClientID removed.
SELECT goal_id, user_id, occurred_at, status, delivered_at
FROM metrika_goal_outbox
WHERE metrika_client_id = :'client_id'
  AND occurred_at >= :'day_start'::timestamptz
  AND occurred_at < :'day_end'::timestamptz
ORDER BY occurred_at;

-- A row proves a code was generated, not that SMTP accepted or delivered it.
-- The normal cleanup can already have removed these rows.
SELECT email, created_at, expires_at, attempts, used, ip
FROM login_codes
WHERE email ILIKE :'email_pattern'
  AND created_at >= :'day_start'::timestamptz
  AND created_at < :'day_end'::timestamptz
ORDER BY created_at;

SELECT email, created_at, role, is_blocked
FROM users
WHERE email ILIKE :'email_pattern'
ORDER BY created_at;

SELECT email, event, detail, created_at, ip, request_id
FROM audit_log
WHERE email ILIKE :'email_pattern'
  AND created_at >= :'day_start'::timestamptz
  AND created_at < :'day_end'::timestamptz
ORDER BY created_at, id;

ROLLBACK;
