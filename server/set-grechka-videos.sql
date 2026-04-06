-- Установить видеоссылки для Гречневого супа
-- Запускать на VPS: psql -U plate_user -d plate_db -f set-grechka-videos.sql

-- Сначала посмотрим id рецепта:
-- SELECT id, name FROM recipes WHERE name ILIKE '%гречн%суп%';

-- Подставить правильный id вместо 'grechnevyj-sup':
UPDATE recipes SET
    yt_video = 'https://youtu.be/MTq953kxKh8',
    vk_video = 'https://vkvideo.ru/video-229107522_456239052',
    dzen_video = 'https://dzen.ru/video/watch/69be89cfe60752426250c631'
WHERE id = 'grechnevyj-sup';

-- Если id другой, найти через: SELECT id, name FROM recipes WHERE name ILIKE '%гречн%';
