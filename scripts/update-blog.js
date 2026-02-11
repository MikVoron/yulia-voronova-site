const fs = require('fs');
const path = require('path');

const CHANNEL = 'voronova_nutrition';
const BLOG_FILE = path.join(__dirname, '..', 'blog.html');
const MAX_POSTS = 5;
const PREVIEW_LENGTH = 400;

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

    return unique.slice(0, MAX_POSTS);
}

function articleCardTemplate(post, index) {
    const title = escapeHtml(extractTitle(post.plainText));
    const body = extractBody(post.plainText);
    const preview = body ? escapeHtml(truncateText(body, PREVIEW_LENGTH)) : '';
    const dateFormatted = formatDateRu(post.dateISO);
    const postUrl = `https://t.me/${CHANNEL}/${post.postNumber}`;

    const badgeHtml = index === 0
        ? `\n\t\t\t\t\t<span class="blog-badge-new">Новый пост</span>`
        : '';

    const imageBlock = post.imageUrl
        ? `\n\t\t\t\t\t<div class="blog-card-image">\n\t\t\t\t\t\t<img src="${post.imageUrl}" alt="${title}" loading="lazy" decoding="async">\n\t\t\t\t\t</div>`
        : '';

    const noImageClass = !post.imageUrl ? ' no-image' : '';

    return `\t\t\t<!-- Пост ${index + 1} -->
\t\t\t\t<article class="blog-article-card${index === 0 ? ' latest' : ''}${noImageClass}" data-post="${post.postNumber}">${badgeHtml}${imageBlock}
\t\t\t\t\t<div class="blog-card-body">
${dateFormatted ? `\t\t\t\t\t\t<time class="blog-card-date" datetime="${post.dateISO}">${dateFormatted}</time>` : ''}
\t\t\t\t\t\t<h3 class="blog-card-title">${title}</h3>
${preview ? `\t\t\t\t\t\t<p class="blog-card-text">${preview}</p>` : ''}
\t\t\t\t\t\t<a href="${postUrl}" target="_blank" rel="noopener" class="btn-read-more">
\t\t\t\t\t\t\tЧитать в Telegram
\t\t\t\t\t\t\t<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
\t\t\t\t\t\t</a>
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

    const divider = `${nl}\t\t\t\t<hr class="blog-divider">${nl}${nl}`;
    const cards = posts.map((p, i) => articleCardTemplate(p, i)).join(divider);
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

    if (JSON.stringify(posts.map(p => p.postNumber)) === JSON.stringify(currentPosts)) {
        console.log('No changes needed.');
        return;
    }

    console.log('Updating blog.html...');
    updateBlogHtml(posts);
    console.log('Done! blog.html updated with article cards.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
