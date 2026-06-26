const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, requireAdmin } = require('../middleware');

const AI_PARSE_TEXT_LIMIT = 12000;

async function aiRoutes(fastify) {
  // POST /admin/recipes/parse-text — AI-assisted recipe parsing
  fastify.post('/admin/recipes/parse-text', {
    preHandler: [authenticate, requireAdmin],
    config: { rateLimit: { max: 8, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { text } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return reply.status(400).send({ error: 'Текст рецепта обязателен' });
    }
    if (text.length > AI_PARSE_TEXT_LIMIT) {
      return reply.status(400).send({ error: 'Текст рецепта слишком длинный (макс. ' + AI_PARSE_TEXT_LIMIT + ' символов)' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return reply.status(500).send({ error: 'ANTHROPIC_API_KEY не настроен на сервере' });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `Ты — помощник для парсинга рецептов. Тебе дают текст рецепта в свободной форме.
Извлеки из него структурированные данные и верни ТОЛЬКО валидный JSON (без markdown, без комментариев).

Правила:
- Извлекай только то, что ЯВНО есть в тексте. Не выдумывай отсутствующие данные.
- Если поле не определяется из текста — НЕ включай его в JSON.
- Ингредиенты: массив объектов {name, swap?}. swap — чем можно заменить, если автор упоминает.
  - Канонический формат name: «Название: количество» (через двоеточие). Пример: "Тофу: 300 г", "Оливковое масло: 1 ст. л.".
  - НЕ используй длинное тире как разделитель между продуктом и количеством («Название — количество»). НЕ используй короткий дефис как разделитель.
  - Если количества нет — оставь только название: "Соль", "Перец".
  - Если количество описательное (без точной цифры) — допустима естественная формулировка с тире: "Соль — по вкусу", "Вода — чтобы слегка покрывала овощи".
- Шаги: массив строк (текст каждого шага).
- КБЖУ: только если явно указаны числа калорий/белков/жиров/углеводов/клетчатки.
- Теги: извлеки характеристики блюда (быстрый, простой, без глютена, веганский и т.п.).
- Время: time_min — целое в минутах, **нижняя граница** диапазона (для фильтров). «45–50 мин» → time_min: 45. «1–1,5 часа» → time_min: 60. Не округлять и не усреднять.
- time_label: **СТРОГО ЗАПРЕЩЕНО ВЫДУМЫВАТЬ.** Включай это поле в JSON ТОЛЬКО если во входном тексте есть **явный диапазон** или **квалификатор** ("около", "примерно", "≈", "~"). В этом случае значение = **дословный фрагмент** из текста ("45–50 минут", "1 час 20 минут", "около 30 минут", "~25 мин").
  - Если в тексте одиночное значение ("30 минут", "Время: 45 мин") — **НЕ включай** time_label в JSON. Никогда не превращай "30 минут" в "25–35 минут" или "около 30 минут".
  - Запрещено: округлять, усреднять, расширять до диапазона, добавлять "около" по красоте.
  - Если сомневаешься — НЕ включай time_label.
- Сложность: "easy", "medium" или "hard".
- Категория (cat): одна из "breakfasts", "soups", "mains", "cutlets", "sides", "pancakes", "spreads", "sauces", "salads", "drinks". Определи по типу блюда. "soups" — супы, борщи, щи, уха, рассольник; "mains" — горячие вторые блюда; "spreads" — намазки (хумус, паштет); "sauces" — соусы и заправки.
- Порции (servings): число порций, если указано.
- Граммы на порцию (portion_grams): если указано.

Формат ответа (только JSON):
{
  "name": "Название рецепта",
  "cat": "mains",
  "emoji": "🍲",
  "time_min": 45,
  "time_label": "45–50 минут",
  "difficulty": "easy",
  "servings": 4,
  "portion_grams": 300,
  "kcal": 250,
  "protein": 15,
  "fat": 8,
  "carbs": 30,
  "fiber": 5,
  "ingredients": [
    {"name": "Тофу: 300 г", "swap": "Нут"},
    {"name": "Оливковое масло: 1 ст. л.", "swap": null},
    {"name": "Соль — по вкусу", "swap": null}
  ],
  "steps": [
    "Нарезать тофу кубиками.",
    "Обжарить на среднем огне 5 минут."
  ],
  "tags": ["простой", "веганский"],
  "quote": "Цитата автора, если есть",
  "note": "Заметка или совет, если есть",
  "_unfilled": ["photo", "vk_video", "yt_video"]
}

В примере выше показан рецепт с диапазоном времени. Если бы во входе было одиночное "Время: 45 минут" — поле time_label в JSON НЕ должно было бы появиться вовсе (только time_min: 45).

Поле _unfilled — список полей, которые ты НЕ смог определить из текста (чтобы пользователь знал, что нужно заполнить вручную).`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: 'Распарси этот рецепт:\n\n' + text.trim() }
        ],
        system: systemPrompt
      });

      const responseText = message.content[0].text.trim();

      // Extract JSON from response (handle possible markdown wrapping)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        return reply.status(422).send({ error: 'AI вернул невалидный JSON', raw: responseText });
      }

      // Страховка: time_label оставляем только при явном диапазоне/квалификаторе во входе.
      // Защита от галлюцинации, даже если промпт не удержал модель.
      if (parsed && typeof parsed.time_label === 'string') {
        const hasRange = /\d+\s*[-–—]\s*\d+/.test(text)
          || /(около|примерно|~|≈|от\s+\d|до\s+\d)/i.test(text);
        if (!hasRange) {
          delete parsed.time_label;
          parsed._stripped_time_label = true;
        }
      }

      return { ok: true, recipe: parsed };
    } catch (err) {
      fastify.log.error(err);
      if (err.status === 401) {
        return reply.status(500).send({ error: 'Неверный ANTHROPIC_API_KEY' });
      }
      return reply.status(500).send({ error: 'Ошибка AI-сервиса: ' + (err.message || 'unknown') });
    }
  });
}

module.exports = aiRoutes;
