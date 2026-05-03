-- Confirmed recipe fixes:
-- 1. salmon-cauliflower-cutlets: time_min is the lower bound of "40–45 минут".
-- 2. side-brown-rice: portion_grams=170 and explicit time_label with soaking excluded.
-- Apply:
--   ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-fix-salmon-cutlets-brown-rice.sql

UPDATE recipes
SET
  time_min = 40,
  time_label = '40–45 минут',
  updated_at = now()
WHERE id = 'salmon-cauliflower-cutlets';

UPDATE recipes
SET
  portion_grams = 170,
  time_min = 25,
  time_label = '25 минут, без учета замачивания',
  updated_at = now()
WHERE id = 'side-brown-rice';
