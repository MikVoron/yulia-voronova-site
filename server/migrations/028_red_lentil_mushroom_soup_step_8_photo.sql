-- Привязать загруженное фото готового блюда к восьмому шагу рецепта.
-- Обложка и финальное фото уже используют канонические пути и подхватываются фронтендом автоматически.
UPDATE recipes
SET
  steps = (
    SELECT jsonb_agg(
      CASE
        WHEN entry.ordinality = 8 AND jsonb_typeof(entry.step) = 'object' THEN
          jsonb_set(
            entry.step,
            '{photo}',
            to_jsonb('images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-8.webp'::text),
            true
          )
        WHEN entry.ordinality = 8 AND jsonb_typeof(entry.step) = 'string' THEN
          jsonb_build_object(
            'text', entry.step,
            'photo', 'images/recipes/red-lentil-mushroom-soup/red-lentil-mushroom-soup-8.webp'
          )
        ELSE entry.step
      END
      ORDER BY entry.ordinality
    )
    FROM jsonb_array_elements(steps) WITH ORDINALITY AS entry(step, ordinality)
  ),
  updated_at = now()
WHERE id = 'red-lentil-mushroom-soup'
  AND jsonb_typeof(steps) = 'array'
  AND jsonb_array_length(steps) >= 8;
