const { findPublicationLinks } = require('./blog-dzen-sync');

const CHANNEL_ID = '-232523704';
const CHANNEL_URL = `https://vk.ru/im/channels/${CHANNEL_ID}`;

function canonicalVkChannelUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || !['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com'].includes(url.hostname)
            || url.username || url.password || url.port
            || ![`/im/channels/${CHANNEL_ID}`, `/mail/channels/${CHANNEL_ID}`].includes(url.pathname)) return null;
        const ids = url.searchParams.getAll('cmid');
        if (ids.length !== 1 || !/^[1-9]\d{0,14}$/.test(ids[0])) return null;
        return `${CHANNEL_URL}?cmid=${ids[0]}`;
    } catch {
        return null;
    }
}

function findVkLinks(posts, publications, existing = {}) {
    return findPublicationLinks(posts, publications, existing, canonicalVkChannelUrl, 'VK');
}

module.exports = { CHANNEL_ID, CHANNEL_URL, canonicalVkChannelUrl, findVkLinks };
