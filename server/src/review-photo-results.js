'use strict';
const { createHash, randomUUID } = require('node:crypto');
const db = require('./db');
const email = require('./email');

function summary(photos) {
  const approved = photos.filter(p => p.status === 'approved').length;
  const rejected = photos.filter(p => p.status === 'rejected');
  const title = rejected.length ? (approved ? `${approved===1?'Опубликовано':'Опубликованы'} ${approved} из ${photos.length} ваших фото` : 'Результат проверки ваших фото') : 'Ваши фото опубликованы';
  const reasons = [...new Set(rejected.map(p => p.reason).filter(Boolean))];
  return { approved, total: photos.length, reasons, title };
}

// Called inside the decision transaction, with the batch advisory lock held.
// No historical backfill: an event is created only after a new decision/removal.
async function enqueue(client, userId, batchId) {
  const { rows } = await client.query(`SELECT id,review_id,status,reason,moderated_at FROM review_photos
    WHERE user_id=$1 AND batch_id=$2 AND status<>'deleted' ORDER BY id`, [userId,batchId]);
  if (!rows.length || rows.some(p => p.status === 'pending') || !rows[0].review_id) return null;
  const photos = rows.map(p => ({ id:p.id, status:p.status, reason:p.reason, moderatedAt:p.moderated_at }));
  const key = createHash('sha256').update(JSON.stringify(photos)).digest('hex');
  // Replace a queued result if the moderator changes the decision before mail is sent.
  await client.query(`UPDATE review_photo_results SET superseded=true
    WHERE user_id=$1 AND batch_id=$2 AND decision_key<>$3`, [userId,batchId,key]);
  const result = await client.query(`INSERT INTO review_photo_results(user_id,review_id,batch_id,decision_key,photos)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT(decision_key) DO UPDATE SET superseded=false RETURNING id`, [userId,rows[0].review_id,batchId,key,JSON.stringify(photos)]);
  return result.rows[0]?.id || null;
}

function service({ database=db, mail=email }={}) {
  async function notifications(onlyIds=null) {
    const lease=randomUUID();
    const due=await database.query(`WITH due AS (
      SELECT id FROM review_photo_results WHERE sent_at IS NULL AND skipped_at IS NULL AND NOT superseded
      AND due_at<=now() AND ($2::bigint[] IS NULL OR id=ANY($2::bigint[]))
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10
    ) UPDATE review_photo_results n SET lease_id=$1,lease_until=now()+interval '10 minutes',attempts=n.attempts+1
      FROM due WHERE n.id=due.id RETURNING n.*`, [lease,onlyIds]);
    for (const item of due.rows) {
      try {
        const found=await database.query(`SELECT u.email,u.is_blocked,r.recipe_id,recipe.name AS recipe_name,recipe.is_published
          FROM users u JOIN reviews r ON r.id=$2 AND r.user_id=u.id JOIN recipes recipe ON recipe.id=r.recipe_id
          JOIN review_photo_results n ON n.id=$3 AND NOT n.superseded
          WHERE u.id=$1`, [item.user_id,item.review_id,item.id]);
        const user=found.rows[0];
        if (!user || user.is_blocked || !user.email || !user.is_published) {
          await database.query('UPDATE review_photo_results SET skipped_at=now(),lease_until=NULL WHERE id=$1 AND lease_id=$2',[item.id,lease]);
          continue;
        }
        const info=await mail.sendReviewPhotoResult(user.email,user.recipe_name,user.recipe_id,item.review_id,item.photos,item.decision_key);
        await database.query(`UPDATE review_photo_results SET sent_at=now(),lease_until=NULL,message_id=$3
          WHERE id=$1 AND lease_id=$2`,[item.id,lease,info?.messageId || null]);
      } catch (error) {
        await database.query(`UPDATE review_photo_results SET lease_until=NULL,due_at=now()+interval '15 minutes'
          WHERE id=$1 AND lease_id=$2`,[item.id,lease]);
        // Continue with other recipients even when one address fails.
        console.error(JSON.stringify({event:'review_photo_result_failed',notificationId:item.id,code:error.code || null}));
      }
    }
  }
  async function list(userId) {
    const result=await database.query(`SELECT n.id,n.created_at,n.photos,n.review_id,r.recipe_id,recipe.name AS recipe_name
      FROM review_photo_results n JOIN reviews r ON r.id=n.review_id
      JOIN recipes recipe ON recipe.id=r.recipe_id AND recipe.is_published
      WHERE n.user_id=$1 AND n.read_at IS NULL AND NOT n.superseded ORDER BY n.id DESC`,[userId]);
    return result.rows.map(({photos,...row})=>({...row,...summary(photos)}));
  }
  async function read(userId,ids) {
    await database.query('UPDATE review_photo_results SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=ANY($2::bigint[])',[userId,ids]);
  }
  return {notifications,list,read};
}
module.exports={enqueue,service,summary};
