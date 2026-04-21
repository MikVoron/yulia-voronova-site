const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CHANNEL = 'voronova_nutrition';
const BLOG_FILE = path.join(__dirname, '..', 'blog.html');
const SITEMAP_FILE = path.join(__dirname, '..', 'sitemap.xml');
const BLOG_IMAGES_DIR = path.join(__dirname, '..', 'images', 'blog');
const VK_LINKS_FILE = path.join(__dirname, '..', 'data', 'blog-vk-links.json');
const MAX_POSTS = 6;
const TELEGRAM_SERVICE_POST_PATTERNS = [
    /^Channel name was changed to\b/i,
    /^Channel photo updated\b/i,
    /^Channel description changed\b/i,
    /^Channel username changed\b/i
];

function loadVkLinks() {
    try {
        return JSON.parse(fs.readFileSync(VK_LINKS_FILE, 'utf8'));
    } catch (e) {
        return {};
    }
}

function isPublishablePost(plainText) {
    return !TELEGRAM_SERVICE_POST_PATTERNS.some((pattern) => pattern.test(plainText));
}

const PREVIEW_LENGTH = 200;
const RANDOM_PICS = [
    'images/blog/random-pic-blog-1.webp',
    'images/blog/random-pic-blog-2.webp',
    'images/blog/random-pic-blog-3.webp',
    'images/blog/random-pic-blog-4.webp',
    'images/blog/random-pic-blog-5..webp',
];

async function downloadImage(url, postNumber) {
    const filename = `post-${postNumber}.webp`;
    const filepath = path.join(BLOG_IMAGES_DIR, filename);

    // Always re-download to pick up edits to the post image
    if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        await sharp(buffer).webp({ quality: 82 }).toFile(filepath);
        const meta = await sharp(filepath).metadata();
        console.log(`  Downloaded and converted to WebP: ${filename}`);
        return { path: `images/blog/${filename}`, width: meta.width, height: meta.height };
    } catch (e) {
        console.error(`  Failed to download image for post ${postNumber}: ${e.message}`);
        return { path: null, width: null, height: null };
    }
}

