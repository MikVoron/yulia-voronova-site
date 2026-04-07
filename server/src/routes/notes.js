const db = require('../db');
const { authenticate } = require('../middleware');

async function notesRoutes(fastify) {

  // GET /notes — list all user notes
  fastify.get('/notes', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, title, text, created_at, updated_at FROM user_notes WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    return result.rows.map(r => ({
      id: Number(r.id),
      title: r.title,
      text: r.text,
      date: r.created_at.toISOString(),
      updated: r.updated_at.toISOString()
    }));
  });

  // POST /notes/upsert — create or update a note
  fastify.post('/notes/upsert', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { id, title, text } = req.body || {};
    if (!id || typeof text !== 'string') {
      return reply.status(400).send({ error: 'id и text обязательны' });
    }
    const safeTitle = (title || '').slice(0, 60) || 'Заметка';
    const safeText = text.slice(0, 10000);

    await db.query(
      `INSERT INTO user_notes (id, user_id, title, text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (user_id, id) DO UPDATE SET title = $3, text = $4, updated_at = now()`,
      [id, req.user.sub, safeTitle, safeText]
    );
    return { ok: true };
  });

  // DELETE /notes/:id — remove a note
  fastify.delete('/notes/:id', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const noteId = Number(req.params.id);
    if (!noteId) return reply.status(400).send({ error: 'id обязателен' });
    await db.query(
      'DELETE FROM user_notes WHERE user_id = $1 AND id = $2',
      [req.user.sub, noteId]
    );
    return { ok: true };
  });

  // PUT /notes/sync — bulk sync: client sends full list, server replaces
  fastify.put('/notes/sync', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { notes } = req.body || {};
    if (!Array.isArray(notes)) {
      return reply.status(400).send({ error: 'notes должен быть массивом' });
    }
    const safe = notes.filter(n => n && n.id && typeof n.text === 'string').slice(0, 200);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_notes WHERE user_id = $1', [req.user.sub]);
      for (const n of safe) {
        const title = ((n.title || '') + '').slice(0, 60) || 'Заметка';
        const text = (n.text + '').slice(0, 10000);
        const created = n.date || new Date().toISOString();
        const updated = n.updated || created;
        await client.query(
          'INSERT INTO user_notes (id, user_id, title, text, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
          [n.id, req.user.sub, title, text, created, updated]
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

module.exports = notesRoutes;
