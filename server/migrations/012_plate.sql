-- Current plate: one row per user, items stored as JSONB array
CREATE TABLE IF NOT EXISTS plate_items (
    user_id    UUID         PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    items      JSONB        NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Plate history: each saved plate becomes a row
CREATE TABLE IF NOT EXISTS plate_history (
    id         SERIAL       PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    items      JSONB        NOT NULL DEFAULT '[]',
    totals     JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_plate_history_user ON plate_history(user_id, saved_at DESC);