function stripHtml(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#(\d+);/g, function(_, code) { return String.fromCharCode(code); })
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function truncateText(text, maxLen) {
    maxLen = maxLen || PREVIEW_LENGTH;
    if (text.length <= maxLen) return text;
    const truncated = text.substring(0, maxLen);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLen * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

function extractTitle(text) {
    // Take first non-empty line as title, max 80 chars
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return '';
    let title = lines[0];
    if (title.length > 80) {
        const cut = title.substring(0, 80);
        const lastSpace = cut.lastIndexOf(' ');
        title = (lastSpace > 50 ? cut.substring(0, lastSpace) : cut) + '...';
    }
    return title;
}

function extractBody(text) {
    // Everything after the first line
    const lines = text.split('\n');
    const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);
    if (firstNonEmpty === -1) return '';
    const rest = lines.slice(firstNonEmpty + 1).join('\n').trim();
    return rest;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDateRu(isoDate) {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

async function fetchPostsData() {
    const url = `https://t.me/s/${CHANNEL}`;
    const res = await fetch(url);
    const html = await res.text();

    // Split by message wrapper boundaries
    const parts = html.split(/data-post="/);
    const posts = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        // Extract post number
        const numMatch = part.match(/^voronova_nutrition\/(\d+)"/);
        if (!numMatch) continue;
        const postNumber = parseInt(numMatch[1], 10);

        // Extract text
        const textMatch = part.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
        const rawHtml = textMatch ? textMatch[1].trim() : '';
        const plainText = stripHtml(rawHtml);
        if (!plainText) continue;
        if (!isPublishablePost(plainText)) continue;

        // Extract date
        const dateMatch = part.match(/datetime="([^"]+)"/);
        const dateISO = dateMatch ? dateMatch[1] : null;

        // Extract first image (style may have width before background-image)
        const imgMatch = part.match(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/);
        const imageUrl = imgMatch ? imgMatch[1] : null;

        posts.push({ postNumber, plainText, dateISO, imageUrl });
    }

    // Deduplicate and sort descending
    const seen = new Set();
    const unique = posts.filter(p => {
        if (seen.has(p.postNumber)) return false;
        seen.add(p.postNumber);
        return true;
    }).sort((a, b) => b.postNumber - a.postNumber);

    const top = unique.slice(0, MAX_POSTS);

    // Download images locally
    if (!fs.existsSync(BLOG_IMAGES_DIR)) {
        fs.mkdirSync(BLOG_IMAGES_DIR, { recursive: true });
    }
    for (const post of top) {
        if (post.imageUrl) {
            const result = await downloadImage(post.imageUrl, post.postNumber);
            post.localImage = result.path;
            post.localImageWidth = result.width;
            post.localImageHeight = result.height;
        }
    }

    return top;
}

const TG_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/></svg>`;
const VK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.066 13.394c.49.483 1.007.952 1.404 1.526.176.253.344.513.456.808.158.42.015.882-.366.906l-2.398-.001c-.618.051-1.113-.196-1.541-.609-.338-.326-.65-.673-.972-1.01-.135-.141-.276-.269-.44-.372-.31-.195-.58-.126-.753.207-.177.338-.217.71-.239 1.084-.03.534-.232.674-.766.697-1.143.05-2.227-.12-3.23-.673-.883-.486-1.556-1.188-2.137-1.98-.954-1.3-1.696-2.735-2.363-4.207-.194-.428-.05-.66.417-.668.776-.013 1.553-.011 2.329-.002.31.004.518.19.642.473.394.904.862 1.762 1.416 2.563.148.214.299.428.513.582.244.176.43.118.546-.158.075-.18.107-.372.123-.565.052-.633.059-1.266-.01-1.897-.042-.39-.241-.643-.631-.709-.2-.033-.17-.099-.073-.199.145-.149.282-.242.554-.242h2.043c.322.064.393.209.437.532l.002 2.27c-.004.148.074.587.341.685.215.075.357-.109.486-.244.577-.606.989-1.316 1.342-2.126.132-.299.25-.608.363-.918.084-.23.215-.343.471-.337l2.597.003c.077 0 .155 0 .23.013.375.065.478.231.361.593-.185.571-.537 1.045-.888 1.516-.37.497-.762.976-1.13 1.474-.331.448-.305.672.09 1.052z"/></svg>`;

function articleCardTemplate(post, index, vkLinks) {
    const title = escapeHtml(extractTitle(post.plainText));
    const body = extractBody(post.plainText);
    const preview = body ? escapeHtml(truncateText(body, PREVIEW_LENGTH)) : '';
    const dateFormatted = formatDateRu(post.dateISO);
    const postUrl = `https://t.me/${CHANNEL}/${post.postNumber}`;
    const vkUrl = vkLinks && vkLinks[String(post.postNumber)];

    const badgeHtml = index === 0
        ? `<span class="blog-badge-new">Новый пост</span>`
        : '';

    // Use downloaded Telegram image or fall back to a random stock photo
    const imageSrc = post.localImage || RANDOM_PICS[post.postNumber % RANDOM_PICS.length];
    const wh = post.localImageWidth && post.localImageHeight
        ? ` width="${post.localImageWidth}" height="${post.localImageHeight}"`
        : '';
    const imageBlock = imageSrc
        ? `\n\t\t\t\t\t<div class="blog-card-image">\n\t\t\t\t\t\t<img src="${imageSrc}" alt="${title}"${wh} loading="lazy" decoding="async">\n\t\t\t\t\t</div>`
        : '';

    const dateRow = dateFormatted
        ? `\t\t\t\t\t\t<div class="blog-card-meta">\n\t\t\t\t\t\t\t<time class="blog-card-date" datetime="${post.dateISO}">${dateFormatted}</time>\n\t\t\t\t\t\t</div>`
        : '';

    const vkIconHtml = vkUrl
        ? `\n\t\t\t\t\t\t\t<a href="${vkUrl}" target="_blank" rel="noopener" class="blog-cta-icon" aria-label="Читать во VK">${VK_SVG}</a>`
        : '';

    return `\t\t\t<!-- Пост ${index + 1} -->
\t\t\t\t<article class="blog-article-card${index === 0 ? ' latest' : ''}${!imageSrc ? ' no-image' : ''}" data-post="${post.postNumber}">${badgeHtml ? `\n\t\t\t\t\t${badgeHtml}` : ''}${imageBlock}
\t\t\t\t\t<div class="blog-card-body">
${dateRow}
\t\t\t\t\t\t<h3 class="blog-card-title">${title}</h3>
${preview ? `\t\t\t\t\t\t<p class="blog-card-text">${preview}</p>` : ''}
\t\t\t\t\t\t<div class="blog-cta-row">
\t\t\t\t\t\t\t<a href="${postUrl}" target="_blank" rel="noopener" class="btn-read-more">
\t\t\t\t\t\t\t\tЧитать
\t\t\t\t\t\t\t\t<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
\t\t\t\t\t\t\t</a>
\t\t\t\t\t\t\t<a href="${postUrl}" target="_blank" rel="noopener" class="blog-cta-icon" aria-label="Читать в Telegram">${TG_SVG}</a>${vkIconHtml}
\t\t\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</article>`;
}

function generateJsonLd(posts) {
    const items = posts.map(post => {
        const entry = {
            "@type": "BlogPosting",
            "headline": extractTitle(post.plainText),
            "url": `https://t.me/${CHANNEL}/${post.postNumber}`,
            "author": { "@type": "Person", "name": "Юлия Воронова", "url": "https://voronova.online" },
            "publisher": { "@type": "Person", "name": "Юлия Воронова", "url": "https://voronova.online" },
            "description": truncateText(post.plainText, PREVIEW_LENGTH),
            "inLanguage": "ru-RU"
        };
        if (post.dateISO) entry.datePublished = post.dateISO;
        if (post.imageUrl) entry.image = post.imageUrl;
        return entry;
    });

    return {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Блог Юлии Вороновой",
        "description": "Статьи о питании, здоровом образе жизни и научном подходе к нутрициологии",
        "url": "https://voronova.online/blog.html",
        "author": {
            "@type": "Person",
            "name": "Юлия Воронова",
            "url": "https://voronova.online",
            "jobTitle": "Доказательный нутрициолог"
        },
        "inLanguage": "ru-RU",
        "blogPost": items
    };
}

function getCurrentPosts() {
    const html = fs.readFileSync(BLOG_FILE, 'utf8');
    const regex = /data-post="(\d+)"/g;
    const numbers = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        numbers.push(parseInt(match[1], 10));
    }
    return [...new Set(numbers)].sort((a, b) => b - a);
}

function updateBlogHtml(posts) {
    let html = fs.readFileSync(BLOG_FILE, 'utf8');
    const nl = html.includes('\r\n') ? '\r\n' : '\n';

    // 1. Replace posts grid content
    const startMarker = '<div class="blog-posts-grid">';
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) {
        console.error('Could not find blog-posts-grid in blog.html');
        process.exit(1);
    }

    const endMarker = '<div class="blog-channel-link">';
    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
        console.error('Could not find blog-channel-link in blog.html');
        process.exit(1);
    }

    const vkLinks = loadVkLinks();
    const divider = `${nl}\t\t\t\t<hr class="blog-divider">${nl}${nl}`;
    const cards = posts.map((p, i) => articleCardTemplate(p, i, vkLinks)).join(divider);
    const before = html.substring(0, startIdx);
    const after = html.substring(endIdx);
    const newGrid = startMarker + nl + cards + nl + `\t\t\t</div>${nl}${nl}\t\t\t`;

    html = before + newGrid + after;

    // 2. Replace JSON-LD
    const jsonLd = generateJsonLd(posts);
    const jsonLdString = JSON.stringify(jsonLd, null, '\t');
    const ldStart = html.indexOf('<!-- JSON-LD Schema: Blog -->');
    if (ldStart !== -1) {
        const ldScriptEnd = html.indexOf('</script>', ldStart) + '</script>'.length;
        const newLd = `<!-- JSON-LD Schema: Blog -->${nl}\t<script type="application/ld+json">${nl}\t${jsonLdString}${nl}\t</script>`;
        html = html.substring(0, ldStart) + newLd + html.substring(ldScriptEnd);
    }

    fs.writeFileSync(BLOG_FILE, html, 'utf8');
}

