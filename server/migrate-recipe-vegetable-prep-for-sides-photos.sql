BEGIN;

DO $publish$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipes r
    WHERE r.id = 'vegetable-prep-for-sides'
      AND (SELECT jsonb_agg(CASE jsonb_typeof(step)
             WHEN 'string' THEN step ELSE step->'text' END ORDER BY pos)
           FROM jsonb_array_elements(r.steps) WITH ORDINALITY AS e(step, pos))
          = $expected$["Вымойте и очистите овощи. У лука-порея используйте белую и нежную светло-зелёную часть.","Мелко нарежьте овощи или измельчите в кухонном комбайне, сохраняя небольшие кусочки и не превращая смесь в пюре.","Разогрейте масло в глубокой сковороде. Обжарьте репчатый лук и лук-порей около 7 минут. Если готовите без масла, потушите их с небольшим количеством воды.","Добавьте морковь и сельдерей. Тушите без крышки около 10–15 минут, периодически перемешивая. При необходимости добавьте немного воды.","Доведите овощи до полуготовности, снимите с огня и подготовьте силиконовые формы объёмом 125 мл для замораживания.","Остудите смесь и распределите по формочкам.","Заморозьте. После полного замораживания достаньте кубики из формочек и переложите в пакет или контейнер для хранения в морозильной камере."]$expected$::jsonb
  ) THEN
    RAISE EXCEPTION 'Current recipe step text or order differs from the reviewed recipe';
  END IF;

  UPDATE recipes
  SET photo = 'images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-cover.webp',
      steps = (
        SELECT jsonb_agg(CASE pos
      WHEN 2 THEN jsonb_set(step, '{photo}', '"images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-2.webp"'::jsonb)
      WHEN 3 THEN jsonb_set(step, '{photo}', '"images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-3.webp"'::jsonb)
      WHEN 4 THEN jsonb_set(step, '{photo}', '"images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-4.webp"'::jsonb)
      WHEN 5 THEN jsonb_set(step, '{photo}', '["images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-5.1.webp","images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-5.2.webp"]'::jsonb)
      WHEN 6 THEN jsonb_set(step, '{photo}', '["images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-6.1.webp","images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-6.2.webp"]'::jsonb)
      WHEN 7 THEN jsonb_set(step, '{photo}', '"images/recipes/vegetable-prep-for-sides/vegetable-prep-for-sides-7.webp"'::jsonb)
          ELSE step END ORDER BY pos)
        FROM (
          SELECT CASE jsonb_typeof(value)
            WHEN 'string' THEN jsonb_build_object('text', value #>> '{}')
            ELSE value
          END AS step, pos
          FROM jsonb_array_elements(steps) WITH ORDINALITY AS entries(value, pos)
        ) AS normalized
      ),
      is_published = true,
      updated_at = now()
  WHERE id = 'vegetable-prep-for-sides'
    AND cat = 'bases'
    AND NOT is_published
    AND photo IS NULL
    AND jsonb_array_length(steps) = 7
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(steps) AS entries(step)
      WHERE jsonb_typeof(step) NOT IN ('string', 'object')
         OR (step->'photo' IS NOT NULL AND step->'photo' <> 'null'::jsonb)
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expected unpublished vegetable prep with seven steps and no photos';
  END IF;
END $publish$;

COMMIT;
