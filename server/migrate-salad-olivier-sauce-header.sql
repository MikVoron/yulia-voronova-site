-- Targeted migration: salad-olivier-tofu — replace the "Соус: …" line prefix
-- with a proper group sub-header "— Соус —" (same convention as "— Тесто —"
-- in cabbage-salmon-pie), and drop the per-line "Соус:" prefix.
--
-- Before:                                   After:
--   …main ingredients…                        …main ingredients…
--   Соус: белая фасоль отварная — 300 г        — Соус —
--   Соус: дижонская горчица — 2 ч. л.          Белая фасоль отварная: 300 г
--   …                                          Дижонская горчица: 2 ч. л.
--                                              …
--
-- The 6 sauce items are contiguous and at the END of the array, so the result is
--   [ non-sauce items ] || [ "— Соус —" header ] || [ transformed sauce items ].
-- Sauce item swaps are preserved (jsonb_set touches only {name}).
--
-- Order-independent vs migrate-ingredient-colon-separator.sql:
--   * non-sauce ("main") items are passed through unchanged here and colon-ized by
--     the generic rule (they contain no ": ");
--   * sauce items are matched by their exact original name, so once transformed the
--     generic rule no longer touches them (they then contain ": ", excluded there).
--
-- Idempotent: matched by exact old names; a second run finds no matches and the
-- header concat would duplicate — so DO NOT re-run. Guarded by WHERE on the old
-- prefix existing.
--
-- Apply (after the before→after list is confirmed):
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db" < server/migrate-salad-olivier-sauce-header.sql

BEGIN;

UPDATE recipes r
SET ingredients = (
  SELECT
    coalesce(jsonb_agg(e   ORDER BY ord) FILTER (WHERE NOT is_sauce), '[]'::jsonb)
    || '[{"name": "— Соус —", "swap": null}]'::jsonb
    || coalesce(jsonb_agg(ne ORDER BY ord) FILTER (WHERE is_sauce),     '[]'::jsonb)
  FROM (
    SELECT
      elem AS e,
      ord,
      (elem->>'name' LIKE 'Соус: %') AS is_sauce,
      CASE elem->>'name'
        WHEN 'Соус: белая фасоль отварная — 300 г'
          THEN jsonb_set(elem, '{name}', '"Белая фасоль отварная: 300 г"')
        WHEN 'Соус: дижонская горчица — 2 ч. л.'
          THEN jsonb_set(elem, '{name}', '"Дижонская горчица: 2 ч. л."')
        WHEN 'Соус: лимонный сок — 2 ст. л.'
          THEN jsonb_set(elem, '{name}', '"Лимонный сок: 2 ст. л."')
        WHEN 'Соус: оливковое масло — 1 ст. л.'
          THEN jsonb_set(elem, '{name}', '"Оливковое масло: 1 ст. л."')
        WHEN 'Соус: соль кала намак — 1 ч. л.'
          THEN jsonb_set(elem, '{name}', '"Соль кала намак: 1 ч. л."')
        WHEN 'Соус: вода — 3 ст. л. (до желаемой густоты)'
          THEN jsonb_set(elem, '{name}', '"Вода: 3 ст. л. (до желаемой густоты)"')
        ELSE elem
      END AS ne
    FROM jsonb_array_elements(r.ingredients) WITH ORDINALITY AS t(elem, ord)
  ) s
)
WHERE r.id = 'salad-olivier-tofu'
  AND r.ingredients::text LIKE '%Соус: %';   -- guard: skip if already migrated

COMMIT;
