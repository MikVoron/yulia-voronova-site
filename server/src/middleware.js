const { verifyAccessToken } = require('./auth');
const db = require('./db');

async function authenticate(req, reply) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return reply.status(401).send({ error: 'Не авторизован' });
  try {
    req.user = verifyAccessToken(auth.slice(7));
  } catch (e) {
    return reply.status(401).send({ error: 'Токен невалиден' });
  }
}

async function requireAdmin(req, reply) {
  await authenticate(req, reply);
  if (reply.sent) return;
  if (req.user.role !== 'admin') return reply.status(403).send({ error: 'Нет доступа' });
}

async function requireActiveSubscription(req, reply) {
  await authenticate(req, reply);
  if (reply.sent) return;
  const result = await db.query(
    'SELECT status, trial_ends_at, active_until FROM subscriptions WHERE user_id=$1', [req.user.sub]
  );
  if (!result.rows.length) return reply.status(403).send({ error: 'Нет подписки' });
  const sub = result.rows[0];
  const now = new Date();
  if (sub.status === 'trial' && new Date(sub.trial_ends_at) > now) return;
  if (sub.status === 'active' && new Date(sub.active_until) > now) return;
  return reply.status(403).send({ error: 'Подписка неактивна', status: sub.status });
}

module.exports = { authenticate, requireAdmin, requireActiveSubscription };
