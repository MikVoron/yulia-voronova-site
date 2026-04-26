-- Сверка хумусов с ТЗ от 2026-04-26 (пользователь).
-- beetroot-hummus: все поля совпадают, кроме photo (путь битый — файла нет ни локально, ни на VPS).
-- hummus: (1) кумин 1,5 → 0,5 ч. л. (опечатка в БД); (2) photo путь обновлён.
-- Применить: ssh root@5.42.119.198 "cat | sudo -u postgres psql smartplate_db" < server/migrate-recipe-hummus-fix.sql

UPDATE recipes
SET photo = NULL,
    updated_at = now()
WHERE id = 'beetroot-hummus';

UPDATE recipes
SET ingredients = '[
  {"name": "Нут отварной — 400 г", "swap": null},
  {"name": "Чеснок — 2 зубчика", "swap": null},
  {"name": "Лимон — 1 шт. (сок)", "swap": null},
  {"name": "Соль — 1 ч. л.", "swap": null},
  {"name": "Тахини — 3 ст. л.", "swap": null},
  {"name": "Кумин — 0,5 ч. л.", "swap": null},
  {"name": "Вода — 90 мл", "swap": null}
]'::jsonb,
    photo = 'images/recipes/hummus/hummus-cover.webp',
    updated_at = now()
WHERE id = 'hummus';
