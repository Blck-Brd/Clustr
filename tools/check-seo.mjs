import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');
const origin = 'https://clustr-photo.vercel.app';

const read = (file) => fs.readFileSync(path.join(appDir, file), 'utf8');
const index = read('index.html');
const about = read('about.html');
const czech = read('o-clustr.html');
const robots = read('robots.txt');
const sitemap = read('sitemap.xml');
const landingCss = read('seo/landing.css');

const jsonLdDocs = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));
const graphTypes = (docs) => docs.flatMap((doc) => (doc['@graph'] || []).map((node) => node['@type']));

const indexLd = jsonLdDocs(index);
const aboutLd = jsonLdDocs(about);
const czechLd = jsonLdDocs(czech);

const titleOf = (html) => (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
const descriptionOf = (html) => (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';

assert.match(index, /<html lang="en">/, 'index.html should declare English');
assert.match(about, /<html lang="en">/, 'about.html should declare English');
assert.match(czech, /<html lang="cs">/, 'o-clustr.html should declare Czech');

for (const [name, html] of [['index', index], ['about', about], ['o-clustr', czech]]) {
    const title = titleOf(html);
    const description = descriptionOf(html);
    assert.ok(title.length >= 20 && title.length <= 70, `${name} title length ${title.length} should be 20-70`);
    assert.ok(description.length >= 100 && description.length <= 200, `${name} description length ${description.length} should be 100-200`);
    assert.ok(!/example\.com/.test(html), `${name} should not contain placeholder URLs`);
    if (name !== 'index') assert.ok(!/localhost|127\.0\.0\.1/.test(html), `${name} should not contain local URLs`);
}

assert.ok(index.includes(`<link rel="canonical" href="${origin}/">`), 'index canonical URL is missing');
assert.ok(index.includes(`<meta property="og:url" content="${origin}/">`), 'index og:url is missing');
assert.ok(index.includes(`<meta property="og:image" content="${origin}/seo/og-image.png">`), 'index og:image is missing');
assert.ok(index.includes('<meta name="twitter:card" content="summary_large_image">'), 'index Twitter card is missing');
assert.ok(index.includes('href="/about"'), 'index should link to the about page');
assert.ok(graphTypes(indexLd).includes('SoftwareApplication'), 'index JSON-LD should include SoftwareApplication');
assert.ok(graphTypes(indexLd).includes('WebSite'), 'index JSON-LD should include WebSite');
assert.ok(graphTypes(indexLd).includes('Organization'), 'index JSON-LD should include Organization');

for (const [name, html, docs, canonical] of [
    ['about', about, aboutLd, `${origin}/about`],
    ['o-clustr', czech, czechLd, `${origin}/o-clustr`]
]) {
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${name} canonical URL is missing`);
    assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`), `${name} og:url is missing`);
    assert.ok(html.includes(`<meta property="og:image" content="${origin}/seo/og-image.png">`), `${name} og:image is missing`);
    assert.ok(html.includes(`href="${origin}/about"`), `${name} English hreflang is missing`);
    assert.ok(html.includes(`href="${origin}/o-clustr"`), `${name} Czech hreflang is missing`);
    assert.ok(html.includes('hreflang="x-default"'), `${name} x-default hreflang is missing`);
    assert.match(html, /<h1>[\s\S]+<\/h1>/, `${name} should have an H1`);
    assert.ok((html.match(/<details/g) || []).length >= 8, `${name} should show at least 8 FAQ entries`);
    assert.ok(graphTypes(docs).includes('SoftwareApplication'), `${name} JSON-LD should include SoftwareApplication`);
    assert.ok(graphTypes(docs).includes('FAQPage'), `${name} JSON-LD should include FAQPage`);
    const faq = docs.flatMap((doc) => doc['@graph'] || []).find((node) => node['@type'] === 'FAQPage');
    assert.ok(faq?.mainEntity?.length >= 8, `${name} FAQPage should have at least 8 questions`);
}

assert.ok(about.includes('href="/o-clustr"'), 'about should link to the Czech page');
assert.ok(czech.includes('href="/about"'), 'Czech page should link to the English page');
assert.ok(about.includes('href="/seo/landing.css"'), 'about should load the shared landing CSS');
assert.ok(czech.includes('href="/seo/landing.css"'), 'Czech page should load the shared landing CSS');
assert.match(landingCss, /@media/, 'landing CSS should be responsive');

assert.match(robots, /User-agent: \*/, 'robots.txt should target all crawlers');
assert.match(robots, /Allow: \//, 'robots.txt should allow the app');
assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt should point to the sitemap');

assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/, 'sitemap.xml should have an XML declaration');
assert.match(sitemap, /<urlset[\s\S]*<\/urlset>/, 'sitemap.xml should have a urlset');
for (const loc of [`${origin}/`, `${origin}/about`, `${origin}/o-clustr`]) {
    assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `sitemap should include ${loc}`);
}
assert.ok(sitemap.includes('hreflang="x-default"'), 'sitemap should include x-default alternates');

const ogImage = fs.readFileSync(path.join(appDir, 'seo', 'og-image.png'));
assert.equal(ogImage.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'OG image should be a PNG');
assert.equal(ogImage.readUInt32BE(16), 1200, 'OG image width should be 1200');
assert.equal(ogImage.readUInt32BE(20), 630, 'OG image height should be 630');

console.log(`SEO checks passed (${titleOf(index).length} char title, ${jsonLdDocs(index).length} JSON-LD block, sitemap ${origin}).`);
