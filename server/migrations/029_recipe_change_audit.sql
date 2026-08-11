-- 029: Traceable admin recipe changes and stable refresh-session identity.

ALTER TABLE refresh_sessions
  ADD COLUMN IF NOT EXISTS session_id UUID;

UPDATE refresh_sessions
   SET session_id = gen_random_uuid()
 WHERE session_id IS NULL;

ALTER TABLE refresh_sessions
  ALTER COLUMN session_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN session_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_session_id
  ON refresh_sessions(session_id);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[];

CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_session_id ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_log(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS recipe_revisions (
  id BIGSERIAL PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  before_data JSONB,
  after_data JSONB,
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  admin_user_id UUID,
  audit_log_id BIGINT,
  request_id TEXT NOT NULL,
  session_id UUID,
  ip INET,
  ua TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_revisions_recipe_created
  ON recipe_revisions(recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_revisions_admin_created
  ON recipe_revisions(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_revisions_request
  ON recipe_revisions(request_id);

GRANT ALL ON TABLE recipe_revisions TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE recipe_revisions_id_seq TO smartplate;

-- Rollback (data-destructive; run manually only after exporting history):
-- DROP TABLE IF EXISTS recipe_revisions;
-- ALTER TABLE audit_log DROP COLUMN IF EXISTS changed_fields,
--   DROP COLUMN IF EXISTS entity_id, DROP COLUMN IF EXISTS entity_type,
--   DROP COLUMN IF EXISTS session_id, DROP COLUMN IF EXISTS request_id;
-- ALTER TABLE refresh_sessions DROP COLUMN IF EXISTS session_id;
