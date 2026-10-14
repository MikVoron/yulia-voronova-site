-- Гранола с тыквенным пюре.
-- Неопубликованный Pro-черновик; strict / docs/ai-recipe-input-contract.md.
-- Применить на VPS из каталога с файлом:
-- sudo -u postgres psql -X -P pager=off -v ON_ERROR_STOP=1 -d smartplate_db -f migrate-recipe-granola-pumpkin-puree-2026-10-14.sql
--
-- _filled_from_input:
--   name: Гранола с тыквенным пюре (подтверждено);
--   id: granola-pumpkin-puree (из названия); cat: breakfasts (завтраки);
--   time_min: 50; time_label: около 50 минут с готовым пюре, без учёта остывания;
--   difficulty: easy; servings: 16 (около); portion_grams: 40;
--   kcal/protein/fat/carbs/fiber: 161/5/7/20/3;
--   tags: растительное, без сои; main_ingredients: oats, pumpkin;
--   ingredients: 8; steps: 11; quote и note: полный авторский текст;
--   тыква: 200 °C; гранола: 160 °C, режим «верх–низ» (подтверждено);
--   удалён только повторный шаг выкладывания гранолы тонким ровным слоем;
--   add_protein: йогурт 2-5% 150 г, коровье молоко 2,5% 150 мл,
--     соевое молоко 150 мл; КБЖУ каждой добавки взяты из входного текста;
--   photo: NULL; steps[].photo: true (фотографии позже, контракт §2.3).
-- _needs_clarification: []
-- _not_provided: emoji, vk_video, yt_video, dzen_video,
--   диетическая разметка и замены — проверяются отдельно в редакторе.
-- Вступительный абзац не включён по указанию пользователя.
-- TODO: добавить фотографии; sort_order=0 — назначить вручную при публикации.
-- Повторное применение не перезаписывает рецепт, фотографии или публикацию.

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recipes
    WHERE id = 'granola-pumpkin-puree'
      AND (name IS DISTINCT FROM 'Гранола с тыквенным пюре'
           OR cat IS DISTINCT FROM 'breakfasts')
  ) THEN
    RAISE EXCEPTION 'Recipe id granola-pumpkin-puree already belongs to another recipe or category';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = 'breakfasts') THEN
    RAISE EXCEPTION 'Category breakfasts is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'oats' AND name = 'Овсянка' AND group_id = 'grains'
  ) OR NOT EXISTS (
    SELECT 1 FROM ingredient_catalog
    WHERE id = 'pumpkin' AND name = 'Тыква' AND group_id = 'vegetables'
  ) THEN
    RAISE EXCEPTION 'Existing oats and pumpkin ingredient catalog entries are required';
  END IF;
END $guard$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free, access_level,
  kcal, protein, fat, carbs, fiber, tags, photo, quote, note,
  ingredients, steps,
  vk_video, yt_video, dzen_video,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients
) VALUES (
  'granola-pumpkin-puree',
  'breakfasts',
  'Гранола с тыквенным пюре',
  NULL,
  50, 'около 50 минут с готовым пюре, без учёта остывания', 'easy', 16, false, 'pro',
  161, 5, 7, 20, 3,
  ARRAY['растительное', 'без сои'],
  NULL,
  'Тыквенное пюре и мёд обволакивают хлопья, а орехи и семечки добавляют приятный хруст. Попробуйте посыпать этой гранолой обычный натуральный йогурт — получится совсем другой завтрак, с тёплым ароматом корицы и имбиря.',
  'Орехи и семечки можно выбирать по вкусу. В этом рецепте использована смесь кешью, миндаля, грецких орехов и арахиса, а также тыквенные и подсолнечные семечки. При замене смеси КБЖУ немного изменятся.',
  '[
    {"name": "Овсяные хлопья долгой варки: 300 г", "swap": null},
    {"name": "Орехи: 120 г", "swap": null},
    {"name": "Тыквенные и подсолнечные семечки: 70 г", "swap": null},
    {"name": "Тыквенное пюре: 120 г", "swap": null},
    {"name": "Мёд: 70 г", "swap": null},
    {"name": "Корица: 1½ ч. л.", "swap": null},
    {"name": "Молотый имбирь: ½ ч. л.", "swap": null},
    {"name": "Соль: ¼ ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разогрейте духовку до 200 °C.", "photo": true},
    {"text": "Разрежьте небольшую тыкву хоккайдо пополам и удалите семена.", "photo": true},
    {"text": "Положите половинки на противень срезом вниз и запекайте примерно 30–40 минут, пока мякоть не станет совсем мягкой.", "photo": true},
    {"text": "Немного остудите и пробейте мякоть блендером до гладкости.", "photo": true},
    {"text": "Для гранолы отмерьте 120 г пюре. Оно должно быть густым, не водянистым.", "photo": true},
    {"text": "Остальное пюре можно заморозить и использовать для следующей партии гранолы.", "photo": true},
    {"text": "Орехи крупно порубите. В большой миске соедините овсяные хлопья, орехи и семечки. Поместите смесь на противень, застеленный пергаментом.", "photo": true},
    {"text": "В отдельной миске смешайте тыквенное пюре, мёд, корицу, имбирь, соль до однородности.", "photo": true},
    {"text": "Добавьте тыквенно-медовую смесь к хлопьям, орехам и семечкам. Тщательно перемешайте, чтобы все хлопья были равномерно покрыты.", "photo": true},
    {"text": "Запекайте 30–40 минут при 160 °C в режиме «верх–низ». Примерно через 20 минут хорошо перемешайте, затем проверяйте каждые 7–10 минут.", "photo": true},
    {"text": "Достаньте гранолу, когда она станет золотистой и сухой. Полностью остудите гранолу. Не ждите, пока она полностью затвердеет в духовке - окончательно хрустящей она станет после остывания.", "photo": true}
  ]'::jsonb,
  NULL, NULL, NULL,
  '[
    {"name": "йогурт 2-5%", "amount": "150 г", "kcal": 98, "protein": 6, "fat": 5, "carbs": 7, "fiber": 0},
    {"name": "коровье молоко 2,5%", "amount": "150 мл", "kcal": 80, "protein": 4, "fat": 4, "carbs": 7, "fiber": 0},
    {"name": "соевое молоко", "amount": "150 мл", "kcal": 50, "protein": 5, "fat": 3, "carbs": 0, "fiber": 0}
  ]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  40, false, 0, '{}'::jsonb, false,
  ARRAY['oats', 'pumpkin']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('granola-pumpkin-puree', 'breakfasts')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, emoji, photo, main_ingredients,
       time_min, time_label, difficulty, servings, portion_grams,
       kcal, protein, fat, carbs, fiber, tags,
       jsonb_array_length(ingredients) AS ingredient_count,
       jsonb_array_length(steps) AS step_count,
       add_protein, add_fat, add_carbs, add_fiber
FROM recipes WHERE id = 'granola-pumpkin-puree';
