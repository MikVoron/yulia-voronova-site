// Keep this order stable: positions are persisted per reviewer, never per recipe.
const REVIEW_AVATAR_PACK = Object.freeze([
  'avocado', 'spinach', 'chickpea', 'lentils', 'oatmeal', 'grain',
  'tomato', 'broccoli', 'salmon', 'egg', 'berries', 'yogurt',
  'buckwheat', 'hummus', 'toast',
]);

function reviewAvatar(row) {
  // A personal avatar always wins, including for a user without a display name.
  if (row.avatar) return row.avatar;
  if (row.display_name?.trim()) return null;
  const position = String(row.review_avatar_position ?? '');
  if (!/^\d+$/.test(position)) return null;
  const icon = REVIEW_AVATAR_PACK[Number(BigInt(position) % BigInt(REVIEW_AVATAR_PACK.length))];
  return 'https://app.voronova.online/images/review-avatars/' + icon + '.svg';
}

// Caller owns the transaction. User lock makes repeated/concurrent reviews of
// one user reuse their position; the transactional counter serializes new users.
async function assignReviewAvatar(client, userId) {
  const user = await client.query(
    'SELECT display_name FROM users WHERE id=$1 FOR NO KEY UPDATE', [userId]
  );
  if (!user.rows.length || user.rows[0].display_name?.trim()) return;
  const existing = await client.query(
    'SELECT position FROM review_avatar_assignments WHERE user_id=$1', [userId]
  );
  if (existing.rows.length) return;
  const counter = await client.query(
    `UPDATE review_avatar_counter SET next_position=next_position+1
     WHERE id=1 RETURNING next_position-1 AS position`
  );
  if (!counter.rows.length) throw new Error('Review avatar counter is missing');
  await client.query(
    'INSERT INTO review_avatar_assignments (user_id, position) VALUES ($1, $2)',
    [userId, counter.rows[0].position]
  );
}

module.exports = { REVIEW_AVATAR_PACK, reviewAvatar, assignReviewAvatar };
