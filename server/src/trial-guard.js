const db = require('./db');

const MAX_TRIALS_PER_IP = 3;
const IP_WINDOW_DAYS = 90;

/**
 * Проверяет, можно ли выдать триал новому пользователю.
 * @param {string|null} fingerprint — SHA-256 хеш браузера (null для OAuth)
 * @param {string} ip — IP-адрес запроса
 * @returns {{ grant: boolean, reason: string }}
 */
async function shouldGrantTrial(fingerprint, ip) {
  // 1. Проверка по fingerprint (если есть)
  if (fingerprint) {
    const fpResult = await db.query(
      'SELECT COUNT(*) FROM trial_fingerprints WHERE fingerprint=$1',
      [fingerprint]
    );
    if (Number(fpResult.rows[0].count) >= 1) {
      return { grant: false, reason: 'fingerprint_used' };
    }
  }

  // 2. Проверка по IP
  const ipResult = await db.query(
    "SELECT COUNT(*) FROM trial_fingerprints WHERE ip=$1 AND created_at > now() - interval '" + IP_WINDOW_DAYS + " days'",
    [ip]
  );
  if (Number(ipResult.rows[0].count) >= MAX_TRIALS_PER_IP) {
    return { grant: false, reason: 'ip_limit' };
  }

  return { grant: true, reason: 'ok' };
}

/**
 * Записывает fingerprint после выдачи триала.
 */
async function recordTrial(fingerprint, ip, userId) {
  await db.query(
    'INSERT INTO trial_fingerprints (fingerprint, ip, user_id) VALUES ($1, $2, $3)',
    [fingerprint || 'none', ip, userId]
  );
}

module.exports = { shouldGrantTrial, recordTrial };
