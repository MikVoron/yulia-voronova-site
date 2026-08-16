-- Show the active cooking time separately from the lentil soaking time.
UPDATE recipes
SET
  time_label = '40 минут (без учёта замачивания)',
  updated_at = now()
WHERE id = 'red-lentil-cutlets'
  AND time_label IS DISTINCT FROM '40 минут (без учёта замачивания)';
