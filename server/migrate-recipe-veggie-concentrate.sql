-- Recipe update: Овощной концентрат
-- Applies a deterministic update for the existing recipe id `veggie-concentrate`
-- without touching unrelated recipes or fields not specified in the user brief.
--
-- Apply on VPS:
--   scp server/migrate-recipe-veggie-concentrate.sql root@5.42.119.198:/tmp/
--   ssh root@5.42.119.198 "sudo -u postgres psql smartplate_db -f /tmp/migrate-recipe-veggie-concentrate.sql"

SET client_encoding = 'UTF8';

BEGIN;

UPDATE recipes
SET
  cat = 'bases',
  name = 'Овощной концентрат',
  tags = ARRAY['растительное', 'без глютена', 'без сои'],
  quote = 'Не пугайтесь такого количества соли: оно нужно, чтобы концентрат мог храниться дольше. В холодильнике он может храниться до 1 месяца, а в морозилке — до 6 месяцев. Для использования достаточно развести 1 ч. л. концентрата на 500 мл воды. И не обязательно точно попадать в граммы: овощи можно брать примерно, подстраиваясь под то, что есть дома.',
  ingredients = '[
    {"name": "Сельдерей стебли — 200 г", "swap": "150 г корня"},
    {"name": "Морковь — 250 г", "swap": null},
    {"name": "Лук — 100 г", "swap": null},
    {"name": "Кабачок или цукини — 150 г", "swap": null},
    {"name": "Помидоры — 100 г", "swap": null},
    {"name": "Грибы — 50 г", "swap": null},
    {"name": "Чеснок — 1 долька", "swap": null},
    {"name": "Петрушка — 40 г", "swap": null},
    {"name": "Лавровый лист — 2 шт.", "swap": null},
    {"name": "Соль — 120 г", "swap": null},
    {"name": "Оливковое масло — 1 ст. л.", "swap": null},
    {"name": "Вода — 30 г", "swap": null}
  ]'::jsonb,
  steps = '[
    {"text": "Мелко нарежьте овощи, морковь можно натереть на тёрке."},
    {"text": "Зелень нарежьте, лавровый лист разломайте руками на кусочки."},
    {"text": "В кастрюле с толстым дном слегка нагрейте овощи, добавьте масло, воду и соль."},
    {"text": "Перемешайте и тушите на маленьком огне 30–40 минут до полной мягкости овощей."},
    {"text": "Переложите в блендер и пробейте в пюре."},
    {"text": "Часть концентрата можно заморозить."}
  ]'::jsonb,
  updated_at = now()
WHERE id = 'veggie-concentrate';

INSERT INTO recipe_categories (recipe_id, category_id)
VALUES ('veggie-concentrate', 'bases')
ON CONFLICT DO NOTHING;

DELETE FROM recipe_categories
WHERE recipe_id = 'veggie-concentrate'
  AND category_id <> 'bases';

COMMIT;
