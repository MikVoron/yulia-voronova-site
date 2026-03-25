-- Миграция: защита триала от абьюза
-- Выполнить на VPS: psql -U smartplate -d smartplate -f migrate-trial-guard.sql

-- Таблица для хранения fingerprint + IP при выдаче триала
CREATE TABLE IF NOT EXISTS trial_fingerprints (
  id SERIAL PRIMARY KEY,
  fingerprint VARCHAR(64) NOT NULL,
  ip INET NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_fp ON trial_fingerprints (fingerprint);
CREATE INDEX IF NOT EXISTS idx_trial_ip ON trial_fingerprints (ip);

-- Доп. колонки в subscriptions для аудита
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS registration_ip INET;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS registration_fingerprint VARCHAR(64);

-- Права
GRANT ALL ON TABLE trial_fingerprints TO smartplate;
GRANT USAGE, SELECT ON SEQUENCE trial_fingerprints_id_seq TO smartplate;
