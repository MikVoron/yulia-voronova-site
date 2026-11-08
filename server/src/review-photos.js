'use strict';
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('./db');
const storage = require('./review-photo-storage');
const email = require('./email');

const LOCK = 81743043;
const MAX_PHOTOS = 3;
const DAILY_LIMIT = 12;
const STORAGE_LIMIT = 2 * 1024 * 1024 * 1024;
function fail(statusCode, message) { throw Object.assign(new Error(message), { statusCode }); }
function photo(row) {
  return { id: row.id, reviewId: row.review_id, status: row.status, width: row.width, height: row.height,
    createdAt: row.created_at, reason: row.reason || null,
    url: '/content/review-photos/' + row.id + '/main', thumbnail: '/content/review-photos/' + row.id + '/thumb' };
}
function service({ database = db, files = storage, mail = email } = {}) {
  let orphanOffset = 0;
  async function upload({ reviewId, userId, requestId, batchId, input }) {
    if (!Buffer.isBuffer(input) || !input.length || input.length > storage.MAX_INPUT) fail(413, 'Выберите фото размером до 20 МБ.');
    const digest = createHash('sha256').update(input).digest('hex');
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      // Serializes disk quota, daily quota and the 3-photo cap across API workers.
      // try-lock avoids tying up a pool of requests behind expensive conversions.
      const lock = await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [LOCK]);
      if (!lock.rows[0].locked) fail(503, 'Сейчас обрабатывается другое фото. Нажмите «Повторить» через несколько секунд.');
      const review = await client.query(`SELECT r.id FROM reviews r JOIN users u ON u.id=r.user_id
        JOIN recipes recipe ON recipe.id=r.recipe_id
        WHERE r.id=$1 AND r.user_id=$2 AND NOT u.is_blocked AND recipe.is_published=true FOR UPDATE OF r`, [reviewId, userId]);
      if (!review.rows.length) fail(404, 'Ваш отзыв не найден. Обновите страницу.');
      const existing = await client.query('SELECT * FROM review_photos WHERE user_id=$1 AND request_id=$2', [userId, requestId]);
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (row.review_id !== reviewId || row.input_sha256 !== digest || row.batch_id !== batchId) fail(409, 'Эта отправка уже использована для другого фото.');
        await client.query('COMMIT');
        return { photo: photo(row), repeated: true };
      }
      const batch = await client.query('SELECT review_id,sent_at FROM review_photo_notifications WHERE user_id=$1 AND batch_id=$2', [userId,batchId]);
      if (batch.rows.length && batch.rows[0].review_id !== reviewId) fail(409, 'Эта отправка уже использована для другого отзыва.');
      const counts = await client.query(`SELECT
        (SELECT COUNT(*)::int FROM review_photos WHERE review_id=$1 AND status IN ('pending','approved')) AS active,
        (SELECT COUNT(*)::int FROM review_photos WHERE user_id=$2 AND created_at > now()-interval '24 hours') AS daily,
        (SELECT COALESCE(SUM(bytes),0)::bigint FROM review_photos WHERE files_deleted_at IS NULL) AS stored`, [reviewId,userId]);
      const count = counts.rows[0];
      if (count.active >= MAX_PHOTOS) fail(409, 'К одному рецепту можно добавить не больше 3 фото. Сначала уберите лишнее.');
      if (count.daily >= DAILY_LIMIT) fail(429, 'За сутки можно отправить до 12 фото. Попробуйте завтра.');
      if (Number(count.stored) + 2 * 1024 * 1024 > STORAGE_LIMIT || !await files.hasSpace()) fail(503, 'Загрузка фото временно недоступна. Попробуйте позже.');
      const processed = await files.processImage(input);
      const id = randomUUID();
      await files.write(id, processed);
      const saved = await client.query(`INSERT INTO review_photos
        (id,review_id,user_id,request_id,batch_id,input_sha256,width,height,bytes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id,reviewId,userId,requestId,batchId,digest,processed.width,processed.height,processed.bytes]);
      await client.query(`INSERT INTO review_photo_notifications (user_id,batch_id,review_id)
        VALUES ($1,$2,$3) ON CONFLICT (user_id,batch_id) DO UPDATE SET due_at=now()+interval '15 minutes'
        WHERE review_photo_notifications.sent_at IS NULL`, [userId,batchId,reviewId]);
      await client.query('COMMIT');
      return { photo: photo(saved.rows[0]), repeated: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      // Do not remove a file after an uncertain COMMIT response. The orphan
      // sweeper safely removes unreferenced files after a 24h grace period.
      throw error;
    } finally { client.release(); }
  }

  async function list(reviewIds, userId) {
    const result = await database.query(`SELECT p.* FROM review_photos p
      JOIN reviews r ON r.id=p.review_id JOIN recipes recipe ON recipe.id=r.recipe_id
      WHERE p.review_id=ANY($1::int[]) AND recipe.is_published=true AND p.status <> 'deleted'
        AND (p.status='approved' OR p.user_id=$2::uuid)
      ORDER BY p.created_at,p.id`, [reviewIds,userId || null]);
    return result.rows.map(photo);
  }
  async function image(id, variant, userId) {
    const result = await database.query(`SELECT p.* FROM review_photos p
      JOIN reviews r ON r.id=p.review_id JOIN recipes recipe ON recipe.id=r.recipe_id
      WHERE p.id=$1 AND p.status IN ('pending','approved') AND p.files_deleted_at IS NULL
        AND ((p.status='approved' AND recipe.is_published=true) OR p.user_id=$2::uuid
          OR EXISTS(SELECT 1 FROM users WHERE id=$2::uuid AND role='admin' AND NOT is_blocked))`, [id,userId || null]);
    if (!result.rows.length) fail(404, 'Фото не найдено.');
    try { return await files.read(id,variant); }
    catch (error) { if (error.code === 'ENOENT') fail(404,'Фото не найдено.'); throw error; }
  }
  async function remove(id, userId) {
    const result = await database.query(`UPDATE review_photos SET status='deleted',reason=NULL
      WHERE id=$1 AND user_id=$2 RETURNING id`, [id,userId]);
    if (!result.rows.length) fail(404,'Фото не найдено.');
    // Visibility is removed atomically before touching files. Cleanup retries
    // a failed unlink independently; a deleted URL cannot keep serving content.
    await erase(id).catch(() => {});
  }
  async function erase(id) {
    await files.remove(id);
    await database.query('UPDATE review_photos SET files_deleted_at=now() WHERE id=$1', [id]);
  }
  async function moderate(id, adminId, status, reason) {
    const result = await database.query(`UPDATE review_photos SET status=$3,reason=$4,moderated_by=$2,moderated_at=now()
      WHERE id=$1 AND review_id IS NOT NULL AND files_deleted_at IS NULL
        AND (status='pending' OR (status='approved' AND $3='rejected')) RETURNING *`, [id,adminId,status,status === 'rejected' ? reason || null : null]);
    if (!result.rows.length) fail(409,'Фото уже проверено или удалено. Обновите список.');
    if (status === 'rejected') await erase(id).catch(() => {});
    return photo(result.rows[0]);
  }
  async function queue(status, after) {
    const rows = await database.query(`SELECT p.*, u.display_name AS author, recipe.name AS recipe_name, r.recipe_id
      FROM review_photos p JOIN users u ON u.id=p.user_id
      JOIN reviews r ON r.id=p.review_id JOIN recipes recipe ON recipe.id=r.recipe_id
      WHERE p.status=$1 AND ($2::uuid IS NULL OR (p.created_at,p.id) < (SELECT created_at,id FROM review_photos WHERE id=$2::uuid))
      ORDER BY p.created_at DESC,p.id DESC LIMIT 31`, [status,after || null]);
    const count = await database.query("SELECT COUNT(*)::int AS count FROM review_photos WHERE status='pending' AND review_id IS NOT NULL");
    return { photos: rows.rows.slice(0,30).map(row => ({ ...photo(row), author: row.author || 'Пользователь', recipeName: row.recipe_name, recipeId: row.recipe_id })),
      pendingCount: count.rows[0].count, next: rows.rows.length > 30 ? rows.rows[29].id : null };
  }
  async function notifications() {
    const lease = randomUUID();
    const due = await database.query(`WITH due AS (
      SELECT user_id,batch_id FROM review_photo_notifications
      WHERE sent_at IS NULL AND due_at<=now() AND (lease_until IS NULL OR lease_until<now())
      ORDER BY due_at FOR UPDATE SKIP LOCKED LIMIT 10
    ) UPDATE review_photo_notifications n SET lease_id=$1,lease_until=now()+interval '10 minutes',attempts=n.attempts+1
      FROM due WHERE n.user_id=due.user_id AND n.batch_id=due.batch_id RETURNING n.*`, [lease]);
    for (const item of due.rows) {
      try {
        const summary = await database.query(`SELECT COUNT(*)::int AS count, MAX(u.display_name) AS author, MAX(recipe.name) AS recipe_name
          FROM review_photos p JOIN users u ON u.id=p.user_id JOIN reviews r ON r.id=p.review_id JOIN recipes recipe ON recipe.id=r.recipe_id
          WHERE p.user_id=$1 AND p.batch_id=$2 AND p.status='pending'`, [item.user_id,item.batch_id]);
        const data = summary.rows[0];
        if (data.count) await mail.sendReviewPhotoNotification(data.author || 'Пользователь', data.recipe_name, data.count);
        await database.query('UPDATE review_photo_notifications SET sent_at=now(),lease_until=NULL WHERE user_id=$1 AND batch_id=$2 AND lease_id=$3', [item.user_id,item.batch_id,lease]);
      } catch (error) {
        await database.query("UPDATE review_photo_notifications SET lease_until=NULL,due_at=now()+interval '15 minutes' WHERE user_id=$1 AND batch_id=$2 AND lease_id=$3", [item.user_id,item.batch_id,lease]);
        throw error;
      }
    }
  }
  async function completeBatch(reviewId,userId,batchId) {
    await database.query('UPDATE review_photo_notifications SET due_at=now() WHERE review_id=$1 AND user_id=$2 AND batch_id=$3 AND sent_at IS NULL', [reviewId,userId,batchId]);
  }
  async function cleanup() {
    const rows = await database.query(`SELECT id FROM review_photos WHERE files_deleted_at IS NULL
      AND (status IN ('deleted','rejected') OR review_id IS NULL) LIMIT 100`);
    for (const row of rows.rows) await erase(row.id);
    // User deletion cascades metadata. Also covers crashes between disk write
    // and transaction commit. Never traverse arbitrary names or symlinks.
    const dir = await fs.opendir(files.root());
    let visited = 0, checked = 0, exhausted = true;
    for await (const entry of dir) {
      if (!entry.isDirectory() || !storage.UUID.test(entry.name)) continue;
      if (++visited <= orphanOffset) continue;
      const stat = await fs.lstat(path.join(files.root(),entry.name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (stat && Date.now()-stat.mtimeMs >= 24*60*60*1000) {
        const exists = await database.query('SELECT id FROM review_photos WHERE id=$1', [entry.name]);
        if (!exists.rows.length) await files.remove(entry.name);
      }
      if (++checked >= 1000) { orphanOffset=visited; exhausted=false; break; }
    }
    if (exhausted) orphanOffset=0;
    await database.query("DELETE FROM review_photos WHERE files_deleted_at < now()-interval '30 days'");
    await database.query("DELETE FROM review_photo_notifications WHERE sent_at < now()-interval '30 days'");
  }
  return { upload,list,image,remove,moderate,queue,notifications,completeBatch,cleanup };
}
module.exports = { service, photo, MAX_PHOTOS, DAILY_LIMIT, STORAGE_LIMIT };
