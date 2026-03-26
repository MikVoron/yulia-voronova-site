const db = require('../db');
const { authenticate } = require('../middleware');
const { sendPaymentNotification, sendFeedback } = require('../email');

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
      'SELECT status, trial_ends_at, active_until, created_at FROM subscriptions WHERE user_id=$1',
      [req.user.sub]
    );
    if (!result.rows.length) return { status: 'none' };
    const sub = result.rows[0];
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
  fastify.post('/subscription/payment', { preHandler: authenticate }, async (req, reply) => {
    const { amount, paymentDate, comment, screenshot } = req.body || {};
    if (!amount || !paymentDate) return reply.status(400).send({ error: 'amount и paymentDate обязательны' });
    // Validate screenshot if present (max ~5MB base64)
    if (screenshot && screenshot.length > 7 * 1024 * 1024) return reply.status(400).send({ error: 'Скриншот слишком большой' });
    // email берём из JWT — надёжнее чем из формы
    const emailRow = await db.query('SELECT email FROM users WHERE id=$1', [req.user.sub]);
    const senderEmail = emailRow.rows[0]?.email || '';
    await db.query(
      'INSERT INTO payments (user_id, amount, sender_name, payment_date, user_comment, screenshot, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.sub, amount, senderEmail, paymentDate, comment || null, screenshot || null, 'pending']
    );
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
  // POST /feedback — обратная связь от пользователя
  fastify.post('/feedback', { preHandler: authenticate }, async (req, reply) => {
    const { category, text } = req.body || {};
    if (!text || !text.trim()) return reply.status(400).send({ error: 'Введите текст' });
    if (text.length > 2000) return reply.status(400).send({ error: 'Слишком длинный текст' });
    const email = req.user.email;
    try {
      await sendFeedback(email, category || 'wish', text.trim());
    } catch (e) {
      fastify.log.error(e, 'Feedback email error');
      return reply.status(500).send({ error: 'Не удалось отправить' });
    }
    return { ok: true };
  });
}

module.exports = subscriptionRoutes;
