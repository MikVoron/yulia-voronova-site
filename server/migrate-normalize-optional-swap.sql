-- Normalize optional-ingredient marker across recipes.
-- Move "(можно без него)" out of ingredient name into swap="Можно без него".
-- Also normalize existing swap values to canonical "Можно без него".

BEGIN;

-- grechotto: "овощной концентрат -  1 ч. л.  (можно без него)"
UPDATE recipes
SET ingredients = (
    SELECT jsonb_agg(
        CASE
            WHEN ing->>'name' = 'овощной концентрат -  1 ч. л.  (можно без него)'
                THEN jsonb_set(
                    jsonb_set(ing, '{name}', '"овощной концентрат — 1 ч. л."'),
                    '{swap}', '"Можно без него"'
                )
            ELSE ing
        END
    )
    FROM jsonb_array_elements(ingredients) AS ing
)
WHERE id = 'grechotto';

-- avocado-toast: "1/2 сладкого красного лука (можно без него)"
UPDATE recipes
SET ingredients = (
    SELECT jsonb_agg(
        CASE
            WHEN ing->>'name' = '1/2 сладкого красного лука (можно без него)'
                THEN jsonb_set(
                    jsonb_set(ing, '{name}', '"1/2 сладкого красного лука"'),
                    '{swap}', '"Можно без него"'
                )
            ELSE ing
        END
    )
    FROM jsonb_array_elements(ingredients) AS ing
)
WHERE id = 'avocado-toast';

-- Normalize any existing lowercase "можно без него" → canonical "Можно без него".
UPDATE recipes
SET ingredients = (
    SELECT jsonb_agg(
        CASE
            WHEN lower(trim(ing->>'swap')) = 'можно без него'
                 AND (ing->>'swap') <> 'Можно без него'
                THEN jsonb_set(ing, '{swap}', '"Можно без него"')
            ELSE ing
        END
    )
    FROM jsonb_array_elements(ingredients) AS ing
)
WHERE ingredients @? '$[*] ? (@.swap like_regex "можно без него" flag "i")';

COMMIT;

-- Verify:
SELECT id, name, jsonb_agg(ing) AS optional_ings
FROM recipes, jsonb_array_elements(ingredients) AS ing
WHERE ing->>'swap' ILIKE '%можно без него%'
   OR ing->>'name' ILIKE '%можно без него%'
GROUP BY id, name;
