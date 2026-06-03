-- Привязка фото + публикация 6 рецептов (карточки уже существуют в проде).
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-photos-publish-2026-06-03.sql
--
-- Что делает (НЕ полный rewrite — только photo / steps[].photo / is_published):
--   • recipes.photo            ← {slug}-cover.webp
--   • steps[i].photo           ← привязка по визуальной проверке изображений (см. ниже)
--   • is_published = true
--   • -start / -final фронт подставляет сам из cover (derivePhoto в platform/recipe.html),
--     поэтому в steps их НЕ кладём; файлы просто деплоятся в папку.
--
-- Маппинг фото→шаг (подтверждён пользователем 2026-06-03, file#=step#, с двумя уточнениями):
--   cutlets-cod-cauliflower: шаг2=[-1,-2] (загрузка комбайна + измельчённая масса),
--                            шаг3=[-3-1,-3-2], шаг5=-5; шаги 1,4 без фото.
--   salad-chickpea-pepper-pickles: шаг1=[-1, безномерный соус], шаг2=-2, шаг4=-4; шаги 3,5 без фото.
--   toast-chickpea-olives: шаг1=-1, шаг2=-2, шаг3=-3; шаг4 без фото.
--   toast-hummus: фото шагов нет (1 шаг), только cover.
--   toast-tuna-avocado: шаг1=-1, шаг3=-3, шаг4=-4, шаг5=-5; шаги 2,6 без фото.
--   tofu-syrniki: шаг3=-3, шаг4=-4, шаг5=[-5-1,-5-2]; шаги 1,2 без фото.
--                 В проде steps хранятся СТРОКАМИ → пересобираем массив объектами
--                 (текст шагов сохранён дословно из прода).

BEGIN;

-- 1. cutlets-cod-cauliflower (steps = объекты) ----------------------------------
UPDATE recipes SET
  steps = jsonb_set(jsonb_set(jsonb_set(
            steps,
            '{1,photo}', '["images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-1.webp","images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-2.webp"]'::jsonb),
            '{2,photo}', '["images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-3-1.webp","images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-3-2.webp"]'::jsonb),
            '{4,photo}', '"images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-5.webp"'::jsonb),
  photo = 'images/recipes/cutlets-cod-cauliflower/cutlets-cod-cauliflower-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'cutlets-cod-cauliflower';

-- 2. salad-chickpea-pepper-pickles (steps = объекты) ----------------------------
UPDATE recipes SET
  steps = jsonb_set(jsonb_set(jsonb_set(
            steps,
            '{0,photo}', '["images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles-1.webp","images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles.webp"]'::jsonb),
            '{1,photo}', '"images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles-2.webp"'::jsonb),
            '{3,photo}', '"images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles-4.webp"'::jsonb),
  photo = 'images/recipes/salad-chickpea-pepper-pickles/salad-chickpea-pepper-pickles-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'salad-chickpea-pepper-pickles';

-- 3. toast-chickpea-olives (steps = объекты) ------------------------------------
UPDATE recipes SET
  steps = jsonb_set(jsonb_set(jsonb_set(
            steps,
            '{0,photo}', '"images/recipes/toast-chickpea-olives/toast-chickpea-olives-1.webp"'::jsonb),
            '{1,photo}', '"images/recipes/toast-chickpea-olives/toast-chickpea-olives-2.webp"'::jsonb),
            '{2,photo}', '"images/recipes/toast-chickpea-olives/toast-chickpea-olives-3.webp"'::jsonb),
  photo = 'images/recipes/toast-chickpea-olives/toast-chickpea-olives-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'toast-chickpea-olives';

-- 4. toast-hummus (фото шагов нет) ----------------------------------------------
UPDATE recipes SET
  photo = 'images/recipes/toast-hummus/toast-hummus-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'toast-hummus';

-- 5. toast-tuna-avocado (steps = объекты) ---------------------------------------
UPDATE recipes SET
  steps = jsonb_set(jsonb_set(jsonb_set(jsonb_set(
            steps,
            '{0,photo}', '"images/recipes/toast-tuna-avocado/toast-tuna-avocado-1.webp"'::jsonb),
            '{2,photo}', '"images/recipes/toast-tuna-avocado/toast-tuna-avocado-3.webp"'::jsonb),
            '{3,photo}', '"images/recipes/toast-tuna-avocado/toast-tuna-avocado-4.webp"'::jsonb),
            '{4,photo}', '"images/recipes/toast-tuna-avocado/toast-tuna-avocado-5.webp"'::jsonb),
  photo = 'images/recipes/toast-tuna-avocado/toast-tuna-avocado-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'toast-tuna-avocado';

-- 6. tofu-syrniki (steps = СТРОКИ → пересобираем объектами, текст сохранён) ------
UPDATE recipes SET
  steps = '[
    {"text": "Залейте изюм горячей водой на 10 минут для мягкости (необязательно)."},
    {"text": "Разомните тофу и банан вилкой или воспользуйтесь блендером до однородности."},
    {"text": "Добавьте муку и хорошо перемешайте.", "photo": "images/recipes/tofu-syrniki/tofu-syrniki-3.webp"},
    {"text": "Добавьте цедру, сок лимона, мёд, изюм (его можно порезать мельче) и перемешайте.", "photo": "images/recipes/tofu-syrniki/tofu-syrniki-4.webp"},
    {"text": "Сформируйте сырники и обжарьте до румяной корочки с двух сторон на растительном масле.", "photo": ["images/recipes/tofu-syrniki/tofu-syrniki-5-1.webp", "images/recipes/tofu-syrniki/tofu-syrniki-5-2.webp"]}
  ]'::jsonb,
  photo = 'images/recipes/tofu-syrniki/tofu-syrniki-cover.webp',
  is_published = true,
  updated_at = now()
WHERE id = 'tofu-syrniki';

COMMIT;
