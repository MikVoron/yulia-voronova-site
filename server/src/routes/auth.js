const bcrypt = require('bcrypt');
const db = require('../db');
const { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, generateLoginCode } = require('../auth');
const { sendLoginCode, sendWelcome } = require('../email');
const { authenticate } = require('../middleware');
const { shouldGrantTrial, recordTrial } = require('../trial-guard');
const audit = require('../audit');

async function authRoutes(fastify) {

  // POST /auth/send-code
  fastify.post('/auth/send-code', async (req, reply) => {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.status(400).send({ error: 'Некорректный email' });
    const lower = email.toLowerCase().trim();
    // rate limit по IP: макс 10 кодов за 15 минут с одного IP
    const ip = req.ip;
    const ipRecent = await db.query("SELECT COUNT(*) FROM login_codes WHERE ip=$1 AND created_at > now() - interval '15 minutes'", [ip]);
    if (Number(ipRecent.rows[0].count) >= 10) return reply.status(429).send({ error: 'Слишком много запросов. Подождите 15 минут' });
    // rate limit по email
    const recent = await db.query("SELECT COUNT(*) FROM login_codes WHERE email=$1 AND created_at > now() - interval '15 minutes'", [lower]);
    if (Number(recent.rows[0].count) >= 3) return reply.status(429).send({ error: 'Слишком много попыток. Подождите 15 минут' });
    const code = generateLoginCode();
    const codeHash = await bcrypt.hash(code, 10);
    await db.query("INSERT INTO login_codes (email, code_hash, expires_at, ip) VALUES ($1, $2, now() + interval '5 minutes', $3)", [lower, codeHash, ip]);
    try { await sendLoginCode(lower, code); } catch (e) { fastify.log.error(e, 'SMTP error'); return reply.status(500).send({ error: 'Не удалось отправить письмо' }); }
    return { ok: true, message: 'Код отправлен на ' + lower };
  });

  // POST /auth/verify
  fastify.post('/auth/verify', async (req, reply) => {
    const { email, code } = req.body || {};
    if (!email || !code) return reply.status(400).send({ error: 'email и code обязательны' });
    const lower = email.toLowerCase().trim();
    // rate limit по IP: макс 20 попыток верификации за 15 минут
    const ipVerify = await db.query("SELECT COALESCE(SUM(attempts), 0) AS total FROM login_codes WHERE ip=$1 AND created_at > now() - interval '15 minutes'", [req.ip]);
    if (Number(ipVerify.rows[0].total) >= 20) return reply.status(429).send({ error: 'Слишком много попыток. Подождите 15 минут' });
    const result = await db.query('SELECT * FROM login_codes WHERE email=$1 AND used=false AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [lower]);
    if (!result.rows.length) return reply.status(400).send({ error: 'Код не найден или истёк' });
    const row = result.rows[0];
    if (row.attempts >= 3) {
      await db.query('UPDATE login_codes SET used=true WHERE id=$1', [row.id]);
      return reply.status(400).send({ error: 'Превышено число попыток' });
    }
    const valid = await bcrypt.compare(code, row.code_hash);
    if (!valid) {
      await db.query('UPDATE login_codes SET attempts=attempts+1 WHERE id=$1', [row.id]);
      return reply.status(400).send({ error: 'Неверный код' });
    }
    await db.query('UPDATE login_codes SET used=true WHERE id=$1', [row.id]);
    // найти или создать пользователя
    let userRes = await db.query('SELECT * FROM users WHERE email=$1', [lower]);
    let isNew = false;
    if (!userRes.rows.length) {
      isNew = true;
      const fingerprint = req.body.fingerprint || null;
      userRes = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING *', [lower]);
      const userId = userRes.rows[0].id;
      await db.query('INSERT INTO auth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)', [userId, 'email', lower]);
      // Проверка: давать ли триал
      const trial = await shouldGrantTrial(fingerprint, req.ip);
      if (trial.grant) {
        await db.query("INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'trial', now() + interval '7 days', $2, $3)", [userId, req.ip, fingerprint]);
        await recordTrial(fingerprint, req.ip, userId);
        audit.log('trial_granted', { userId, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
      } else {
        await db.query("INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'expired', now(), $2, $3)", [userId, req.ip, fingerprint]);
        audit.log('trial_denied', { userId, email: lower, detail: trial.reason, ip: req.ip, ua: req.headers['user-agent'] });
      }
      audit.log('register', { userId, email: lower, detail: 'email', ip: req.ip, ua: req.headers['user-agent'] });
      sendWelcome(lower).catch(e => fastify.log.error(e, 'Welcome email error'));
    }
    const user = userRes.rows[0];
    if (user.is_blocked) {
      audit.log('login_blocked', { userId: user.id, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
      return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    }
    audit.log('login', { userId: user.id, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await db.query(
      "INSERT INTO refresh_sessions (user_id, refresh_token_hash, ua, ip, expires_at) VALUES ($1,$2,$3,$4, now() + interval '30 days')",
      [user.id, hashToken(refreshToken), req.headers['user-agent'] || '', req.ip]
    );
    reply.setCookie('refreshToken', refreshToken, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
    });
    return { accessToken, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role }, isNew };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', async (req, reply) => {
    const token = req.cookies.refreshToken;
    if (!token) return reply.status(401).send({ error: 'Нет refresh токена' });
    const tokenHash = hashToken(token);
    const result = await db.query(
      'SELECT rs.*, u.email, u.role, u.display_name, u.is_blocked FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id WHERE rs.refresh_token_hash=$1 AND rs.expires_at > now()',
      [tokenHash]
    );
    if (!result.rows.length) {
      reply.clearCookie('refreshToken', { path: '/' });
      return reply.status(401).send({ error: 'Сессия истекла' });
    }
    const session = result.rows[0];
    if (session.is_blocked) return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    await db.query('DELETE FROM refresh_sessions WHERE id=$1', [session.id]);
    const newRefresh = generateRefreshToken();
    await db.query(
      "INSERT INTO refresh_sessions (user_id, refresh_token_hash, ua, ip, expires_at) VALUES ($1,$2,$3,$4, now() + interval '30 days')",
      [session.user_id, hashToken(newRefresh), req.headers['user-agent'] || '', req.ip]
    );
    const accessToken = generateAccessToken({ id: session.user_id, email: session.email, role: session.role });
    reply.setCookie('refreshToken', newRefresh, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
    });
    return { accessToken, user: { id: session.user_id, email: session.email, displayName: session.display_name, role: session.role } };
  });

  // POST /auth/logout
  fastify.post('/auth/logout', async (req, reply) => {
    const token = req.cookies.refreshToken;
    if (token) {
      await db.query('DELETE FROM refresh_sessions WHERE refresh_token_hash=$1', [hashToken(token)]);
    }
    reply.clearCookie('refreshToken', { path: '/' });
    return { ok: true };
  });

  // GET /auth/me
  fastify.get('/auth/me', async (req, reply) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return reply.status(401).send({ error: 'Не авторизован' });
    try {
      const payload = verifyAccessToken(auth.slice(7));
      const result = await db.query(
        'SELECT u.*, s.status as sub_status, s.trial_ends_at, s.active_until FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.id=$1',
        [payload.sub]
      );
      if (!result.rows.length) return reply.status(401).send({ error: 'Пользователь не найден' });
      const u = result.rows[0];
      // Fallback: если cron не обновил статус — проверяем даты
      let status = u.sub_status;
      if (status === 'trial' && u.trial_ends_at && new Date(u.trial_ends_at) < new Date()) {
        status = 'expired';
        db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='trial'", [u.id]).catch(() => {});
      } else if (status === 'active' && u.active_until && new Date(u.active_until) < new Date()) {
        status = 'expired';
        db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='active'", [u.id]).catch(() => {});
      }
      return {
        id: u.id, email: u.email, displayName: u.display_name, role: u.role,
        subscription: { status, trialEndsAt: u.trial_ends_at, activeUntil: u.active_until }
      };
    } catch (e) {
      return reply.status(401).send({ error: 'Токен невалиден' });
    }
  });

  // PUT /auth/profile — обновить display_name
  fastify.put('/auth/profile', { preHandler: authenticate }, async (req, reply) => {
    const { displayName } = req.body || {};
    const name = displayName ? displayName.trim().slice(0, 100) : null;
    await db.query('UPDATE users SET display_name=$1 WHERE id=$2', [name, req.user.sub]);
    return { ok: true, displayName: name };
  });
}

module.exports = authRoutes;
