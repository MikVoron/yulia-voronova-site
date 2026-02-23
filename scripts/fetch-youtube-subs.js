#!/usr/bin/env node
// Запрашивает количество подписчиков YouTube и сохраняет в data/youtube.json
// Запускается автоматически через GitHub Actions раз в сутки

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE = '@voronova_nutrition';
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'youtube.json');

if (!API_KEY) {
    console.error('Ошибка: переменная окружения YOUTUBE_API_KEY не задана');
    process.exit(1);
}

// Сначала получаем channel ID по handle
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function formatCount(n) {
    // Форматирует число с пробелом как разделителем тысяч: 6300 → "6 300"
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0').replace(/\u00a0/g, ' ');
}

async function main() {
    try {
        // Ищем канал по handle
        const searchUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${CHANNEL_HANDLE}&key=${API_KEY}`;
        const data = await fetchJson(searchUrl);

        if (!data.items || data.items.length === 0) {
            console.error('Канал не найден. Ответ API:', JSON.stringify(data));
            process.exit(1);
        }

        const stats = data.items[0].statistics;
        const count = parseInt(stats.subscriberCount, 10);
        const formatted = formatCount(count);
        const today = new Date().toISOString().slice(0, 10);

        const result = {
            subscriberCount: count.toString(),
            subscriberCountFormatted: formatted,
            updatedAt: today
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2) + '\n');
        console.log(`Обновлено: ${formatted} подписчиков (${today})`);
    } catch (err) {
        console.error('Ошибка при запросе YouTube API:', err.message);
        process.exit(1);
    }
}

main();
