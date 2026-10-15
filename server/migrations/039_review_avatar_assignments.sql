-- Persistent, cyclic food avatars for reviewers without a public name.
-- The approved reviewer from 2026-10-02 (review #43) starts the pack with avocado.
BEGIN;

CREATE TABLE IF NOT EXISTS review_avatar_counter (
  id INTEGER PRIMARY KEY CHECK (id=1),
  next_position BIGINT NOT NULL CHECK (next_position>=0)
);
CREATE TABLE IF NOT EXISTS review_avatar_assignments (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  position BIGINT NOT NULL UNIQUE CHECK (position>=0)
);
INSERT INTO review_avatar_counter (id, next_position) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
SELECT id FROM review_avatar_counter WHERE id=1 FOR UPDATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM reviews WHERE id=43
      AND user_id='7326edb4-fafa-49d1-abdb-75b478a4a58d'::uuid
      AND recipe_id='toast-sardines-roasted-tomatoes'
  ) THEN
    RAISE EXCEPTION 'Expected first reviewer not found; avatar migration aborted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM review_avatar_assignments
    WHERE (position=0 AND user_id<>'7326edb4-fafa-49d1-abdb-75b478a4a58d'::uuid)
       OR (user_id='7326edb4-fafa-49d1-abdb-75b478a4a58d'::uuid AND position<>0)
  ) THEN
    RAISE EXCEPTION 'Existing avatar order differs; refusing to reassign users';
  END IF;
END $$;

INSERT INTO review_avatar_assignments (user_id, position)
VALUES ('7326edb4-fafa-49d1-abdb-75b478a4a58d'::uuid, 0)
ON CONFLICT (user_id) DO NOTHING;

WITH candidates AS (
  SELECT u.id, MIN(r.id) AS first_review_id
  FROM users u JOIN reviews r ON r.user_id=u.id
  WHERE NULLIF(btrim(u.display_name), '') IS NULL
    AND NOT EXISTS (SELECT 1 FROM review_avatar_assignments a WHERE a.user_id=u.id)
  GROUP BY u.id
), numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY first_review_id, id) AS avatar_offset
  FROM candidates
)
INSERT INTO review_avatar_assignments (user_id, position)
SELECT id, (SELECT COALESCE(MAX(position), -1) FROM review_avatar_assignments) + avatar_offset
FROM numbered;

UPDATE review_avatar_counter
SET next_position=GREATEST(next_position,
  (SELECT COALESCE(MAX(position), -1)+1 FROM review_avatar_assignments))
WHERE id=1;
GRANT SELECT, INSERT ON review_avatar_assignments TO smartplate;
GRANT SELECT, UPDATE ON review_avatar_counter TO smartplate;

COMMIT;