function updateSitemap() {
    if (!fs.existsSync(SITEMAP_FILE)) return;
    const today = new Date().toISOString().slice(0, 10);
    let xml = fs.readFileSync(SITEMAP_FILE, 'utf8');
    xml = xml.replace(
        /(<loc>https:\/\/voronova\.online\/blog\.html<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/,
        `$1${today}$2`
    );
    fs.writeFileSync(SITEMAP_FILE, xml, 'utf8');
    console.log(`  sitemap.xml updated: blog.html lastmod → ${today}`);
}

async function main() {
    console.log('Fetching posts from Telegram channel...');
    const posts = await fetchPostsData();

    if (posts.length === 0) {
        console.error('No posts found. Telegram might be blocking requests.');
        process.exit(1);
    }

    console.log(`Found ${posts.length} posts: ${posts.map(p => p.postNumber).join(', ')}`);
    posts.forEach(p => {
        console.log(`  #${p.postNumber}: ${truncateText(p.plainText, 60)} | img: ${p.imageUrl ? 'yes' : 'no'} | date: ${p.dateISO || 'n/a'}`);
    });

    const currentPosts = getCurrentPosts();
    console.log(`Current posts in blog: ${currentPosts.join(', ')}`);

    console.log('Updating blog.html...');
    updateBlogHtml(posts);
    updateSitemap();
    console.log('Done! blog.html updated with article cards.');

    // Clean up images of posts no longer displayed
    const activeFiles = new Set(posts.map(p => p.localImage ? path.basename(p.localImage) : null).filter(Boolean));
    if (fs.existsSync(BLOG_IMAGES_DIR)) {
        for (const file of fs.readdirSync(BLOG_IMAGES_DIR)) {
            if (!activeFiles.has(file) && !file.startsWith('random-pic')) {
                fs.unlinkSync(path.join(BLOG_IMAGES_DIR, file));
                console.log(`  Removed old image: ${file}`);
            }
        }
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
