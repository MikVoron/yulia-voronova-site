const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, requireAdmin } = require('../middleware');

async function aiRoutes(fastify) {
  // POST /admin/recipes/parse-text — AI-assisted recipe parsing
  fastify.post('/admin/recipes/parse-text', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Текст рецепта обязателен' });
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
- Шаги: массив строк (текст каждого шага).
- КБЖУ: только если явно указаны числа калорий/белков/жиров/углеводов/клетчатки.
- Теги: извлеки характеристики блюда (быстрый, простой, без глютена, веганский и т.п.).
- Время: в минутах.
- Сложность: "easy", "medium" или "hard".
- Категория (cat): одна из "breakfasts", "mains", "pancakes", "spreads", "salads", "drinks". Определи по типу блюда.
- Порции (servings): число порций, если указано.
- Граммы на порцию (portion_grams): если указано.

Формат ответа (только JSON):
{
  "name": "Название рецепта",
  "cat": "mains",
  "emoji": "🍲",
  "time_min": 30,
  "difficulty": "easy",
  "servings": 4,
  "portion_grams": 300,
  "kcal": 250,
  "protein": 15,
  "fat": 8,
  "carbs": 30,
  "fiber": 5,
  "ingredients": [
    {"name": "300 гр. тофу", "swap": "Можно заменить на нут"},
    {"name": "Сок лимона"}
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
