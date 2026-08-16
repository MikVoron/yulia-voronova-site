-- Keep the active preparation time visible and render the baking qualifier as a note.
UPDATE recipes
SET
  time_label = '25 минут (без запекания овощей)',
  updated_at = now()
WHERE id = 'salad-olivier-tofu'
  AND time_label IS DISTINCT FROM '25 минут (без запекания овощей)';
