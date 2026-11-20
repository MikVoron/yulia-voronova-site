const db = require('./db');

const REVIEW_BADGE_IDS = ['friend', 'cooks-with-us', 'shares-experience'];

function earnedReviewBadges(row) {
  const badges = [];
  if (row.review_friend_badge === true || row.early_access_member === true) badges.push('friend');
  if (row.has_published_photo === true) badges.push('cooks-with-us');
  if (Number(row.reviewed_recipes) >= 3) badges.push('shares-experience');
  return {
    badges,
    publicBadge: badges.includes(row.public_review_badge) ? row.public_review_badge : (badges[0] || null)
  };
}

async function getReviewBadges(userIds) {
  if (!userIds.length) return new Map();
  const result = await db.query(
    `SELECT u.id, u.review_friend_badge, u.early_access_member, u.public_review_badge,
            COUNT(DISTINCT recipe.id)::int AS reviewed_recipes,
            EXISTS (
              SELECT 1
              FROM review_photos photo
              JOIN reviews review ON review.id = photo.review_id AND review.user_id = photo.user_id
              JOIN recipes published ON published.id = review.recipe_id AND published.is_published = true
              WHERE photo.user_id = u.id AND photo.status = 'approved'
            ) AS has_published_photo
       FROM users u
       LEFT JOIN reviews review ON review.user_id = u.id
       LEFT JOIN recipes recipe ON recipe.id = review.recipe_id AND recipe.is_published = true
       WHERE u.id = ANY($1::uuid[])
       GROUP BY u.id`,
    [userIds]
  );
  return new Map(result.rows.map(row => [row.id, earnedReviewBadges(row)]));
}

module.exports = { REVIEW_BADGE_IDS, getReviewBadges };
