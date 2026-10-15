const db = require('../db');
const { generateSitemap } = require('../sitemap');

function createSitemapRoutes(database = db) {
  return async function sitemapRoutes(fastify) {
    fastify.get('/_seo/sitemap', async (_req, reply) => {
      const { xml } = await generateSitemap(database);
      return reply
        .header('Cache-Control', 'no-cache')
        .type('application/xml; charset=utf-8')
        .send(xml);
    });
  };
}

module.exports = createSitemapRoutes();
module.exports.createSitemapRoutes = createSitemapRoutes;
