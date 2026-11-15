'use strict';
// Run only by the guarded installer as the API user, with the private .env
// loaded there. Never print an address, credential or the original review text.
const {createRequire}=require('node:module');
const root='/var/www/smartplate-api';
const requireApi=createRequire(root+'/index.js');
requireApi('dotenv').config({path:root+'/.env',quiet:true});
const db=requireApi('./src/db');
const mode=process.argv[2],date=process.argv[3];
if (!['inspect','send'].includes(mode) || date!=='2026-11-15') throw Error('Unexpected authorized scope');
async function main(){
  const {rows}=await db.query(`SELECT DISTINCT u.id,u.display_name,u.email,p.batch_id,p.review_id
    FROM review_photos p JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND NOT u.is_blocked
      AND (p.moderated_at AT TIME ZONE 'Europe/Belgrade')::date=$1::date`,[date]);
  const candidates=rows.filter(r=>/^(женя|евгения)(\s|$)/u.test(String(r.display_name || '').trim().toLocaleLowerCase('ru')));
  const users=[...new Set(candidates.map(r=>r.id))];
  if(users.length!==1)throw Error('Expected exactly one Женя/Евгения with approved photos on '+date+'; found '+users.length+'. No email sent.');
  const userId=users[0],batches=[...new Set(candidates.map(r=>r.batch_id))];
  const details=await db.query(`SELECT p.id,p.status,p.batch_id,p.review_id,p.moderated_at,recipe.id AS recipe_id,recipe.name AS recipe_name
    FROM review_photos p JOIN reviews r ON r.id=p.review_id AND r.user_id=p.user_id
    JOIN recipes recipe ON recipe.id=r.recipe_id AND recipe.is_published
    WHERE p.user_id=$1 AND p.batch_id=ANY($2::uuid[]) AND p.status<>'deleted' ORDER BY p.id`,[userId,batches]);
  if(!details.rows.length || details.rows.some(p=>p.status!=='approved'))throw Error('The selected batches are not entirely approved. No email sent.');
  const report={marker:'ZHENYA_APPROVED_PHOTOS_FOUND',date,name:candidates[0].display_name,photos:details.rows.length,
    recipes:[...new Set(details.rows.map(p=>p.recipe_name))],batches:batches.length};
  console.log(JSON.stringify(report));
  if(mode==='inspect')return;
  const {enqueue,service}=requireApi('./src/review-photo-results');
  const client=await db.pool.connect();
  try{
    await client.query('BEGIN');
    for(const batch of batches){
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['photo-result:'+userId+':'+batch]);
      // Recheck under the same lock used by moderation, before queuing mail.
      const active=await client.query("SELECT status FROM review_photos WHERE user_id=$1 AND batch_id=$2 AND status<>'deleted'",[userId,batch]);
      if(!active.rows.length || active.rows.some(p=>p.status!=='approved'))throw Error('Photo decisions changed. No email queued.');
      await enqueue(client,userId,batch);
    }
    await client.query(`UPDATE review_photo_results SET due_at=now()
      WHERE user_id=$1 AND batch_id=ANY($2::uuid[]) AND sent_at IS NULL AND NOT superseded`,[userId,batches]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const selected=await db.query(`SELECT id FROM review_photo_results
    WHERE user_id=$1 AND batch_id=ANY($2::uuid[]) AND NOT superseded`,[userId,batches]);
  await service().notifications(selected.rows.map(r=>r.id));
  const sent=await db.query(`SELECT id,sent_at,message_id FROM review_photo_results
    WHERE user_id=$1 AND batch_id=ANY($2::uuid[]) AND NOT superseded ORDER BY id`,[userId,batches]);
  if(sent.rows.length!==batches.length || sent.rows.some(r=>!r.sent_at))throw Error('SMTP acceptance is not confirmed for every selected batch; inspect the durable queue before retrying.');
  console.log(JSON.stringify({marker:'ZHENYA_PHOTO_EMAIL_SMTP_ACCEPTED',notifications:sent.rows.map(r=>({id:r.id,sentAt:r.sent_at,messageId:r.message_id}))}));
}
main().catch(error=>{console.error(JSON.stringify({marker:'ZHENYA_PHOTO_EMAIL_STOPPED',message:error.message}));process.exitCode=1;}).finally(()=>db.pool.end());
