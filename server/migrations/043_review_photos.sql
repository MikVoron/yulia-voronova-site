-- Photos belong to the existing single rating; adding photos never adds stars.
BEGIN;

CREATE TABLE IF NOT EXISTS review_photos (
  id UUID PRIMARY KEY,
  review_id INTEGER REFERENCES reviews(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  input_sha256 TEXT NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deleted')),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 1200),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 1200),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 2097152),
  reason TEXT CHECK (char_length(reason) <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_at TIMESTAMPTZ,
  moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  files_deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS review_photos_review_idx ON review_photos(review_id, created_at);
CREATE INDEX IF NOT EXISTS review_photos_user_time_idx ON review_photos(user_id, created_at);
CREATE INDEX IF NOT EXISTS review_photos_pending_idx ON review_photos(created_at) WHERE status='pending';

CREATE TABLE IF NOT EXISTS review_photo_notifications (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, batch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON review_photos, review_photo_notifications TO smartplate;

COMMIT;
