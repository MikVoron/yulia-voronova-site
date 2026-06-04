const db = require('../db');
const { authenticate } = require('../middleware');
const { sendPaymentNotification, sendFeedback } = require('../email');
const audit = require('../audit');

async function subscriptionRoutes(fastify) {

  // GET /subscription/early-bird — сколько осталось мест по спеццене
  fastify.get('/subscription/early-bird', async () => {
    const result = await db.query("SELECT COUNT(*) FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.status = 'active' AND u.role != 'admin'");
    const total = Number(result.rows[0].count);
    const limit = 50;
    const remaining = Math.max(0, limit - total);
    return { remaining, limit, active: remaining > 0 };
  });

  // GET /subscription — статус подписки текущего пользователя
  fastify.get('/subscription', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      `SELECT u.role, s.status, s.trial_ends_at, s.active_until, s.created_at,
              (s.status = 'expired'
                AND s.trial_ends_at IS NOT NULL
                AND s.created_at IS NOT NULL
                AND s.trial_ends_at <= s.created_at + interval '1 minute') AS trial_not_granted
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
        WHERE u.id=$1`,
      [req.user.sub]
    );
    if (!result.rows.length) return { status: 'none' };
    const sub = result.rows[0];
    if (sub.role === 'admin') {
      return {
        status: 'active',
        trialEndsAt: null,
        activeUntil: null,
        createdAt: sub.created_at || null,
        isAdmin: true
      };
    }
    if (!sub.status) return { status: 'none' };
    const now = new Date();
    let daysLeft = 0;
    if (sub.status === 'trial' && sub.trial_ends_at) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.trial_ends_at) - now) / 86400000));
    } else if (sub.status === 'active' && sub.active_until) {
      daysLeft = Math.max(0, Math.ceil((new Date(sub.active_until) - now) / 86400000));
    }
    return {
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      activeUntil: sub.active_until,
      daysLeft,
      createdAt: sub.created_at,
      trialNotGranted: sub.trial_not_granted === true
    };
  });

  // POST /subscription/payment — пользователь сообщает об оплате
  fastify.post('/subscription/payment', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { amount, paymentDate, comment, screenshot } = req.body || {};
    if (!amount || !paymentDate) return reply.status(400).send({ error: 'amount и paymentDate обязательны' });
    // Validate screenshot if present (max ~5MB base64)
    if (screenshot && screenshot.length > 7 * 1024 * 1024) return reply.status(400).send({ error: 'Скриншот слишком большой' });
    // Защита от обычного повторного submit и прямого одиночного API-запроса.
    // Полноценная DB-защита от параллельных POST (например через partial unique index
    // на status='pending') — post-MVP.
    const existingPending = await db.query(
      "SELECT id FROM payments WHERE user_id=$1 AND status='pending' LIMIT 1",
      [req.user.sub]
    );
    if (existingPending.rows.length) {
      return reply.status(409).send({ error: 'У вас уже есть платёж на проверке. Дождитесь подтверждения или напишите в поддержку.' });
    }
    // email берём из JWT — надёжнее чем из формы
    const emailRow = await db.query('SELECT email FROM users WHERE id=$1', [req.user.sub]);
    const senderEmail = emailRow.rows[0]?.email || '';
    await db.query(
      'INSERT INTO payments (user_id, amount, sender_name, payment_date, user_comment, screenshot, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.sub, amount, senderEmail, paymentDate, comment || null, screenshot || null, 'pending']
    );
    audit.log('payment_submit', { userId: req.user.sub, email: senderEmail, detail: amount + '₽', ip: req.ip });
    sendPaymentNotification(senderEmail, amount, paymentDate, !!screenshot).catch(err => fastify.log.error(err, 'payment notification email failed'));
    return { ok: true, message: 'Платёж отправлен на проверку' };
  });

  // GET /subscription/payments — история платежей пользователя
  fastify.get('/subscription/payments', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, amount, sender_name, payment_date, status, admin_comment, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    return result.rows;
  });
  // GET /subscription/newsletter — статус подписки на рассылку
  fastify.get('/subscription/newsletter', { preHandler: authenticate }, async (req) => {
    const result = await db.query('SELECT newsletter_subscribed FROM users WHERE id=$1', [req.user.sub]);
    return { subscribed: result.rows[0]?.newsletter_subscribed ?? true };
  });

  // PUT /subscription/newsletter — переключить подписку на рассылку
  fastify.put('/subscription/newsletter', { preHandler: authenticate }, async (req) => {
    const { subscribed } = req.body || {};
    await db.query('UPDATE users SET newsletter_subscribed=$1 WHERE id=$2', [!!subscribed, req.user.sub]);
    return { subscribed: !!subscribed };
  });

  // ===== Обращения (feedback) — треды/диалоги =====
  // Статусы: waiting_admin | waiting_user | closed
  // Диалог хранится в feedback_thread_messages; feedback_messages — шапка.
  // Старые поля text/admin_reply/admin_replied_at/reply_seen в шапке — deprecated,
  // оставлены для исторической совместимости. Новый код их не использует как источник правды.

  const FEEDBACK_TEXT_LIMIT = 2000;
  const FEEDBACK_CATEGORIES = ['wish', 'recipe', 'problem'];

  // POST /feedback — создать обращение (шапка + первое сообщение пользователя)
  fastify.post('/feedback', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { category, text } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Введите текст' });
    if (text.length > FEEDBACK_TEXT_LIMIT) return reply.status(400).send({ error: 'Слишком длинный текст' });
    const cat = FEEDBACK_CATEGORIES.includes(category) ? category : 'wish';
    const trimmed = text.trim();
    const email = req.user.email;

    const client = await db.pool.connect();
    let feedbackId;
    try {
      await client.query('BEGIN');
      // Шапка: text дублируем (deprecated-поле), чтобы старые админ-инструменты не падали
      const ins = await client.query(
        `INSERT INTO feedback_messages (user_id, category, text, status)
         VALUES ($1, $2, $3, 'waiting_admin')
         RETURNING id, category, status, created_at, updated_at`,
        [req.user.sub, cat, trimmed]
      );
      feedbackId = ins.rows[0].id;
      await client.query(
        `INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text)
         VALUES ($1, 'user', $2, $3)`,
        [feedbackId, req.user.sub, trimmed]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    sendFeedback(email, cat, trimmed).catch(e => fastify.log.error(e, 'Feedback email error'));

    return await loadFeedbackThread(feedbackId, req.user.sub);
  });

  // POST /feedback/:id/messages — уточнение пользователя в существующем обращении
  fastify.post('/feedback/:id/messages', {
    preHandler: authenticate,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const { text } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Введите текст' });
    if (text.length > FEEDBACK_TEXT_LIMIT) return reply.status(400).send({ error: 'Слишком длинный текст' });
    const trimmed = text.trim();

    // Проверка владельца, статуса и soft-delete
    const head = await db.query(
      `SELECT id, user_id, category, status, user_deleted_at
         FROM feedback_messages WHERE id=$1`,
      [id]
    );
    if (!head.rows.length || head.rows[0].user_id !== req.user.sub) {
      return reply.status(404).send({ error: 'Обращение не найдено' });
    }
    if (head.rows[0].user_deleted_at) {
      return reply.status(404).send({ error: 'Обращение не найдено' });
    }
    if (head.rows[0].status === 'closed') {
      return reply.status(409).send({ error: 'Обращение закрыто. Создайте новое.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO feedback_thread_messages (feedback_id, sender_type, sender_id, text)
         VALUES ($1, 'user', $2, $3)`,
        [id, req.user.sub, trimmed]
      );
      await client.query(
        `UPDATE feedback_messages SET status='waiting_admin', updated_at=now() WHERE id=$1`,
        [id]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Email админу о новом сообщении пользователя в существующем обращении
    sendFeedback(req.user.email, head.rows[0].category, trimmed, { followUp: true, feedbackId: id })
      .catch(e => fastify.log.error(e, 'Feedback follow-up email error'));

    return await loadFeedbackThread(id, req.user.sub);
  });

  // POST /feedback/:id/close — пользователь отмечает вопрос решённым
  fastify.post('/feedback/:id/close', { preHandler: authenticate }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const result = await db.query(
      `UPDATE feedback_messages
          SET status='closed', updated_at=now()
        WHERE id=$1 AND user_id=$2 AND user_deleted_at IS NULL
        RETURNING id`,
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Обращение не найдено' });
    return await loadFeedbackThread(id, req.user.sub);
  });

  // GET /feedback — обращения текущего пользователя с тредами
  fastify.get('/feedback', { preHandler: authenticate }, async (req) => {
    const heads = await db.query(
      `SELECT id, category, status, created_at, updated_at
         FROM feedback_messages
        WHERE user_id=$1 AND user_deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC`,
      [req.user.sub]
    );
    if (!heads.rows.length) return [];
    const ids = heads.rows.map(r => r.id);
    const msgs = await db.query(
      `SELECT id, feedback_id, sender_type, text, seen_at, created_at
         FROM feedback_thread_messages
        WHERE feedback_id = ANY($1::int[])
        ORDER BY created_at ASC, id ASC`,
      [ids]
    );
    const byThread = new Map();
    for (const m of msgs.rows) {
      if (!byThread.has(m.feedback_id)) byThread.set(m.feedback_id, []);
      byThread.get(m.feedback_id).push({
        id: m.id,
        sender_type: m.sender_type,
        text: m.text,
        seen_at: m.seen_at,
        created_at: m.created_at,
      });
    }
    return heads.rows.map(h => ({
      id: h.id,
      category: h.category,
      status: h.status,
      created_at: h.created_at,
      updated_at: h.updated_at,
      messages: byThread.get(h.id) || [],
    }));
  });

  // POST /feedback/mark-seen — пометить непросмотренные admin-сообщения как просмотренные
  fastify.post('/feedback/mark-seen', { preHandler: authenticate }, async (req) => {
    await db.query(
      `UPDATE feedback_thread_messages m
          SET seen_at = now()
         FROM feedback_messages f
        WHERE m.feedback_id = f.id
          AND f.user_id = $1
          AND f.user_deleted_at IS NULL
          AND m.sender_type = 'admin'
          AND m.seen_at IS NULL`,
      [req.user.sub]
    );
    return { ok: true };
  });

  // DELETE /feedback/:id — soft-delete на стороне пользователя
  // В БД запись остаётся (user_deleted_at), админ продолжает её видеть
  fastify.delete('/feedback/:id', { preHandler: authenticate }, async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.status(400).send({ error: 'Некорректный id' });
    const result = await db.query(
      'UPDATE feedback_messages SET user_deleted_at=now(), updated_at=now() WHERE id=$1 AND user_id=$2 AND user_deleted_at IS NULL RETURNING id',
      [id, req.user.sub]
    );
    if (!result.rows.length) return reply.status(404).send({ error: 'Обращение не найдено' });
    return { ok: true };
  });

  // Хелпер: подгрузить один тред владельца (используется как ответ POST-эндпоинтов)
  async function loadFeedbackThread(id, userId) {
    const head = await db.query(
      `SELECT id, category, status, created_at, updated_at
         FROM feedback_messages WHERE id=$1 AND user_id=$2`,
      [id, userId]
    );
    if (!head.rows.length) return null;
    const msgs = await db.query(
      `SELECT id, sender_type, text, seen_at, created_at
         FROM feedback_thread_messages
        WHERE feedback_id=$1
        ORDER BY created_at ASC, id ASC`,
      [id]
    );
    return { ...head.rows[0], messages: msgs.rows };
  }
}

module.exports = subscriptionRoutes;
