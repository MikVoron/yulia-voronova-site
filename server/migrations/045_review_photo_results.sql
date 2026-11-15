BEGIN;
CREATE TABLE IF NOT EXISTS review_photo_results (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  decision_key TEXT NOT NULL UNIQUE,
  photos JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 minute',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  superseded BOOLEAN NOT NULL DEFAULT false,
  message_id TEXT
);
CREATE INDEX IF NOT EXISTS review_photo_results_due_idx ON review_photo_results(due_at)
  WHERE sent_at IS NULL AND skipped_at IS NULL AND NOT superseded;
CREATE INDEX IF NOT EXISTS review_photo_results_unread_idx ON review_photo_results(user_id,id DESC)
  WHERE read_at IS NULL AND NOT superseded;
GRANT SELECT,INSERT,UPDATE,DELETE ON review_photo_results TO smartplate;
GRANT USAGE,SELECT ON SEQUENCE review_photo_results_id_seq TO smartplate;
COMMIT;
