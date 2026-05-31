-- Migration: ingredient "name — amount" → "name: amount" (editorial format).
--
-- Scope (strict, hardened):
--   * touches ONLY recipes.ingredients (JSONB), ONLY the `name` field;
--   * converts ONLY when " — " (space + em dash + space) is immediately followed
--     by a QUANTITY — i.e. an ASCII digit 0-9 OR a Unicode vulgar fraction
--     (½ ¼ ¾ ⅓ …). Lines like "Соль — по вкусу", "Масло — немного для жарки",
--     "Чили — на кончике ч. л." keep their em dash (not a numeric quantity);
--   * replaces ONLY the FIRST such " — " via regexp_replace WITHOUT the 'g' flag;
--     the leading quantity char is preserved through backreference \1;
--   * does NOT touch swap, steps, note, description, или код;
--   * section headers like "— Тесто —" have no " — <digit>" → skipped;
--   * en dash "–" and hyphen "-" are intentionally NOT migrated.
--
-- Group-prefixed names keep their prefix: "Соус: белая фасоль отварная — 300 г"
-- → "Соус: белая фасоль отварная: 300 г" (prefix preserved, separator converted).
--
-- Idempotent: re-running finds no " — <digit>" left → no-op.
--
-- Apply (ONLY after the SELECT audit is confirmed):
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db" < server/migrate-ingredient-colon-separator.sql

BEGIN;

UPDATE recipes r
SET ingredients = sub.new_ings
FROM (
  SELECT r2.id,
         jsonb_agg(
           CASE
             -- object form: {"name": "...", ...} — rewrite name, keep other keys.
             -- NOT LIKE '%: %' excludes group-prefixed lines ("Соус: … — N"), which
             -- are reordered by hand in migrate-sauce-group-reorder.sql to avoid a
             -- second colon. Makes this rule order-independent of that one.
             WHEN jsonb_typeof(elem) = 'object'
                  AND elem ? 'name'
                  AND (elem->>'name') ~ ' — [0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]'
                  AND (elem->>'name') NOT LIKE '%: %'
             THEN jsonb_set(elem, '{name}',
                            to_jsonb(regexp_replace(elem->>'name',
                              ' — ([0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])', ': \1')))
             -- bare string form
             WHEN jsonb_typeof(elem) = 'string'
                  AND (elem #>> '{}') ~ ' — [0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]'
                  AND (elem #>> '{}') NOT LIKE '%: %'
             THEN to_jsonb(regexp_replace(elem #>> '{}',
                              ' — ([0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])', ': \1'))
             ELSE elem
           END
           ORDER BY ord
         ) AS new_ings
  FROM recipes r2,
       jsonb_array_elements(r2.ingredients) WITH ORDINALITY AS t(elem, ord)
  GROUP BY r2.id
) sub
WHERE r.id = sub.id
  AND r.ingredients::text ~ ' — [0-9¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]';  -- only recipes with a numeric " — " separator

COMMIT;

-- This rule converts 441 lines (447 numeric " — " minus 6 group-prefixed lines,
-- which are handled by migrate-sauce-group-reorder.sql).
--
-- Post-migration sanity — run AFTER BOTH this file AND migrate-sauce-group-reorder.sql:
--   SELECT count(*) FROM recipes, jsonb_array_elements(ingredients) ing
--     WHERE ing->>'name' ~ ' — [0-9¼½¾⅓⅔⅛]';   -- expect 0 (no numeric em-dash left)
--   SELECT count(*) FROM recipes, jsonb_array_elements(ingredients) ing
--     WHERE ing->>'name' LIKE '% — %';            -- expect ~21 (intentional: "по вкусу", "щепотка", …)
--   SELECT count(*) FROM recipes, jsonb_array_elements(ingredients) ing
--     WHERE ing->>'name' LIKE '%: %';             -- expect ~447 (441 converted + 6 group lines)
--   SELECT ing->>'name' FROM recipes, jsonb_array_elements(ingredients) ing
--     WHERE ing->>'name' LIKE '%:: %';            -- expect 0 rows (no adjacent double colon)
