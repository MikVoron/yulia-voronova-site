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
  const u = await db.query('SELECT is_blocked FROM users WHERE id=$1', [req.user.sub]);
  if (!u.rows.length || u.rows[0].is_blocked) return reply.status(403).send({ error: 'Аккаунт заблокирован' });
}

async function requireAdmin(req, reply) {
  await authenticate(req, reply);
  if (reply.sent) return;
  // is_blocked уже проверен в authenticate(), здесь только роль
  const u = await db.query('SELECT role FROM users WHERE id=$1', [req.user.sub]);
  if (!u.rows.length || u.rows[0].role !== 'admin') return reply.status(403).send({ error: 'Нет доступа' });
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

async function optionalAuthenticate(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return;
  let payload;
  try {
    payload = verifyAccessToken(auth.slice(7));
  } catch { return; }
  // Treat blocked/missing users as unauthenticated so public endpoints
  // (e.g. /content/recipes) don't leak paid fields to them.
  const u = await db.query('SELECT is_blocked FROM users WHERE id=$1', [payload.sub]);
  if (!u.rows.length || u.rows[0].is_blocked) return;
  req.user = payload;
}

async function checkActiveSubscription(userId) {
  const result = await db.query(
    'SELECT status, trial_ends_at, active_until FROM subscriptions WHERE user_id=$1', [userId]
  );
  if (!result.rows.length) return false;
  const sub = result.rows[0];
  const now = new Date();
  if (sub.status === 'trial' && new Date(sub.trial_ends_at) > now) return true;
  if (sub.status === 'active' && new Date(sub.active_until) > now) return true;
  return false;
}

// Возвращает уровень доступа пользователя: 'admin' | 'active' | 'trial' | 'guest'.
// 'guest' — нет токена / нет user / просроченная подписка / нет подписки.
// Используется в /content/recipes для решения, какие поля рецепта возвращать.
async function getUserTier(userId) {
  if (!userId) return 'guest';
  const u = await db.query('SELECT role FROM users WHERE id=$1', [userId]);
  if (u.rows.length && u.rows[0].role === 'admin') return 'admin';
  const result = await db.query(
    'SELECT status, trial_ends_at, active_until FROM subscriptions WHERE user_id=$1', [userId]
  );
  if (!result.rows.length) return 'guest';
  const sub = result.rows[0];
  const now = new Date();
  if (sub.status === 'active' && new Date(sub.active_until) > now) return 'active';
  if (sub.status === 'trial'  && new Date(sub.trial_ends_at) > now) return 'trial';
  return 'guest';
}

// Решает, может ли пользователь видеть полный рецепт (ingredients/steps/note).
// access_level: 'free' | 'trial' | 'pro'  (см. docs/guest-mode-mvp.md §5A.3)
function userCanSeeRecipe(userTier, accessLevel) {
  if (accessLevel === 'free') return true;
  if (accessLevel === 'trial') {
    return userTier === 'trial' || userTier === 'active' || userTier === 'admin';
  }
  if (accessLevel === 'pro') {
    return userTier === 'active' || userTier === 'admin';
  }
  return false;  // неизвестный уровень — закрыто
}

module.exports = {
  authenticate, requireAdmin, requireActiveSubscription,
  optionalAuthenticate, checkActiveSubscription,
  getUserTier, userCanSeeRecipe,
};
