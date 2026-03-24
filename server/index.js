require('dotenv').config();
const fastify = require('fastify')({ logger: true, bodyLimit: 8 * 1024 * 1024 });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const authRoutes = require('./src/routes/auth');
const subscriptionRoutes = require('./src/routes/subscriptions');
const adminRoutes = require('./src/routes/admin');
const oauthRoutes = require('./src/routes/oauth');
const contentRoutes = require('./src/routes/content');
const { startCron } = require('./src/cron');

fastify.register(cors, {
  origin: ['https://voronova.online', 'https://www.voronova.online', 'http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true
});
fastify.register(cookie);
fastify.register(authRoutes);
fastify.register(subscriptionRoutes);
fastify.register(adminRoutes);
fastify.register(oauthRoutes);
fastify.register(contentRoutes);

fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  startCron(fastify);
});
