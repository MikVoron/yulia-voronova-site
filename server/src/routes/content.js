const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware');

async function contentRoutes(fastify) {

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC — news + recipes (no auth required)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /content/news — published news, newest first
  fastify.get('/content/news', async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const result = await db.query(
      'SELECT id, type, text, recipe_id, badge, label, created_at FROM news WHERE is_published = true ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  });

  // GET /content/recipes — all published recipes
  fastify.get('/content/recipes', async () => {
    const result = await db.query(
      `SELECT id, cat, name, emoji, time_min, difficulty, servings, is_free,
              kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
              ingredients, steps, note, vk_video,
              add_protein, add_fat, add_carbs, add_fiber,
              portion_grams, created_at
       FROM recipes WHERE is_published = true ORDER BY sort_order, created_at`
    );
    return result.rows;
  });

  // GET /content/categories — all categories
  fastify.get('/content/categories', async () => {
    const cats = await db.query('SELECT * FROM categories ORDER BY sort_order');
    // For each category, get its recipe ids
    const recipes = await db.query(
      "SELECT id, cat FROM recipes WHERE is_published = true ORDER BY sort_order"
    );
    const catMap = {};
    for (const c of cats.rows) {
      catMap[c.id] = { ...c, dishes: [] };
    }
    for (const r of recipes.rows) {
      if (catMap[r.cat]) catMap[r.cat].dishes.push(r.id);
    }
    return Object.values(catMap);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — CRUD for news
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/news — all news (including drafts)
  fastify.get('/admin/news', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query('SELECT * FROM news ORDER BY created_at DESC');
    return result.rows;
  });

  // POST /admin/news — create news
  fastify.post('/admin/news', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Текст обязателен' });
    const result = await db.query(
      `INSERT INTO news (type, text, recipe_id, badge, label, is_published)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [type || 'news', text.trim(), recipe_id || null, badge || null, label || null, is_published !== false]
    );
    return result.rows[0];
  });

  // PUT /admin/news/:id — update news
  fastify.put('/admin/news/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { type, text, recipe_id, badge, label, is_published } = req.body || {};
    const result = await db.query(
      `UPDATE news SET type=$1, text=$2, recipe_id=$3, badge=$4, label=$5, is_published=$6
       WHERE id=$7 RETURNING *`,
      [type || 'news', text, recipe_id || null, badge || null, label || null, is_published !== false, req.params.id]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    return result.rows[0];
  });

  // DELETE /admin/news/:id
  fastify.delete('/admin/news/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const result = await db.query('DELETE FROM news WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — CRUD for recipes
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /admin/recipes — all recipes (including drafts)
  fastify.get('/admin/recipes', { preHandler: [authenticate, requireAdmin] }, async () => {
    const result = await db.query('SELECT * FROM recipes ORDER BY sort_order, created_at');
    return result.rows;
  });

  // POST /admin/recipes — create recipe
  fastify.post('/admin/recipes', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const r = req.body || {};
    if (!r.id || !r.name || !r.cat) return reply.status(400).send({ error: 'id, name и cat обязательны' });
    // Check id uniqueness
    const exists = await db.query('SELECT id FROM recipes WHERE id=$1', [r.id]);
    if (exists.rows.length) return reply.status(409).send({ error: 'Рецепт с таким id уже существует' });
    const result = await db.query(
      `INSERT INTO recipes (id, cat, name, emoji, time_min, difficulty, servings, is_free,
          kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
          ingredients, steps, note, vk_video, add_protein, add_fat, add_carbs, add_fiber,
          portion_grams, sort_order, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       RETURNING *`,
      [
        r.id, r.cat, r.name, r.emoji || '🍴', r.time_min || 30, r.difficulty || 'easy',
        r.servings || 4, r.is_free || false,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published !== false
      ]
    );
    return result.rows[0];
  });

  // PUT /admin/recipes/:id — update recipe
  fastify.put('/admin/recipes/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const r = req.body || {};
    const result = await db.query(
      `UPDATE recipes SET cat=$1, name=$2, emoji=$3, time_min=$4, difficulty=$5, servings=$6,
          is_free=$7, kcal=$8, protein=$9, fat=$10, carbs=$11, fiber=$12, tags=$13,
          photo=$14, img_position=$15, quote=$16, ingredients=$17, steps=$18, note=$19,
          vk_video=$20, add_protein=$21, add_fat=$22, add_carbs=$23, add_fiber=$24,
          portion_grams=$25, sort_order=$26, is_published=$27, updated_at=now()
       WHERE id=$28 RETURNING *`,
      [
        r.cat, r.name, r.emoji || '🍴', r.time_min || 30, r.difficulty || 'easy',
        r.servings || 4, r.is_free || false,
        r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
        r.tags || [], r.photo || null, r.img_position || null, r.quote || null,
        JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
        r.note || null, r.vk_video || null,
        JSON.stringify(r.add_protein || []), JSON.stringify(r.add_fat || []),
        JSON.stringify(r.add_carbs || []), JSON.stringify(r.add_fiber || []),
        r.portion_grams || 300, r.sort_order || 0, r.is_published !== false, req.params.id
      ]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    return result.rows[0];
  });

  // DELETE /admin/recipes/:id
  fastify.delete('/admin/recipes/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const result = await db.query('DELETE FROM recipes WHERE id=$1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    return { ok: true };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — Categories
  // ═══════════════════════════════════════════════════════════════════════════

  // PUT /admin/categories/:id
  fastify.put('/admin/categories/:id', { preHandler: [authenticate, requireAdmin] }, async (req, reply) => {
    const { name, emoji, color, description, sort_order } = req.body || {};
    const result = await db.query(
      'UPDATE categories SET name=$1, emoji=$2, color=$3, description=$4, sort_order=$5 WHERE id=$6 RETURNING *',
      [name, emoji, color, description, sort_order || 0, req.params.id]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Не найдено' });
    return result.rows[0];
  });
}

module.exports = contentRoutes;
