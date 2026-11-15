'use strict';
const { randomUUID } = require('node:crypto');
const db = require('./db');
const email = require('./email');
const { authenticate } = require('./middleware');

// Both creation paths call this in the same transaction as the new message.
async function enqueue(client, type, id) {
  if (!['comment','reply'].includes(type)) throw new Error('Invalid reply type');
  const comment = type === 'comment';
  const result = await client.query(`INSERT INTO review_reply_notifications(user_id,review_id,${comment?'comment_id':'reply_id'},email_status)
    SELECT r.user_id,r.id,$1,CASE WHEN u.email_review_replies THEN 'pending' ELSE 'skipped' END
    FROM ${comment?'review_comments m JOIN reviews r ON r.id=m.review_id':'review_replies m JOIN reviews r ON r.id=m.review_id'}
    JOIN users u ON u.id=r.user_id JOIN recipes recipe ON recipe.id=r.recipe_id
    WHERE ${comment?'m.id':'m.review_id'}=$1 AND r.user_id<>${comment?'m.user_id':'m.admin_id'}
      AND u.notify_review_replies AND NOT u.is_blocked AND recipe.is_published
    ON CONFLICT (${comment?'comment_id':'reply_id'}) DO NOTHING RETURNING id`, [id]);
  return result.rows[0]?.id;
}

const visible = `FROM review_reply_notifications n
  JOIN users u ON u.id=n.user_id AND NOT u.is_blocked AND u.notify_review_replies
  JOIN reviews r ON r.id=n.review_id AND r.user_id=u.id
  JOIN recipes recipe ON recipe.id=r.recipe_id AND recipe.is_published
  LEFT JOIN review_comments c ON c.id=n.comment_id
  LEFT JOIN review_replies rp ON rp.review_id=n.reply_id
  JOIN users a ON a.id=COALESCE(c.user_id,rp.admin_id) AND NOT a.is_blocked`;
