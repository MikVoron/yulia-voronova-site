const db = require('../db');
const { authenticate } = require('../middleware');

async function plateRoutes(fastify) {

  // GET /plate — current plate items
  fastify.get('/plate', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT items, updated_at FROM plate_items WHERE user_id = $1',
      [req.user.sub]
    );
    return { items: result.rows.length ? result.rows[0].items : [] };
  });

  // PUT /plate — replace current plate (full sync from client)
  fastify.put('/plate', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return reply.status(400).send({ error: 'items должен быть массивом' });
    }
    // Limit to 50 items, sanitize
    const safe = items.slice(0, 50);

    await db.query(
      `INSERT INTO plate_items (user_id, items, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET items = $2, updated_at = now()`,
      [req.user.sub, JSON.stringify(safe)]
    );
    return { ok: true };
  });

  // GET /plate/history — saved plates
  fastify.get('/plate/history', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, saved_at, items, totals, meal_type FROM plate_history WHERE user_id = $1 ORDER BY saved_at DESC LIMIT 30',
      [req.user.sub]
    );
    return result.rows.map(r => ({
      id: r.id,
      date: r.saved_at.toISOString(),
      items: r.items,
      totals: r.totals,
      mealType: r.meal_type || ''
    }));
  });

  // POST /plate/history — save current plate to history
  fastify.post('/plate/history', {
    preHandler: authenticate,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { date, items, totals, mealType } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return reply.status(400).send({ error: 'items обязателен и не может быть пустым' });
    }
    const safeItems = items.slice(0, 50);
    const safeTotals = totals || {};
    const safeDate = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date) : new Date();
    const safeMealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) ? mealType : null;

    await db.query(
      `INSERT INTO plate_history (user_id, saved_at, items, totals, meal_type)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM plate_history WHERE user_id = $1 AND saved_at = $2
       )`,
      [req.user.sub, safeDate, JSON.stringify(safeItems), JSON.stringify(safeTotals), safeMealType]
    );
    // Clear current plate on server
    await db.query(
      `INSERT INTO plate_items (user_id, items, updated_at)
       VALUES ($1, '[]', now())
       ON CONFLICT (user_id) DO UPDATE SET items = '[]', updated_at = now()`,
      [req.user.sub]
    );
    return { ok: true };
  });

  // PUT /plate/history/meal-type - set optional user-defined meal label.
  fastify.put('/plate/history/meal-type', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { date, mealType } = req.body || {};
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return reply.status(400).send({ error: 'date обязателен' });
    }
    const safeMealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) ? mealType : null;
    await db.query(
      'UPDATE plate_history SET meal_type = $3 WHERE user_id = $1 AND saved_at = $2',
      [req.user.sub, new Date(date), safeMealType]
    );
    return { ok: true };
  });

  // PUT /plate/history/sync — bulk sync history from client (first migration)
  fastify.put('/plate/history/sync', {
    preHandler: authenticate,
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { history } = req.body || {};
    if (!Array.isArray(history)) {
      return reply.status(400).send({ error: 'history должен быть массивом' });
    }
    const safe = history.filter(h => h && Array.isArray(h.items) && h.items.length).slice(0, 30);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Don't delete existing server history — only add local-only entries
      for (const h of safe) {
        const safeDate = h.date && !Number.isNaN(new Date(h.date).getTime()) ? new Date(h.date) : new Date();
        const safeMealType = ['breakfast', 'lunch', 'dinner', 'snack'].includes(h.mealType) ? h.mealType : null;
        await client.query(
          `INSERT INTO plate_history (user_id, saved_at, items, totals, meal_type)
           SELECT $1, $2, $3, $4, $5
           WHERE NOT EXISTS (
             SELECT 1 FROM plate_history WHERE user_id = $1 AND saved_at = $2
           )`,
          [req.user.sub, safeDate, JSON.stringify(h.items.slice(0, 50)), JSON.stringify(h.totals || {}), safeMealType]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return { synced: safe.length };
  });
}

module.exports = plateRoutes;
