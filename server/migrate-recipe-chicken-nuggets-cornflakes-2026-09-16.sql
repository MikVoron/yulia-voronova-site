-- Куриные наггетсы в кукурузной панировке.
-- Бесплатный неопубликованный черновик из подтверждённого автором текста.
-- Фото будут добавлены отдельной миграцией: emoji = NULL, photo = NULL.
-- Применить на VPS:
--   scp server/migrate-recipe-chicken-nuggets-cornflakes-2026-09-16.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-chicken-nuggets-cornflakes-2026-09-16.sql"

BEGIN;

-- Не допускаем перезапись другого рецепта при неожиданном совпадении id.
DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM recipes
    WHERE id = 'cutlets-chicken-nuggets-cornflakes'
      AND name <> 'Куриные наггетсы в кукурузной панировке'
  ) THEN
    RAISE EXCEPTION 'Recipe id cutlets-chicken-nuggets-cornflakes already belongs to another recipe';
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
  'cutlets-chicken-nuggets-cornflakes',
  'cutlets',
  'Куриные наггетсы в кукурузной панировке',
  NULL,
  40,
  NULL,
  'medium',
  25,
  true,
  'free',
  43, 5, 1, 4, 1,
  ARRAY['без глютена', 'без сои'],
  NULL,
  NULL,
  'Домашние наггетсы — отличный способ приготовить любимое привычное блюдо легче - вместо жарки в большом количестве масла они запекаются в духовке, но благодаря кукурузной крошке всё равно получаются румяными и хрустящими.

А картофель и лук делают куриную начинку особенно нежной и сочной.',
  'Общее время выпекания наггетсов — ориентировочно 18–20 минут. Передерживать наггетсы не стоит, небольшие изделия из куриной грудки довольно быстро становятся сухими. Готовность можно проверить, разрезав один наггетс в центре - мясо должно быть полностью белым, без розовых участков.',
  '[
    {"name": "Куриное филе: 500 г", "swap": null},
    {"name": "Картофель сырой: 120 г", "swap": null},
    {"name": "Репчатый лук: 80 г", "swap": null},
    {"name": "Соль: 1 ч. л.", "swap": null},
    {"name": "Сладкая паприка: 1 ч. л.", "swap": null},
    {"name": "Сушёный чеснок: ½ ч. л.", "swap": null},
    {"name": "Чёрный перец — по вкусу", "swap": null},
    {"name": "Кукурузные хлопья без сахара: 70–80 г", "swap": null},
    {"name": "Оливковое масло: 2 ч. л.", "swap": null},
    {"name": "Сладкая паприка: ½ ч. л.", "swap": null}
  ]'::jsonb,
  '[
    {"text": "Нарежьте курицу, картофель и лук крупными кусочками. Прокрутите в мясорубке или кухонном комбайне до однородного фарша. Не превращайте массу в совсем жидкую пасту."},
    {"text": "Добавьте соль, паприку, сушёный чеснок и чёрный перец. Хорошо перемешайте."},
    {"text": "Кукурузные хлопья измельчите в блендере короткими импульсами. Нужна крупная неоднородная крошка, а не кукурузная мука. Если не хотите использовать блендер, положите хлопья в пакет и подавите дном стакана."},
    {"text": "Смешайте кукурузную крошку с паприкой и оливковым маслом. Хорошо перетрите пальцами, чтобы масло равномерно распределилось по крошке. Так панировка лучше подрумянится без дополнительного масла сверху."},
    {"text": "Влажными руками сформируйте небольшие плоские наггетсы примерно по 30–35 г, толщиной около 1,5–2 см."},
    {"text": "Каждый наггетс хорошо обваляйте в кукурузной крошке, слегка прижимая панировку руками к поверхности."},
    {"text": "Выложите наггетсы на противень, застеленный пергаментом, оставляя между ними небольшое расстояние."},
    {"text": "Запекайте 10–12 минут при 210 °C в режиме «верх-низ», затем аккуратно переверните и готовьте ещё 7–8 минут."}
  ]'::jsonb,
  NULL,
  NULL,
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  35,
  false,
  0,
  '{}'::jsonb,
  false,
  ARRAY['chicken'],
  ARRAY['без глютена', 'без сои'],
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('cutlets-chicken-nuggets-cornflakes', 'cutlets')
ON CONFLICT DO NOTHING;

COMMIT;

SELECT id, name, cat, is_published, access_level, emoji, photo,
       main_ingredients, dietary_flags, dietary_verified, servings,
       portion_grams, kcal, protein, fat, carbs, fiber
FROM recipes
WHERE id = 'cutlets-chicken-nuggets-cornflakes';
