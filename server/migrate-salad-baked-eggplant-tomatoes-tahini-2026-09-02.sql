-- Салат из печеных баклажанов с томатами и тахини.
-- Новый неопубликованный Pro-черновик из подтверждённого автором текста.
-- Фото будут добавлены отдельной миграцией: photo = NULL, фото шагов не заданы.
-- Применить:
--   scp server/migrate-salad-baked-eggplant-tomatoes-tahini-2026-09-02.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-salad-baked-eggplant-tomatoes-tahini-2026-09-02.sql"

BEGIN;

-- Не допускаем перезапись другого рецепта при неожиданном совпадении id.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'salad-baked-eggplant-tomatoes-tahini'
      AND name <> 'Салат из печеных баклажанов с томатами и тахини'
  ) THEN
    RAISE EXCEPTION 'Recipe id salad-baked-eggplant-tomatoes-tahini already belongs to another recipe';
  END IF;
END $guard$;

INSERT INTO recipes (
  id, cat, name, emoji,
  time_min, time_label, difficulty, servings, is_free, access_level,
  kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote, note,
  ingredients, steps,
  vk_video, yt_video, dzen_video,
  add_protein, add_fat, add_carbs, add_fiber,
  portion_grams, is_published, sort_order, auto_addons, is_soup,
  main_ingredients, dietary_flags, dietary_verified
) VALUES (
  'salad-baked-eggplant-tomatoes-tahini',
  'salads',
  'Салат из печеных баклажанов с томатами и тахини',
  NULL,
  60,
  NULL,
  'easy',
  4,
  false,
  'pro',
  112, 4, 5, 17, 8,
  ARRAY['растительное', 'без сои', 'без глютена'],
  NULL,
  NULL,
  'Этот салат — идеальный пример того, как простые ингредиенты превращаются в изысканное блюдо. Печёные баклажаны дают нежную, почти кремовую текстуру, тахини добавляет ореховую глубину, маринованный лук — лёгкую кислинку и хруст, а помидоры — сочность и свежесть. Обязательно попробуйте салат перед подачей: возможно, вам захочется добавить ещё лимонного сока или чёрного перца, чтобы сделать вкус ярче и острее.',
  NULL,
  '[
    {"name": "Баклажаны: 800 г", "swap": null},
    {"name": "Помидоры: 200 г", "swap": null},
    {"name": "Красный лук: 50 г", "swap": null},
    {"name": "Петрушка: 15 г", "swap": null},
    {"name": "Тахини: 30 г", "swap": null},
    {"name": "Лимонный сок: 3 ст. л.", "swap": null},
    {"name": "Вода: 2 ст. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Разогрейте духовку до 220 °C, режим верх-низ. Баклажаны проколите вилкой в нескольких местах, положите целиком на противень и запекайте около 40 минут, пока кожица не потемнеет и не сморщится, а мякоть не станет очень мягкой."},
    {"text": "Пока баклажаны запекаются, нарежьте красный лук тонкими кольцами. Добавьте 1 ст. л. лимонного сока и щепотку соли, слегка перемешайте и оставьте мариноваться на 10–15 минут."},
    {"text": "Для заправки соедините тахини, оставшийся лимонный сок, 2 ст. л. воды и небольшую щепотку соли. Хорошо перемешайте до гладкой кремовой консистенции жидкой сметаны. После добавления лимона тахини сначала может сильно загустеть — это нормально."},
    {"text": "Дайте баклажанам немного остыть, разрежьте вдоль и выньте мякоть ложкой. Переложите её в сито примерно на 10 минут, чтобы стекла лишняя жидкость."},
    {"text": "Пока баклажаны стекают, нарежьте помидоры кубиками примерно 1 см и мелко порубите петрушку."},
    {"text": "Порубите баклажаны ножом на кусочки примерно 1 см."},
    {"text": "Соедините баклажаны, маринованный красный лук (слегка отожмите) и петрушку. Добавьте заправку из тахини и аккуратно перемешайте."},
    {"text": "В самом конце добавьте помидоры, посолите по вкусу, добавьте чёрный перец и ещё раз осторожно перемешайте, чтобы кусочки баклажана и помидоров сохранили форму."}
  ]'::jsonb,
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  130,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['eggplant', 'tomatoes'],
  ARRAY[]::text[],
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('salad-baked-eggplant-tomatoes-tahini', 'salads')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, photo, main_ingredients,
       dietary_flags, dietary_verified, servings, portion_grams,
       kcal, protein, fat, carbs, fiber
FROM recipes
WHERE id = 'salad-baked-eggplant-tomatoes-tahini';
