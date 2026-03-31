const db = require('./db');

const MAX_TRIALS_PER_IP = 3;
const IP_WINDOW_DAYS = 90;
const TRIAL_DAYS = 7;

/**
 * Атомарная проверка + выдача триала.
 * Одна транзакция: advisory locks → проверка → trial_fingerprints → subscriptions.
 * Ничего не "подвисает" — либо всё записано, либо всё откачено.
 *
 * @param {string|null} fingerprint — SHA-256 хеш браузера (null для OAuth)
 * @param {string} ip — IP-адрес запроса
 * @param {number} userId
 * @returns {{ grant: boolean, reason: string }}
 */
async function tryGrantTrial(fingerprint, ip, userId) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory locks: сначала IP, потом fingerprint (фиксированный порядок → нет deadlock)
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trial_ip:' || $1))", [ip]);
    if (fingerprint) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('trial_fp:' || $1))", [fingerprint]);
    }

    // 1. Проверка fingerprint (+ UNIQUE partial index в БД как страховка)
    if (fingerprint) {
      const fpResult = await client.query(
        'SELECT 1 FROM trial_fingerprints WHERE fingerprint=$1 LIMIT 1',
        [fingerprint]
      );
      if (fpResult.rows.length > 0) {
        // Триал не положен — создаём expired-подписку и откатываем fingerprint
        await client.query(
          "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'expired', now(), $2, $3) ON CONFLICT DO NOTHING",
          [userId, ip, fingerprint]
        );
        await client.query('COMMIT');
        return { grant: false, reason: 'fingerprint_used' };
      }
    }

    // 2. Проверка лимита по IP
    const ipResult = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM trial_fingerprints WHERE ip=$1 AND created_at > now() - interval '" + IP_WINDOW_DAYS + " days'",
      [ip]
    );
    if (ipResult.rows[0].cnt >= MAX_TRIALS_PER_IP) {
      await client.query(
        "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'expired', now(), $2, $3) ON CONFLICT DO NOTHING",
        [userId, ip, fingerprint]
      );
      await client.query('COMMIT');
      return { grant: false, reason: 'ip_limit' };
    }

    // 3. Триал одобрен — записываем fingerprint + подписку в одной транзакции
    await client.query(
      'INSERT INTO trial_fingerprints (fingerprint, ip, user_id) VALUES ($1, $2, $3)',
      [fingerprint || 'none', ip, userId]
    );
    await client.query(
      "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'trial', now() + interval '" + TRIAL_DAYS + " days', $2, $3)",
      [userId, ip, fingerprint]
    );

    await client.query('COMMIT');
    return { grant: true, reason: 'ok' };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // UNIQUE-барьер на fingerprint сработал — штатный отказ, не 500
    if (e.code === '23505' && e.constraint && e.constraint.includes('trial_fp')) {
      return { grant: false, reason: 'fingerprint_used' };
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { tryGrantTrial };
