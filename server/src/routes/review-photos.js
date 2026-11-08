'use strict';
const { authenticate, optionalAuthenticate, requireAdmin } = require('../middleware');
const audit = require('../audit');
const storage = require('../review-photo-storage');
const { service, MAX_PHOTOS } = require('../review-photos');

module.exports = async function reviewPhotosRoutes(app, options = {}) {
  const photos = options.service || service();
  const enabled = options.enabled === undefined ? storage.enabled() : options.enabled;
  app.get('/content/review-photos/config', async (req,reply) => {
    reply.header('Cache-Control','no-store');
    return { enabled, maxPhotos: MAX_PHOTOS, maxInputBytes: storage.MAX_INPUT };
  });
  if (!enabled) return;
  await storage.prepare();
  let receiving = 0;
  app.setErrorHandler((error,req,reply) => {
    if (error.statusCode === 413) return reply.code(413).send({ error:'Выберите фото размером до 20 МБ.' });
    if (error.statusCode === 503) return reply.header('Retry-After','5').code(503).send({ error:error.message });
    throw error;
  });
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: storage.MAX_INPUT }, (req, body, done) => done(null,body));
  app.addHook('onResponse', async req => { req.releasePhotoAdmission?.(); });
  async function admission(req, reply) {
    await authenticate(req,reply);
    if (reply.sent) return;
    if (receiving >= 2) return reply.code(503).send({ error:'Сейчас загружается другое фото. Повторите через несколько секунд.' });
    receiving++; req.photoAdmission=true;
    req.releasePhotoAdmission=()=>{ if (req.photoAdmission) { receiving--; req.photoAdmission=false; } };
    req.raw.once('aborted',req.releasePhotoAdmission);
  }
  async function validId(req, reply) {
    if (!storage.UUID.test(req.params.id || '')) return reply.code(400).send({ error:'Некорректный адрес фото.' });
  }
  app.put('/content/reviews/:reviewId/photos/:requestId', {
    onRequest: [admission], bodyLimit: storage.MAX_INPUT,
    config: { rateLimit: { max: 30,timeWindow:'1 hour' } },
  }, async (req,reply) => {
    const reviewId=Number(req.params.reviewId);
    if (!Number.isSafeInteger(reviewId) || reviewId<1 || reviewId>2147483647 || !storage.UUID.test(req.params.requestId) || !storage.UUID.test(req.query.batchId || '')) return reply.code(400).send({ error:'Некорректная отправка фото.' });
    if (req.headers['content-type'] !== 'application/octet-stream') return reply.code(415).send({ error:'Неподдерживаемый формат отправки.' });
    const result=await photos.upload({ reviewId,userId:req.user.sub,requestId:req.params.requestId,batchId:req.query.batchId,input:req.body });
    return reply.code(result.repeated ? 200 : 201).send(result);
  });
  app.post('/content/reviews/:reviewId/photo-batches/:batchId/complete', { preHandler:[authenticate],config:{rateLimit:{max:30,timeWindow:'1 hour'}} }, async (req,reply) => {
    const id=Number(req.params.reviewId);
    if (!Number.isSafeInteger(id) || id<1 || id>2147483647 || !storage.UUID.test(req.params.batchId)) return reply.code(400).send({ error:'Некорректная отправка фото.' });
    await photos.completeBatch(id,req.user.sub,req.params.batchId);
    return { ok:true };
  });
  app.get('/content/review-photos', { preHandler:[optionalAuthenticate] }, async (req,reply) => {
    const text=String(req.query.reviewIds || '');
    if (!/^\d+(,\d+){0,99}$/.test(text)) return reply.code(400).send({ error:'Некорректный список отзывов.' });
    const ids=[...new Set(text.split(',').map(Number))];
    if (ids.some(id=>id<1 || id>2147483647)) return reply.code(400).send({ error:'Некорректный список отзывов.' });
    reply.header('Cache-Control','private, no-store');
    return { photos:await photos.list(ids,req.user?.sub) };
  });
  app.get('/content/review-photos/:id/:variant', { preHandler:[validId,optionalAuthenticate] }, async (req,reply) => {
    reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff');
    if (!['main','thumb'].includes(req.params.variant)) return reply.code(404).send({ error:'Фото не найдено.' });
    const image=await photos.image(req.params.id,req.params.variant,req.user?.sub);
    return reply.type('image/webp').send(image);
  });
  app.delete('/content/review-photos/:id', { preHandler:[authenticate,validId],config:{rateLimit:{max:30,timeWindow:'1 hour'}} }, async req => {
    await photos.remove(req.params.id,req.user.sub);
    return { ok:true };
  });
  app.get('/admin/review-photos', { preHandler:[requireAdmin] }, async (req,reply) => {
    const status=req.query.status || 'pending';
    if (!['pending','approved','rejected'].includes(status) || (req.query.after && !storage.UUID.test(req.query.after))) return reply.code(400).send({ error:'Некорректный фильтр.' });
    reply.header('Cache-Control','private, no-store');
    return photos.queue(status,req.query.after);
  });
  app.put('/admin/review-photos/:id', { preHandler:[requireAdmin,validId],config:{rateLimit:{max:120,timeWindow:'1 hour'}} }, async (req,reply) => {
    const { status,reason }=req.body || {};
    if (!['approved','rejected'].includes(status) || (reason!==undefined && (typeof reason!=='string' || reason.length>300))) return reply.code(400).send({ error:'Выберите решение и причину до 300 символов.' });
    const photo=await photos.moderate(req.params.id,req.user.sub,status,reason?.trim());
    await audit.log('review_photo_'+status,{userId:req.user.sub,detail:'photo#'+req.params.id,ip:req.ip});
    return { photo };
  });
  if (options.maintenance !== false) {
    let running=false, tick=0;
    const run=async()=>{
      if (running) return;
      running=true;
      try { await photos.notifications(); if (tick++ % 60===0) await photos.cleanup(); }
      catch(error) { app.log.error(error,'Review photo maintenance failed'); }
      finally { running=false; }
    };
    let timer;
    app.addHook('onReady',async()=>{ timer=setInterval(run,60000); timer.unref(); });
    app.addHook('onClose',async()=>clearInterval(timer));
  }
};
