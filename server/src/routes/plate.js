const db = require('../db');
const { authenticate } = require('../middleware');

const PLATE_ITEMS_MAX = 50;
const PLATE_HISTORY_MAX = 30;
const PLATE_ITEMS_JSON_MAX = 50000;
const PLATE_TOTALS_JSON_MAX = 5000;
const PLATE_READ_RATE_LIMIT = { max: 60, timeWindow: '1 minute' };
const MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

function assertJsonSize(value, max, field) {
  if (JSON.stringify(value || null).length > max) {
    const err = new Error(field + ' слишком большой');
    err.field = field;
    throw err;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validatePlateItems(items) {
  if (!Array.isArray(items)) {
    const err = new Error('items должен быть массивом');
    err.field = 'items';
    throw err;
  }
  if (items.length > PLATE_ITEMS_MAX) {
    const err = new Error('Слишком много элементов тарелки (макс. ' + PLATE_ITEMS_MAX + ')');
    err.field = 'items';
    throw err;
  }
  for (const item of items) {
    if (!isPlainObject(item)) {
      const err = new Error('items содержит некорректный элемент');
      err.field = 'items';
      throw err;
    }
  }
  const seenRecipeIds = new Set();
  const uniqueItems = items.filter((item) => {
    const recipeId = typeof item.recipeId === 'string' ? item.recipeId.trim() : '';
    if (!recipeId) return true;
    if (seenRecipeIds.has(recipeId)) return false;
    seenRecipeIds.add(recipeId);
    return true;
  });
  assertJsonSize(uniqueItems, PLATE_ITEMS_JSON_MAX, 'items');
  return uniqueItems;
}

function validateTotals(totals) {
  const safeTotals = totals || {};
  if (!isPlainObject(safeTotals)) {
    const err = new Error('totals должен быть объектом');
    err.field = 'totals';
    throw err;
  }
  assertJsonSize(safeTotals, PLATE_TOTALS_JSON_MAX, 'totals');
  return safeTotals;
}

function parsePlateDate(value, options = {}) {
  if (value == null || value === '') return options.fallbackToNow ? new Date() : null;
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeMealType(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const mealType = value.trim();
  return MEAL_TYPES.has(mealType) ? mealType : null;
}

function normalizeHistoryEntry(entry) {
  if (!isPlainObject(entry)) {
    const err = new Error('history содержит некорректную запись');
    err.field = 'history';
    throw err;
  }
  if (!Array.isArray(entry.items) || !entry.items.length) {
    const err = new Error('items обязателен и не может быть пустым');
    err.field = 'items';
    throw err;
  }
  const safeDate = parsePlateDate(entry.date);
  if (!safeDate) {
    const err = new Error('date обязателен');
    err.field = 'date';
    throw err;
  }
  return {
    date: safeDate,
    items: validatePlateItems(entry.items),
    totals: validateTotals(entry.totals),
    mealType: normalizeMealType(entry.mealType),
  };
}

async function prunePlateHistory(userId, client = db) {
  await client.query(
    `DELETE FROM plate_history
      WHERE user_id = $1
        AND id IN (
          SELECT id FROM plate_history
           WHERE user_id = $1
           ORDER BY saved_at DESC, id DESC
           OFFSET $2
        )`,
    [userId, PLATE_HISTORY_MAX]
  );
}

async function plateRoutes(fastify) {

  // GET /plate — current plate items
  fastify.get('/plate', {
    preHandler: authenticate,
    config: { rateLimit: PLATE_READ_RATE_LIMIT }
  }, async (req) => {
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
    let safe;
    try { safe = validatePlateItems(items); }
    catch (e) { return reply.status(400).send({ error: e.message, field: e.field }); }

    await db.query(
      `INSERT INTO plate_items (user_id, items, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET items = $2, updated_at = now()`,
      [req.user.sub, JSON.stringify(safe)]
    );
    return { ok: true };
  });

  // GET /plate/history — saved plates
  fastify.get('/plate/history', {
    preHandler: authenticate,
    config: { rateLimit: PLATE_READ_RATE_LIMIT }
  }, async (req) => {
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
    let safeItems, safeTotals;
    try {
      safeItems = validatePlateItems(items);
      safeTotals = validateTotals(totals);
    } catch (e) {
      return reply.status(400).send({ error: e.message, field: e.field });
    }
    const safeDate = parsePlateDate(date, { fallbackToNow: true });
    const safeMealType = normalizeMealType(mealType);

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
    await prunePlateHistory(req.user.sub);
    return { ok: true };
  });

  // DELETE /plate/history — remove one saved plate for the current user.
  fastify.delete('/plate/history', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { date } = req.body || {};
    const safeDate = parsePlateDate(date);
    if (!safeDate) return reply.status(400).send({ error: 'date обязателен' });

    const result = await db.query(
      'DELETE FROM plate_history WHERE user_id = $1 AND saved_at = $2',
      [req.user.sub, safeDate]
    );
    return { ok: true, deleted: result.rowCount > 0 };
  });

  // PUT /plate/history — update dishes and nutrition for one saved plate.
  fastify.put('/plate/history', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { date, items, totals } = req.body || {};
    const safeDate = parsePlateDate(date);
    if (!safeDate) return reply.status(400).send({ error: 'date обязателен' });
    if (!Array.isArray(items) || !items.length) {
      return reply.status(400).send({ error: 'items обязателен и не может быть пустым' });
    }
    let safeItems, safeTotals;
    try {
      safeItems = validatePlateItems(items);
      safeTotals = validateTotals(totals);
    } catch (e) {
      return reply.status(400).send({ error: e.message, field: e.field });
    }

    const result = await db.query(
      'UPDATE plate_history SET items = $3, totals = $4 WHERE user_id = $1 AND saved_at = $2',
      [req.user.sub, safeDate, JSON.stringify(safeItems), JSON.stringify(safeTotals)]
    );
    if (!result.rowCount) return reply.status(404).send({ error: 'Запись журнала не найдена' });
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
    const safeMealType = normalizeMealType(mealType);
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
    if (history.length > PLATE_HISTORY_MAX) {
      return reply.status(400).send({ error: 'Слишком много записей истории (макс. ' + PLATE_HISTORY_MAX + ')' });
    }
    const safe = [];
    for (const h of history) {
      try {
        safe.push(normalizeHistoryEntry(h));
      } catch (e) {
        return reply.status(400).send({ error: e.message, field: e.field });
      }
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Don't delete existing server history — only add local-only entries
      for (const h of safe) {
        await client.query(
          `INSERT INTO plate_history (user_id, saved_at, items, totals, meal_type)
           SELECT $1, $2, $3, $4, $5
           WHERE NOT EXISTS (
             SELECT 1 FROM plate_history WHERE user_id = $1 AND saved_at = $2
           )`,
          [req.user.sub, h.date, JSON.stringify(h.items), JSON.stringify(h.totals), h.mealType]
        );
      }
      await prunePlateHistory(req.user.sub, client);
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
