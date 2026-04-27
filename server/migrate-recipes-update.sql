-- ============================================================================
-- LEGACY / PARTIALLY DEPRECATED — безопасно для повторного запуска
-- ============================================================================
-- Этот файл изначально содержал bundled-обновление двух рецептов + ALTER колонки.
-- Сейчас источники истины разнесены:
--
--   • lentil-mushroom-pilaf      → server/migrate-recipe-pilaf-lentils-mushrooms.sql
--                                  (оттуда же актуальные шаги/фото; см. ниже)
--   • beetroot-bean-arugula      → ОСТАЁТСЯ в этом файле (других миграций нет;
--                                  актуализирован в commits 29d0cc4 + a629267)
--
-- Стейл-инсерт для lentil-mushroom-pilaf удалён: его повторный запуск возвращал
-- на прод устаревшие KBЖУ/теги/ингредиенты, ломал путь к фото шага 1
-- (pilaf-lentils-mushrooms-1.webp — файла не существует, в каноне -start.webp)
-- и дублировал -final.webp на последнем user-step (фронт сам добавляет финал).
-- Если потребуется обновить плов — править ДЕДИКАТЕД-миграцию, не этот файл.
--
-- Запустить на VPS: psql $DATABASE_URL < migrate-recipes-update.sql
-- ============================================================================

BEGIN;

-- Добавить колонку portion_grams если её нет (идемпотентно)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS portion_grams INT DEFAULT 300;

-- ─── Плов с чечевицей и грибами ─────────────────────────────────────────────
-- УДАЛЕНО: см. server/migrate-recipe-pilaf-lentils-mushrooms.sql (источник истины).
-- Здесь раньше был INSERT … ON CONFLICT DO UPDATE для 'lentil-mushroom-pilaf'
-- со стейл-данными (некорректный путь -1.webp на step 1 и продублированный
-- -final.webp на step 10). Не возвращать.

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
    'images/recipes/beetroot-bean-arugula/beetroot-bean-arugula-final.webp',
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
        "Свёклу очистить и нарезать кубиками или дольками.",
        "Фасоль промыть и дать стечь воде.",
        "Сырые семечки подсушить на сухой сковороде 2–3 минуты до лёгкого аромата.",
        "Рукколу крупно нарезать, укроп мелко порубить.",
        "В миске соединить свёклу, фасоль, рукколу, укроп и каперсы.",
        "Отдельно смешать оливковое масло, лимонный сок, сумах и соль.",
        "Заправить салат и аккуратно перемешать.",
        "Посыпать семечками перед подачей.",
        "Дать постоять 10–15 минут, чтобы вкус стал более насыщенным."
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
