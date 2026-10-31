const db = require('./db');

function accountError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Link identities to the same user; never rewrite their profile or subscription.
async function resolveOAuthAccount(provider, providerId, email, displayName, emailVerified) {
  email = typeof email === 'string' ? email.trim().toLowerCase() : null;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // Parallel callbacks for this identity must not create two users or trials.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['oauth:' + provider + ':' + providerId]);
    const existing = await client.query(
      'SELECT u.* FROM auth_accounts aa JOIN users u ON u.id=aa.user_id WHERE aa.provider=$1 AND aa.provider_id=$2',
      [provider, providerId]
    );
    if (existing.rows.length) {
      await client.query('COMMIT');
      return { user: existing.rows[0], isNew: false };
    }
    if (!emailVerified || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw accountError('OAUTH_EMAIL_REQUIRED');
    }
    // Different OAuth providers with the same email also share one account.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['oauth-email:' + email]);
    let byEmail = await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
    let user = byEmail.rows[0];
    let isNew = false;
    if (!user) {
      const inserted = await client.query(
        'INSERT INTO users (email, display_name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING *',
        [email, displayName || null]
      );
      user = inserted.rows[0];
      isNew = Boolean(user);
      // Email-code registration can concurrently insert the same email.
      if (!user) {
        byEmail = await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
        user = byEmail.rows[0];
      }
    }
    if (!user) throw accountError('OAUTH_ACCOUNT_UNAVAILABLE');
    if (user.is_blocked) throw accountError('OAUTH_ACCOUNT_BLOCKED');
    if (user.role === 'admin') throw accountError('ADMIN_OAUTH_LINK_DENIED');
    await client.query(
      'INSERT INTO auth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)',
      [user.id, provider, providerId]
    );
    await client.query('COMMIT');
    return { user, isNew };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { resolveOAuthAccount };
