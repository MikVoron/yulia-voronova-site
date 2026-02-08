const fs = require('fs');
const path = require('path');

const CHANNEL = 'voronova_nutrition';
const BLOG_FILE = path.join(__dirname, '..', 'blog.html');
const MAX_POSTS = 6;

const WIDGET_TEMPLATE = (postNumber, index) =>
`			<!-- Пост ${index + 1} -->
				<div class="telegram-post-wrap">
					<div class="telegram-post-widget">
						<script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-post="${CHANNEL}/${postNumber}" data-width="100%" data-userpic="true" data-color="8B7355" data-dark-color="A89070">
						</script>
					</div>
					<button class="btn-discuss" data-post="${CHANNEL}/${postNumber}">Обсудить</button>
					<div class="post-discussion" id="discussion-${postNumber}"></div>
				</div>`;

async function fetchPostNumbers() {
    const url = `https://t.me/s/${CHANNEL}`;
    const res = await fetch(url);
    const html = await res.text();

    const regex = new RegExp(`data-post="${CHANNEL}/(\\d+)"`, 'g');
    const numbers = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        numbers.push(parseInt(match[1], 10));
    }

    const unique = [...new Set(numbers)].sort((a, b) => b - a);
    return unique.slice(0, MAX_POSTS);
}

function getCurrentPosts() {
    const html = fs.readFileSync(BLOG_FILE, 'utf8');
    const regex = /data-telegram-post="voronova_nutrition\/(\d+)"/g;
    const numbers = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        numbers.push(parseInt(match[1], 10));
    }
    return numbers;
}

function updateBlogHtml(postNumbers) {
    let html = fs.readFileSync(BLOG_FILE, 'utf8');
    const nl = html.includes('\r\n') ? '\r\n' : '\n';

    const startMarker = '<div class="telegram-posts-grid">';
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) {
        console.error('Could not find telegram-posts-grid in blog.html');
        process.exit(1);
    }

    const endMarker = '<div class="blog-channel-link">';
    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
        console.error('Could not find blog-channel-link in blog.html');
        process.exit(1);
    }

    const widgets = postNumbers.map((n, i) => WIDGET_TEMPLATE(n, i)).join(nl + nl);
    const before = html.substring(0, startIdx);
    const after = html.substring(endIdx);
    const newGrid = startMarker + nl + widgets + nl + `\t\t\t</div>${nl}${nl}\t\t\t`;

    html = before + newGrid + after;
    fs.writeFileSync(BLOG_FILE, html, 'utf8');
}

async function main() {
    console.log('Fetching posts from Telegram channel...');
    const newPosts = await fetchPostNumbers();

    if (newPosts.length === 0) {
        console.error('No posts found. Telegram might be blocking requests.');
        process.exit(1);
    }

    console.log(`Found posts: ${newPosts.join(', ')}`);

    const currentPosts = getCurrentPosts();
    console.log(`Current posts in blog: ${currentPosts.join(', ')}`);

    if (JSON.stringify(newPosts) === JSON.stringify(currentPosts)) {
        console.log('No changes needed.');
        return;
    }

    console.log('Updating blog.html...');
    updateBlogHtml(newPosts);
    console.log('Done! blog.html updated.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
