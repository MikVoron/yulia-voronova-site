const bcrypt = require('bcrypt');
const db = require('../db');
const { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, generateLoginCode } = require('../auth');
const { issueRefreshSession } = require('../refresh-sessions');
const { sendLoginCode, sendWelcome, sendNewUserNotification } = require('../email');
const { authenticate } = require('../middleware');
const { tryGrantTrial } = require('../trial-guard');
const audit = require('../audit');

const AUTH_SEND_CODE_RATE_LIMIT = { max: 10, timeWindow: '15 minutes' };
const AUTH_VERIFY_RATE_LIMIT = { max: 20, timeWindow: '15 minutes' };
const AUTH_REFRESH_RATE_LIMIT = { max: 60, timeWindow: '15 minutes' };
const AUTH_LOGOUT_RATE_LIMIT = { max: 60, timeWindow: '15 minutes' };
const AUTH_PROFILE_RATE_LIMIT = { max: 20, timeWindow: '1 hour' };

async function authRoutes(fastify) {
  // POST /auth/send-code
  fastify.post('/auth/send-code', {
    config: { rateLimit: AUTH_SEND_CODE_RATE_LIMIT }
  }, async (req, reply) => {
    const { email, context } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.status(400).send({ error: 'Некорректный email' });
    const lower = email.toLowerCase().trim();
    // Если вход через админку — проверяем что email принадлежит админу
    // Отвечаем 200 в любом случае, чтобы не раскрывать наличие/роль аккаунта
    if (context === 'admin') {
      const adminCheck = await db.query("SELECT role FROM users WHERE email=$1", [lower]);
      if (!adminCheck.rows.length || adminCheck.rows[0].role !== 'admin') {
        return reply.send({ ok: true });
      }
    }
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
  fastify.post('/auth/verify', {
    config: { rateLimit: AUTH_VERIFY_RATE_LIMIT }
  }, async (req, reply) => {
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
      // Атомарная проверка + fingerprint + subscription — всё в одной транзакции
      const trial = await tryGrantTrial(fingerprint, req.ip, userId);
      if (trial.grant) {
        audit.log('trial_granted', { userId, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
      } else {
        audit.log('trial_denied', { userId, email: lower, detail: trial.reason, ip: req.ip, ua: req.headers['user-agent'] });
      }
      audit.log('register', { userId, email: lower, detail: 'email', ip: req.ip, ua: req.headers['user-agent'] });
      sendWelcome(lower, trial.grant).catch(e => fastify.log.error(e, 'Welcome email error'));
      sendNewUserNotification(
        { id: userId, email: lower },
        { method: 'email', ip: req.ip, userAgent: req.headers['user-agent'], trialGranted: trial.grant }
      ).catch(e => fastify.log.error(e, 'New user notification error'));
    }
    const user = userRes.rows[0];
    if (user.is_blocked) {
      audit.log('login_blocked', { userId: user.id, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
      return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    }
    audit.log('login', { userId: user.id, email: lower, ip: req.ip, ua: req.headers['user-agent'] });
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await issueRefreshSession(user.id, refreshToken, req);
    reply.setCookie('refreshToken', refreshToken, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
    });
    return { accessToken, user: { id: user.id, email: user.email, displayName: user.display_name, avatar: user.avatar || null, role: user.role, createdAt: user.created_at }, isNew };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', {
    config: { rateLimit: AUTH_REFRESH_RATE_LIMIT }
  }, async (req, reply) => {

    const token = req.cookies.refreshToken;
    if (!token) return reply.status(401).send({ error: 'Нет refresh токена' });
    const tokenHash = hashToken(token);
    const result = await db.query(
      `DELETE FROM refresh_sessions rs
        USING users u
       WHERE rs.user_id=u.id
         AND rs.refresh_token_hash=$1
         AND rs.expires_at > now()
       RETURNING rs.user_id, u.email, u.role, u.display_name, u.avatar,
                 u.is_blocked, u.created_at AS user_created_at`,
      [tokenHash]
    );
    if (!result.rows.length) {
      // Do not clear the cookie here: another tab may have just rotated the
      // same refresh token and set a newer cookie in the browser.
      return reply.status(401).send({ error: 'Сессия истекла' });
    }
    const session = result.rows[0];
    if (session.is_blocked) return reply.status(403).send({ error: 'Аккаунт заблокирован' });
    const newRefresh = generateRefreshToken();
    await issueRefreshSession(session.user_id, newRefresh, req);
    const accessToken = generateAccessToken({ id: session.user_id, email: session.email, role: session.role });
    reply.setCookie('refreshToken', newRefresh, {
      path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 2592000
    });
    return { accessToken, user: { id: session.user_id, email: session.email, displayName: session.display_name, avatar: session.avatar || null, role: session.role, createdAt: session.user_created_at } };
  });

  // POST /auth/logout
  fastify.post('/auth/logout', {
    config: { rateLimit: AUTH_LOGOUT_RATE_LIMIT }
  }, async (req, reply) => {
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
        `SELECT u.*, s.status as sub_status, s.trial_ends_at, s.active_until,
                (s.status = 'expired'
                  AND s.trial_ends_at IS NOT NULL
                  AND s.created_at IS NOT NULL
                  AND s.trial_ends_at <= s.created_at + interval '1 minute') AS trial_not_granted
           FROM users u
           LEFT JOIN subscriptions s ON s.user_id=u.id
          WHERE u.id=$1`,
        [payload.sub]
      );
      if (!result.rows.length) return reply.status(401).send({ error: 'Пользователь не найден' });
      const u = result.rows[0];
      // Fallback: если cron не обновил статус — проверяем даты (не для админов)
      let status = u.sub_status;
      if (u.role !== 'admin') {
        if (status === 'trial' && u.trial_ends_at && new Date(u.trial_ends_at) < new Date()) {
          status = 'expired';
          db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='trial'", [u.id]).catch(() => {});
        } else if (status === 'active' && u.active_until && new Date(u.active_until) < new Date()) {
          status = 'expired';
          db.query("UPDATE subscriptions SET status='expired' WHERE user_id=$1 AND status='active'", [u.id]).catch(() => {});
        }
      }
      return {
        id: u.id, email: u.email, displayName: u.display_name, avatar: u.avatar || null, role: u.role, createdAt: u.created_at,
        subscription: {
          status,
          trialEndsAt: u.trial_ends_at,
          activeUntil: u.active_until,
          trialNotGranted: u.trial_not_granted === true
        }
      };
    } catch (e) {
      return reply.status(401).send({ error: 'Токен невалиден' });
    }
  });

  // PUT /auth/profile — обновить display_name и/или avatar
  fastify.put('/auth/profile', {
    preHandler: authenticate,
    config: { rateLimit: AUTH_PROFILE_RATE_LIMIT }
  }, async (req, reply) => {

    const { displayName, avatar } = req.body || {};
    let name = undefined;
    if (displayName !== undefined) {
      if (displayName == null || displayName === '') {
        name = null;
      } else if (typeof displayName !== 'string') {
        return reply.status(400).send({ error: 'Некорректное имя' });
      } else {
        const trimmed = displayName.trim();
        name = trimmed ? trimmed.slice(0, 100) : null;
      }
    }

    let ava = undefined;
    if (avatar !== undefined) {
      if (avatar == null || avatar === '') {
        ava = null; // сброс аватара
      } else if (typeof avatar !== 'string') {
        return reply.status(400).send({ error: 'Некорректный аватар' });
      } else {
        if (avatar.length > 320 * 1024) return reply.status(400).send({ error: 'Аватар слишком большой. Максимум 220 КБ' });
        const match = avatar.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
        if (!match) return reply.status(400).send({ error: 'Недопустимый формат аватара. Разрешены PNG, JPEG, WebP, GIF' });
        let decoded;
        try { decoded = Buffer.from(match[2], 'base64'); } catch { return reply.status(400).send({ error: 'Некорректный base64 в аватаре' }); }
        if (decoded.length > 220 * 1024) return reply.status(400).send({ error: 'Аватар слишком большой. Максимум 220 КБ' });
        ava = avatar;
      }
    }

    const sets = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { sets.push('display_name=$' + idx++); vals.push(name); }
    if (ava !== undefined) { sets.push('avatar=$' + idx++); vals.push(ava); }
    if (!sets.length) return reply.status(400).send({ error: 'Нет данных' });
    vals.push(req.user.sub);
    await db.query('UPDATE users SET ' + sets.join(', ') + ' WHERE id=$' + idx, vals);
    return { ok: true, displayName: name !== undefined ? name : null, avatar: ava !== undefined ? ava : null };
  });
}

module.exports = authRoutes;
