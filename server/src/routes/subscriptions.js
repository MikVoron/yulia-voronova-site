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
      `SELECT u.role, s.status, s.trial_ends_at, s.active_until, s.created_at
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
    return { status: sub.status, trialEndsAt: sub.trial_ends_at, activeUntil: sub.active_until, daysLeft, createdAt: sub.created_at };
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

  // POST /feedback — обратная связь от пользователя
  fastify.post('/feedback', {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (req, reply) => {
    const { category, text } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Введите текст' });
    if (text.length > 2000) return reply.status(400).send({ error: 'Слишком длинный текст' });
    const cat = ['wish', 'recipe', 'problem'].includes(category) ? category : 'wish';
    const trimmed = text.trim();
    const email = req.user.email;
    // Сохраняем в БД
    const result = await db.query(
      'INSERT INTO feedback_messages (user_id, category, text) VALUES ($1,$2,$3) RETURNING *',
      [req.user.sub, cat, trimmed]
    );
    // Email админу (не блокируем ответ)
    sendFeedback(email, cat, trimmed).catch(e => fastify.log.error(e, 'Feedback email error'));
    return result.rows[0];
  });

  // GET /feedback — обращения текущего пользователя
  fastify.get('/feedback', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, category, text, status, admin_reply, admin_replied_at, reply_seen, created_at FROM feedback_messages WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    return result.rows;
  });

  // POST /feedback/mark-seen — пометить ответы как просмотренные
  fastify.post('/feedback/mark-seen', { preHandler: authenticate }, async (req) => {
    await db.query(
      "UPDATE feedback_messages SET reply_seen=true WHERE user_id=$1 AND status='answered' AND reply_seen=false",
      [req.user.sub]
    );
    return { ok: true };
  });
}

module.exports = subscriptionRoutes;
