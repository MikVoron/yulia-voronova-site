const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ORIGIN = 'https://plate.voronova.online';
const API_ORIGIN = 'https://api.voronova.online';
const OUTPUT = path.join(__dirname, '..', 'platform', 'sitemap.xml');

function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { Accept: 'application/json' } }, response => {
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`${url} returned HTTP ${response.statusCode}`));
                return;
            }
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (error) { reject(new Error(`${url} returned invalid JSON: ${error.message}`)); }
            });
        }).on('error', reject);
    });
}

async function getJsonVerified(url) {
    try {
        return await getJson(url);
    } catch (error) {
        if (!/certificate|unable to verify/i.test(error.message)) throw error;
        const command = process.platform === 'win32' ? 'curl.exe' : 'curl';
        const body = execFileSync(command, [
            '--fail', '--silent', '--show-error', '--location',
            '--header', 'Accept: application/json',
            url
        ], { encoding: 'utf8' });
        return JSON.parse(body);
    }
}

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function urlEntry(url) {
    return `  <url>\n    <loc>${xmlEscape(url)}</loc>\n  </url>`;
}

async function main() {
    const [recipes, categories, ingredients] = await Promise.all([
        getJsonVerified(`${API_ORIGIN}/content/recipes`),
        getJsonVerified(`${API_ORIGIN}/content/categories`),
        getJsonVerified(`${API_ORIGIN}/content/ingredients`)
    ]);

    const urls = [
        { url: `${ORIGIN}/` },
        { url: `${ORIGIN}/category.html` },
        { url: `${ORIGIN}/how-subscription-works.html` },
        { url: `${ORIGIN}/personal-data-processing-policy.html` },
        ...categories.filter(item => item && item.id).map(item => ({
            url: `${ORIGIN}/category.html?cat=${encodeURIComponent(item.id)}`
        })),
        ...ingredients.filter(item => item && item.id).map(item => ({
            url: `${ORIGIN}/ingredient.html?id=${encodeURIComponent(item.id)}`
        })),
        ...recipes.filter(item => item && item.id).map(item => ({
            url: `${ORIGIN}/recipe.html?id=${encodeURIComponent(item.id)}`
        }))
    ];

    const unique = Array.from(new Map(urls.map(item => [item.url, item])).values());
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...unique.map(item => urlEntry(item.url)),
        '</urlset>',
        ''
    ].join('\n');

    fs.writeFileSync(OUTPUT, xml, 'utf8');
    console.log(`SmartPlate sitemap written: ${unique.length} URLs -> ${OUTPUT}`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
