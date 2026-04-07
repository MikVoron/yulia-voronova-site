-- 006: Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  email VARCHAR(255),
  event VARCHAR(50) NOT NULL,
  detail TEXT,
  ip INET,
  ua TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log (event);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);

GRANT ALL ON TABLE audit_log TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO smartplate;
