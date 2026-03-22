const db = require('../db');
const { authenticate } = require('../middleware');

async function subscriptionRoutes(fastify) {

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
    const { amount, cardLast4, paymentDate } = req.body || {};
    if (!amount || !paymentDate) return reply.status(400).send({ error: 'amount и paymentDate обязательны' });
    await db.query(
      'INSERT INTO payments (user_id, amount, card_last4, payment_date, status) VALUES ($1,$2,$3,$4,$5)',
      [req.user.sub, amount, cardLast4 || null, paymentDate, 'pending']
    );
    return { ok: true, message: 'Платёж отправлен на проверку' };
  });

  // GET /subscription/payments — история платежей пользователя
  fastify.get('/subscription/payments', { preHandler: authenticate }, async (req) => {
    const result = await db.query(
      'SELECT id, amount, card_last4, payment_date, status, admin_comment, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    return result.rows;
  });
}

module.exports = subscriptionRoutes;
