-- Миграция: добавить колонку portion_grams + обновить/добавить рецепты
-- Запустить на VPS: psql $DATABASE_URL < migrate-recipes-update.sql

BEGIN;

-- Добавить колонку portion_grams если её нет
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS portion_grams INT DEFAULT 300;

-- ─── Плов с чечевицей и грибами (обновление) ─────────────────────────────────
INSERT INTO recipes (id, cat, name, emoji, time_min, difficulty, servings, is_free,
    kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
    ingredients, steps, note, vk_video,
    add_protein, add_fat, add_carbs, add_fiber, portion_grams, sort_order)
VALUES (
    'lentil-mushroom-pilaf',
    'mains',
    'Плов с чечевицей и грибами',
    '🍚',
    45,
    'easy',
    4,
    false,
    350, 14, 5, 57, 9,
    ARRAY['простой', 'бобовые'],
    'images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-final.webp',
    NULL,
    'Не выпаривайте воду полностью. Оставьте немного жидкости, выключите огонь и дайте плову настояться под крышкой около 30–60 минут (если есть время). За это время он впитает остатки влаги и не будет сухим.',
    '[
        {"name": "Рис басмати — 250 г", "swap": "Рис жасмин"},
        {"name": "Красная чечевица — 130 г", "swap": null},
        {"name": "Шампиньоны — 2 небольшие", "swap": null},
        {"name": "Морковь — 2 шт.", "swap": null},
        {"name": "Лук — 1 шт.", "swap": null},
        {"name": "Чеснок — 2 зубчика", "swap": null},
        {"name": "Томатная паста — 2 ч. л.", "swap": null},
        {"name": "Тимьян — 1 ч. л.", "swap": null},
        {"name": "Кумин — ½ ч. л.", "swap": null},
        {"name": "Куркума — ¼ ч. л.", "swap": null},
        {"name": "Вода — 900 мл", "swap": "[Овощной бульон](veggie-concentrate) (добавить 1 ч. л. [овощного концентрата](veggie-concentrate))"},
        {"name": "Соль — 1 ч. л. (по вкусу)", "swap": null},
        {"name": "Оливковое масло — 1 ст. л.", "swap": null}
    ]'::jsonb,
    '[
        {"text": "Лук нарезать и обжарить на оливковом масле около 1 минуты.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-1.webp"},
        {"text": "Добавить морковь и жарить ещё 2–3 минуты.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-2.webp"},
        {"text": "Добавить чеснок и специи, перемешать.", "photo": null},
        {"text": "Добавить грибы, готовить около 1 минуты.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-3.webp"},
        {"text": "Добавить томатную пасту, перемешать.", "photo": null},
        {"text": "Всыпать рис, перемешать.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-4.webp"},
        {"text": "Добавить чечевицу и соль.", "photo": null},
        {"text": "Влить воду или овощной бульон, довести до кипения, накрыть крышкой и готовить на слабом огне 20–30 минут.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-5.webp"},
        {"text": "В конце попробовать и при необходимости досолить.", "photo": null},
        {"text": "Выключить огонь и дать настояться под крышкой 10–15 минут.", "photo": "images/recipes/pilaf-lentils-mushrooms/pilaf-lentils-mushrooms-final.webp"}
    ]'::jsonb,
    NULL,
    NULL,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[{"name": "Салат из запечённой свёклы, белой фасоли и рукколы", "kcal": 280, "protein": 9, "fat": 16, "carbs": 27, "fiber": 8, "recipeId": "beetroot-bean-arugula"}]'::jsonb,
    380,
    18
)
ON CONFLICT (id) DO UPDATE SET
    cat=EXCLUDED.cat, name=EXCLUDED.name, emoji=EXCLUDED.emoji,
    time_min=EXCLUDED.time_min, difficulty=EXCLUDED.difficulty,
    servings=EXCLUDED.servings, is_free=EXCLUDED.is_free,
    kcal=EXCLUDED.kcal, protein=EXCLUDED.protein, fat=EXCLUDED.fat,
    carbs=EXCLUDED.carbs, fiber=EXCLUDED.fiber, tags=EXCLUDED.tags,
    photo=EXCLUDED.photo, img_position=EXCLUDED.img_position,
    quote=EXCLUDED.quote, ingredients=EXCLUDED.ingredients,
    steps=EXCLUDED.steps, note=EXCLUDED.note, vk_video=EXCLUDED.vk_video,
    add_protein=EXCLUDED.add_protein, add_fat=EXCLUDED.add_fat,
    add_carbs=EXCLUDED.add_carbs, add_fiber=EXCLUDED.add_fiber,
    portion_grams=EXCLUDED.portion_grams, updated_at=now();