function positiveId(value) {
  return /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)<=2147483647;
}
function failureStatus(error) {
  // A lost connection after DATA may mean SMTP already accepted the message.
  // Keep ambiguous results for inspection instead of automatically duplicating mail.
  if (error.responseCode >= 400 && error.responseCode < 500) return 'pending';
  if (error.responseCode >= 500 && error.responseCode < 600) return 'failed';
  if (['EDNS','ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error.code) || error.command==='CONN') return 'pending';
  return 'uncertain';
}
function service({ database=db, mail=email, log=console }={}) {
  async function dispatch() {
    // A crashed worker may have sent mail: never resend an expired in-flight claim automatically.
    await database.query(`UPDATE review_reply_notifications SET email_status='uncertain',error_code='LEASE_EXPIRED'
      WHERE email_status='sending' AND lease_until<now()`);
    const lease=randomUUID();
    const due=await database.query(`WITH due AS (
      SELECT id FROM review_reply_notifications WHERE email_status='pending' AND due_at<=now()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10
    ) UPDATE review_reply_notifications n SET email_status='sending',lease_id=$1,
      lease_until=now()+interval '10 minutes',attempts=n.attempts+1 FROM due WHERE n.id=due.id RETURNING n.*`,[lease]);
    for (const item of due.rows) {
      let accepted=false;
      try {
        const found=await database.query(`SELECT u.email,u.display_name,n.review_id,recipe.id AS recipe_id,recipe.name AS recipe_name,
          r.text AS original_text,COALESCE(c.text,rp.text) AS reply_text,
          CASE WHEN n.reply_id IS NOT NULL THEN 'Юлия' ELSE COALESCE(NULLIF(trim(a.display_name),''),'Участник') END AS actor
          ${visible} WHERE n.id=$1 AND u.email_review_replies AND u.email IS NOT NULL`,[item.id]);
        const row=found.rows[0];
        if (!row) {
          await database.query(`UPDATE review_reply_notifications SET email_status='skipped',lease_until=NULL WHERE id=$1 AND lease_id=$2`,[item.id,lease]);
          continue;
        }
        const info=await mail.sendReviewDiscussionReply(row.email,row,item.id);
        accepted=true;
        await database.query(`UPDATE review_reply_notifications SET email_status='sent',sent_at=now(),lease_until=NULL,message_id=$3,error_code=NULL
          WHERE id=$1 AND lease_id=$2`,[item.id,lease,info?.messageId || null]);
      } catch(error) {
        const status=accepted?'uncertain':failureStatus(error);
        await database.query(`UPDATE review_reply_notifications SET email_status=$3,lease_until=NULL,error_code=$4,
          due_at=now()+make_interval(secs => LEAST(3600,60*power(2,LEAST(attempts,6)))::int)
          WHERE id=$1 AND lease_id=$2`,[item.id,lease,status==='pending' && item.attempts>=8?'failed':status,String(error.code || 'SEND_ERROR').slice(0,80)]);
        log.error({event:'review_reply_email_failed',notificationId:item.id,status,code:error.code || null});
      }
    }
  }
  return { dispatch };
}

function registerRoutes(app, options={}) {
  const worker=service({log:app.log});
  app.get('/auth/review-reply-settings',{preHandler:[authenticate]},async req=>{
    const result=await db.query('SELECT notify_review_replies AS enabled,email_review_replies AS email FROM users WHERE id=$1',[req.user.sub]);
    return result.rows[0];
  });
  app.put('/auth/review-reply-settings',{preHandler:[authenticate]},async(req,reply)=>{
    const {enabled,email:mail}=req.body || {};
    if(typeof enabled!=='boolean'||typeof mail!=='boolean')return reply.code(400).send({error:'Некорректные настройки уведомлений'});
    const client=await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET notify_review_replies=$2,email_review_replies=$3 WHERE id=$1',[req.user.sub,enabled,mail]);
      // Turning mail back on does not send messages accumulated while it was off.
      if(!enabled||!mail)await client.query(`UPDATE review_reply_notifications SET email_status='skipped' WHERE user_id=$1 AND email_status='pending'`,[req.user.sub]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK');throw error; }
    finally {client.release();}
    return {enabled,email:mail};
  });
  app.get('/content/review-reply-notifications',{preHandler:[authenticate]},async(req,reply)=>{
    const before=req.query.before;
    if(before!==undefined&&!positiveId(before))return reply.code(400).send({error:'Некорректная страница уведомлений'});
    const all=req.query.all==='1'&&req.query.unread==='true';
    const result=await db.query(`SELECT n.id,n.created_at,n.read_at,n.review_id,n.comment_id,n.reply_id,
      recipe.id AS recipe_id,recipe.name AS recipe_name,COALESCE(c.text,rp.text) AS text,
      CASE WHEN n.reply_id IS NOT NULL THEN 'Юлия' ELSE COALESCE(NULLIF(trim(a.display_name),''),'Участник') END AS actor
      ${visible} WHERE n.user_id=$1 AND ($2::bigint IS NULL OR n.id<$2)
      AND (NOT $3::boolean OR n.read_at IS NULL) ORDER BY n.id DESC${all?'':' LIMIT 21'}`,[req.user.sub,before || null,req.query.unread==='true']);
    return {items:all?result.rows:result.rows.slice(0,20),hasMore:!all&&result.rows.length>20};
  });
  app.post('/content/review-reply-notifications/read',{preHandler:[authenticate]},async(req,reply)=>{
    const ids=req.body?.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>!positiveId(id)))return reply.code(400).send({error:'Некорректный список уведомлений'});
    await db.query('UPDATE review_reply_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=ANY($2::bigint[])',[req.user.sub,[...new Set(ids.map(Number))]]);
    return {ok:true};
  });
  if(options.maintenance!==false) {
    let timer,running=false;
    const run=async()=>{if(running)return;running=true;try{await worker.dispatch();}catch(error){app.log.error(error,'Review reply dispatch failed');}finally{running=false;}};
    app.addHook('onReady',async()=>{timer=setInterval(run,30000);timer.unref();});
    app.addHook('onClose',async()=>clearInterval(timer));
  }
}
module.exports={enqueue,service,registerRoutes,failureStatus};
