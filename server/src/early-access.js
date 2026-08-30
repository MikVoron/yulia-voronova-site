const db = require('./db');

const EARLY_ACCESS_LIMIT = 10;
const EARLY_ACCESS_PRICES = { 1: 190, 3: 540, 12: 1900 };
const REGULAR_PRICES = { 1: 250, 3: 690, 12: 2500 };
const EARLY_ACCESS_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

async function getEarlyAccessState(userId, query = db.query) {
  const [membersResult, adjustmentResult] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM users WHERE early_access_member=true AND role != 'admin'"),
    query('SELECT COALESCE(SUM(slots_delta), 0)::int AS count FROM early_access_adjustments')
  ]);
  const confirmedMembers = Number(membersResult.rows[0]?.count || 0);
  const manualReserved = Number(adjustmentResult.rows[0]?.count || 0);
  const remaining = Math.max(0, EARLY_ACCESS_LIMIT - confirmedMembers - manualReserved);
  let earlyMember = false;
  let renewalEligible = false;
  if (userId) {
    const userResult = await query(
      `SELECT u.early_access_member, s.active_until
         FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id
        WHERE u.id=$1`, [userId]
    );
    const user = userResult.rows[0];
    earlyMember = user?.early_access_member === true;
    renewalEligible = earlyMember && user?.active_until &&
      new Date(user.active_until).getTime() + EARLY_ACCESS_GRACE_MS >= Date.now();
  }
  const eligible = renewalEligible || (!earlyMember && remaining > 0);
  return {
    active: remaining > 0,
    eligible,
    eligibility: renewalEligible ? 'renewal' : (!earlyMember && remaining > 0 ? 'first_purchase' : 'standard'),
    remaining,
    limit: EARLY_ACCESS_LIMIT,
    confirmedMembers,
    manualReserved,
    isEarlyBird: earlyMember,
    prices: eligible ? EARLY_ACCESS_PRICES : REGULAR_PRICES,
    earlyPrices: EARLY_ACCESS_PRICES,
    regularPrices: REGULAR_PRICES
  };
}

module.exports = { EARLY_ACCESS_LIMIT, EARLY_ACCESS_PRICES, REGULAR_PRICES, EARLY_ACCESS_GRACE_MS, getEarlyAccessState };
