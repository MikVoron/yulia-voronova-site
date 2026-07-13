const db = require('./db');
const { hashToken } = require('./auth');

const REFRESH_SESSION_MAX_ACTIVE = 10;

async function issueRefreshSession(userId, refreshToken, req, options = {}) {
  const ttl = options.admin === true ? '12 hours' : '30 days';
  await db.query(
    'DELETE FROM refresh_sessions WHERE user_id=$1 AND expires_at <= now()',
    [userId]
  );
  await db.query(
    'INSERT INTO refresh_sessions (user_id, refresh_token_hash, ua, ip, expires_at) VALUES ($1,$2,$3,$4, now() + $5::interval)',
    [userId, hashToken(refreshToken), req.headers['user-agent'] || '', req.ip, ttl]
  );
  await db.query(
    `DELETE FROM refresh_sessions
      WHERE id IN (
        SELECT id FROM refresh_sessions
         WHERE user_id=$1
         ORDER BY expires_at DESC, id DESC
         OFFSET $2
      )`,
    [userId, REFRESH_SESSION_MAX_ACTIVE]
  );
}

module.exports = { issueRefreshSession, REFRESH_SESSION_MAX_ACTIVE };