-- ─── Салат из свёклы, фасоли и рукколы (новый) ──────────────────────────────
INSERT INTO recipes (id, cat, name, emoji, time_min, difficulty, servings, is_free,
    kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
    ingredients, steps, note, vk_video,
    add_protein, add_fat, add_carbs, add_fiber, portion_grams, sort_order)
VALUES (
    'beetroot-bean-arugula',
    'salads',
    'Салат из запечённой свёклы, белой фасоли и рукколы',
    '🥗',
    18,
    'easy',
    3,
    false,
    280, 9, 16, 27, 8,
    ARRAY['простой', 'без глютена', 'бобовые'],
    'images/recipes/salad-beetroot-white beans-arugula/salad-beetroot-white beans-arugula-final.webp',
    NULL,
    'Не варите свёклу — запекайте её. Так она становится сладкой, ароматной и нежной, без лишней воды. Запеките несколько штук сразу на неделю: они отлично хранятся в холодильнике и всегда готовы для яркого салата или ароматного борща. Маленькие корнеплоды запекайте без фольги на пергаменте 45–50 минут, пока они не станут мягкими и легко протыкаются вилкой.',
    '[
        {"name": "Запечённая свёкла — 400 г", "swap": null},
        {"name": "Отварная белая фасоль — 200 г", "swap": null},
        {"name": "Руккола — 40 г", "swap": null},
        {"name": "Укроп — 20 г", "swap": null},
        {"name": "Каперсы — 1 ст. л.", "swap": null},
        {"name": "Семечки подсолнечника — 3 ст. л.", "swap": null},
        {"name": "Оливковое масло — 2 ст. л.", "swap": null},
        {"name": "Сок ½ лимона", "swap": null},
        {"name": "Сумах — ½ ч. л.", "swap": "Немного лимонной цедры или чуть больше лимонного сока"},
        {"name": "Соль — по вкусу", "swap": null}
    ]'::jsonb,
    '[
        {"text": "Свёклу очистить и нарезать кубиками или дольками.", "photo": "images/recipes/salad-beetroot-white beans-arugula/salad-beetroot-white beans-arugula-1.webp"},
        "Фасоль промыть и дать стечь воде.",
        "Сырые семечки подсушить на сухой сковороде 2–3 минуты до лёгкого аромата.",
        "Рукколу крупно нарезать, укроп мелко порубить.",
        "В миске соединить свёклу, фасоль, рукколу, укроп и каперсы.",
        "Отдельно смешать оливковое масло, лимонный сок, сумах и соль.",
        "Заправить салат и аккуратно перемешать.",
        "Посыпать семечками перед подачей.",
        {"text": "Дать постоять 10–15 минут, чтобы вкус стал более насыщенным.", "photo": "images/recipes/salad-beetroot-white beans-arugula/salad-beetroot-white beans-arugula-final.webp"}
    ]'::jsonb,
    NULL,
    NULL,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    275,
    37
)
ON CONFLICT (id) DO UPDATE SET
    cat=EXCLUDED.cat, name=EXCLUDED.name, emoji=EXCLUDED.emoji,
    time_min=EXCLUDED.time_min, difficulty=EXCLUDED.difficulty,
    servings=EXCLUDED.servings, is_free=EXCLUDED.is_free,
    kcal=EXCLUDED.kcal, protein=EXCLUDED.protein, fat=EXCLUDED.fat,
    carbs=EXCLUDED.carbs, fiber=EXCLUDED.fiber, tags=EXCLUDED.tags,
    photo=EXCLUDED.photo, img_position=EXCLUDED.img_position,
    quote=EXCLUDED.quote, ingredients=EXCLUDED.ingredients,
    steps=EXCLUDED.steps, note=EXCLUDED.note, vk_video=EXCLUDED.vk_video,
    add_protein=EXCLUDED.add_protein, add_fat=EXCLUDED.add_fat,
    add_carbs=EXCLUDED.add_carbs, add_fiber=EXCLUDED.add_fiber,
    portion_grams=EXCLUDED.portion_grams, updated_at=now();

-- ─── Обновить категорию «Салаты» — добавить салат в dishes ────────────────────
UPDATE categories
SET dishes = dishes || ARRAY['beetroot-bean-arugula']
WHERE id = 'salads'
  AND NOT ('beetroot-bean-arugula' = ANY(dishes));

COMMIT;
