const db = require('./db');

const TRIAL_DAYS = 7;

const NETWORK_THRESHOLDS = Object.freeze({
  watch24h: 5,
  alert24h: 10,
  watch7d: 10,
  alert7d: 20,
  watch90d: 20,
  alert90d: 30
});

function classifyNetworkObservation(counts) {
  if (
    counts.count24h > NETWORK_THRESHOLDS.alert24h ||
    counts.count7d > NETWORK_THRESHOLDS.alert7d ||
    counts.count90d > NETWORK_THRESHOLDS.alert90d
  ) return 'alert';
  if (
    counts.count24h > NETWORK_THRESHOLDS.watch24h ||
    counts.count7d > NETWORK_THRESHOLDS.watch7d ||
    counts.count90d > NETWORK_THRESHOLDS.watch90d
  ) return 'watch';
  return 'normal';
}

/**
 * Атомарная проверка + выдача триала.
 * Одна транзакция: advisory locks → проверка → trial_fingerprints → subscriptions.
 * Ничего не "подвисает" — либо всё записано, либо всё откачено.
 *
 * @param {string|null} fingerprint — SHA-256 хеш браузера (null для OAuth)
 * @param {string} ip — IP-адрес запроса
 * @param {string} userId
 * @returns {{ grant: boolean, reason: string, observation: object }}
 */
async function tryGrantTrial(fingerprint, ip, userId) {
  // Нет устойчивого device signal — нет автоматического пробного доступа.
  // Раньше null превращался в общую строку "none", исключённую из UNIQUE,
  // поэтому новые email/OAuth-аккаунты могли получать триал повторно.
  if (!fingerprint) {
    await db.query(
      "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'expired', now(), $2, NULL) ON CONFLICT DO NOTHING",
      [userId, ip]
    );
    return { grant: false, reason: 'fingerprint_missing', observation: null };
  }

  const client = await db.pool.connect();
  let observation = null;
  try {
    await client.query('BEGIN');

    // Advisory locks: сначала IP, потом fingerprint (фиксированный порядок → нет deadlock)
    await client.query("SELECT pg_advisory_xact_lock(hashtext('trial_ip:' || $1))", [ip]);
    if (fingerprint) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('trial_fp:' || $1))", [fingerprint]);
    }

    // IP is an observation signal, not a blocking identity. Shared family,
    // office and mobile-provider networks can legitimately contain many users.
    const networkResult = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS count_24h,
         COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS count_7d,
         COUNT(*) FILTER (WHERE created_at > now() - interval '90 days')::int AS count_90d
       FROM subscriptions
       WHERE registration_ip=$1`,
      [ip]
    );
    const networkRow = networkResult.rows[0] || {};
    const counts = {
      count24h: Number(networkRow.count_24h || 0) + 1,
      count7d: Number(networkRow.count_7d || 0) + 1,
      count90d: Number(networkRow.count_90d || 0) + 1
    };
    observation = { ...counts, level: classifyNetworkObservation(counts) };

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
        return { grant: false, reason: 'fingerprint_used', observation };
      }
    }

    // 2. Триал одобрен — записываем fingerprint + подписку в одной транзакции
    await client.query(
      'INSERT INTO trial_fingerprints (fingerprint, ip, user_id) VALUES ($1, $2, $3)',
      [fingerprint, ip, userId]
    );
    await client.query(
      "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'trial', now() + interval '" + TRIAL_DAYS + " days', $2, $3)",
      [userId, ip, fingerprint]
    );

    await client.query('COMMIT');
    return { grant: true, reason: 'ok', observation };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // UNIQUE-барьер на fingerprint сработал — штатный отказ, не 500
    if (e.code === '23505' && e.constraint && e.constraint.includes('trial_fp')) {
      await db.query(
        "INSERT INTO subscriptions (user_id, status, trial_ends_at, registration_ip, registration_fingerprint) VALUES ($1, 'expired', now(), $2, $3) ON CONFLICT DO NOTHING",
        [userId, ip, fingerprint]
      ).catch(() => {});
      return { grant: false, reason: 'fingerprint_used', observation };
    }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { tryGrantTrial, classifyNetworkObservation, NETWORK_THRESHOLDS };
