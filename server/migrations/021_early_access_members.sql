-- 021: permanent early-access membership and an auditable manual seat reserve.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS early_access_member BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS early_access_granted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS early_access_adjustments (
  id BIGSERIAL PRIMARY KEY,
  slots_delta INTEGER NOT NULL CHECK (slots_delta BETWEEN -30 AND 30 AND slots_delta <> 0),
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 3 AND 500),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
