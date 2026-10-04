const fs = require('node:fs');
const path = require('node:path');
const { findVkLinks } = require('./blog-vk-links');

const LINKS_FILE = path.join(__dirname, '..', 'data', 'blog-vk-links.json');

async function syncVkLinks(posts, options = {}) {
    const linksFile = options.linksFile || LINKS_FILE;
    const logger = options.logger || console;
    try {
        const existing = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            throw new Error('VK_LINKS_INVALID');
        }
        const pending = posts.filter(post => !Object.hasOwn(existing, String(post.postNumber)));
        if (!pending.length) return { additions: {}, warnings: [] };
        const fetchPublications = options.fetchPublications || require('./blog-vk-reader').fetchVkPublications;
        const publications = await fetchPublications(pending);
        const result = findVkLinks(posts, publications, existing);
        result.warnings.forEach(message => logger.warn(`[VK] ${message}`));
        if (Object.keys(result.additions).length) {
            const temporary = `${linksFile}.tmp`;
            fs.writeFileSync(temporary, `${JSON.stringify({ ...existing, ...result.additions }, null, '\t')}\n`, 'utf8');
            fs.renameSync(temporary, linksFile);
        }
        logger.log(`[VK] ${publications.length} channel publications read; ${Object.keys(result.additions).length} new links.`);
        return result;
    } catch (error) {
        // Browser errors can include account URLs or request details. Report
        // only controlled codes; never log raw errors from an authenticated reader.
        const code = /^VK_[A-Z_]+$/.test(error.message) ? error.message : 'VK_CHANNEL_READ_FAILED';
        logger.warn(`[VK] Sync failed: ${code}. Existing links preserved; Telegram update continues.`);
        return { additions: {}, warnings: [code], failed: true };
    }
}

module.exports = { syncVkLinks };
