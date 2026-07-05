-- Persist dismissal of rejected-payment notices across browsers and devices.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS notice_dismissed_at TIMESTAMPTZ;
