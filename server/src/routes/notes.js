const db = require('../db');
const { authenticate } = require('../middleware');

const NOTES_MAX = 200;
const NOTE_TEXT_MAX = 10000;
const NOTE_TITLE_MAX = 60;

function parseNoteId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function pruneOldNotes(userId) {
  await db.query(
    `DELETE FROM user_notes
      WHERE user_id = $1
        AND id IN (
          SELECT id FROM user_notes
           WHERE user_id = $1
           ORDER BY created_at DESC, id DESC
           OFFSET $2
        )`,
    [userId, NOTES_MAX]
  );
}

async function notesRoutes(fastify) {

  // GET /notes — list all user notes
  fastify.get('/notes', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, title, text, created_at, updated_at FROM user_notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.sub, NOTES_MAX]
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
    const noteId = parseNoteId(id);
    if (!noteId || typeof text !== 'string') {
      return reply.status(400).send({ error: 'id и text обязательны' });
    }
    if (text.length > NOTE_TEXT_MAX) return reply.status(400).send({ error: 'text слишком длинный' });
    if (title != null && String(title).length > NOTE_TITLE_MAX) return reply.status(400).send({ error: 'title слишком длинный' });
    const safeTitle = (title || '').toString().trim() || 'Заметка';

    await db.query(
      `INSERT INTO user_notes (id, user_id, title, text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (user_id, id) DO UPDATE SET title = $3, text = $4, updated_at = now()`,
      [noteId, req.user.sub, safeTitle, text]
    );
    await pruneOldNotes(req.user.sub);
    return { ok: true };
  });

  // DELETE /notes/:id — remove a note
  fastify.delete('/notes/:id', {
    preHandler: authenticate,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const noteId = parseNoteId(req.params.id);
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
    if (notes.length > NOTES_MAX) {
      return reply.status(400).send({ error: 'Слишком много заметок (макс. ' + NOTES_MAX + ')' });
    }
    const safe = [];
    for (const n of notes) {
      if (!n || typeof n.text !== 'string') continue;
      const id = parseNoteId(n.id);
      if (!id) continue;
      if (n.text.length > NOTE_TEXT_MAX) return reply.status(400).send({ error: 'text слишком длинный' });
      if (n.title != null && String(n.title).length > NOTE_TITLE_MAX) return reply.status(400).send({ error: 'title слишком длинный' });
      safe.push({ ...n, id });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_notes WHERE user_id = $1', [req.user.sub]);
      for (const n of safe) {
        const title = ((n.title || '') + '').trim() || 'Заметка';
        const text = n.text;
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
