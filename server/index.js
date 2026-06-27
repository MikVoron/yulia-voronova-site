require('dotenv').config();
const fastify = require('fastify')({ logger: true, trustProxy: '127.0.0.1,::1', bodyLimit: 8 * 1024 * 1024 });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const helmet = require('@fastify/helmet');
const rateLimit = require('@fastify/rate-limit');
const authRoutes = require('./src/routes/auth');
const subscriptionRoutes = require('./src/routes/subscriptions');
const adminRoutes = require('./src/routes/admin');
const oauthRoutes = require('./src/routes/oauth');
const contentRoutes = require('./src/routes/content');
const favoritesRoutes = require('./src/routes/favorites');
const notesRoutes = require('./src/routes/notes');
const plateRoutes = require('./src/routes/plate');
const aiRoutes = require('./src/routes/ai');
const nutritionRoutes = require('./src/routes/nutrition');
const { startCron } = require('./src/cron');
const { sendTelegramAlert, startTelegramBot } = require('./src/telegram');

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = ['https://voronova.online', 'https://www.voronova.online', 'https://app.voronova.online'];
if (!isProd) corsOrigins.push('http://127.0.0.1:5500', 'http://localhost:5500');

fastify.register(cors, {
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
});
fastify.register(cookie);

// Security headers
fastify.register(helmet, {
  contentSecurityPolicy: false,   // CSP управляется на уровне HTML/nginx
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: false,                    // nginx owns shared transport/security headers
  noSniff: false,
  referrerPolicy: false
});

// Global rate limit: 100 req/min per IP
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip
});
fastify.register(authRoutes);
fastify.register(subscriptionRoutes);
fastify.register(adminRoutes);
fastify.register(oauthRoutes);
fastify.register(contentRoutes);
fastify.register(favoritesRoutes);
fastify.register(notesRoutes);
fastify.register(plateRoutes);
fastify.register(aiRoutes);
fastify.register(nutritionRoutes);

const db = require('./src/db');

fastify.get('/health', async () => {
  const checks = { status: 'ok', time: new Date().toISOString() };
  try {
    const result = await db.query('SELECT 1 AS ok');
    checks.db = result.rows[0].ok === 1 ? 'ok' : 'error';
  } catch (e) {
    checks.db = 'error';
    checks.status = 'degraded';
    fastify.log.error(e, 'Health check: DB unreachable');
    sendTelegramAlert(`Health check: DB unreachable\n${e.message}`, {
      key: 'health-db-unreachable',
      title: 'SmartPlate health degraded',
      fastify
    });
  }
  return checks;
});

// Unified error handler: consistent { error, statusCode } format + log 500s
fastify.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  if (status >= 500) {
    fastify.log.error(err, `Unhandled error on ${req.method} ${req.url}`);
    sendTelegramAlert(
      `${req.method} ${req.url}\nstatus: ${status}\n${err.stack || err.message}`,
      {
        key: `http-${status}-${req.method}-${req.url}`,
        title: 'SmartPlate API error',
        fastify
      }
    );
  }
  reply.status(status).send({
    error: status >= 500 ? 'Внутренняя ошибка сервера' : (err.message || 'Ошибка'),
    statusCode: status
  });
});

fastify.listen({ port: process.env.PORT || 3000, host: process.env.HOST || '127.0.0.1' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  startTelegramBot(fastify);
  startCron(fastify);
});
