import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');

const requiredFiles = [
    'index.html',
    'core.js',
    'about.html',
    'o-clustr.html',
    'robots.txt',
    'sitemap.xml',
    'seo/landing.css',
    'seo/og-image.png',
    'manifest.webmanifest',
    'sw.js',
    'exif-worker.js',
    'geo-worker.js',
    'preview-worker.js',
    'lightroom/Clustr.lrplugin/Info.lua',
    'lightroom/Clustr.lrplugin/ImportCollections.lua',
    'lightroom/Clustr.lrplugin/README.txt',
    'lightroom/Clustr.lrplugin.zip',
    'vendor/exifr.full.umd.js',
    'vendor/utif.js',
    'vendor/fflate.umd.js',
    'vendor/heic2any.min.js',
    'vendor/react.production.min.js',
    'vendor/react-dom.production.min.js',
    'vendor/babel.min.js',
    'vendor/tailwind.js',
    'demo/demo.json',
    'demo/CREDITS.md',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/favicon.png',
    'icons/apple-touch-icon.png'
];

let failed = false;

for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(appDir, file))) {
        console.error(`Missing required file: app/${file}`);
        failed = true;
    }
}

const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const marker = '<script type="text/babel"';
const tagStart = html.indexOf(marker);
const contentStart = tagStart === -1 ? -1 : html.indexOf('>', tagStart);
const end = contentStart === -1 ? -1 : html.indexOf('</script>', contentStart);

if (tagStart === -1 || contentStart === -1 || end === -1) {
    console.error('Could not find the Babel application script in app/index.html');
    process.exit(1);
}

const code = html.slice(contentStart + 1, end);

let Babel;
try {
    Babel = require('@babel/standalone');
} catch {
    console.error('Missing @babel/standalone. Run: npm install');
    process.exit(1);
}

try {
    const compiled = Babel.transform(code, { presets: ['react'], filename: 'app.jsx' }).code;
    // Compile without executing so browser globals (React, exifr, document) are not required.
    new Function(compiled);
    console.log(`Babel transform + syntax check OK (${compiled.length} bytes)`);
} catch (error) {
    console.error('JavaScript syntax error:', error.message);
    failed = true;
}

for (const file of ['core.js', 'sw.js', 'exif-worker.js', 'geo-worker.js', 'preview-worker.js', 'vendor/utif.js', 'vendor/fflate.umd.js']) {
    try {
        new Function(fs.readFileSync(path.join(appDir, file), 'utf8'));
        console.log(`${file} is syntactically valid`);
    } catch (error) {
        console.error(`${file} syntax error:`, error.message);
        failed = true;
    }
}

let luaparse = null;
try {
    luaparse = require('luaparse');
} catch {
    console.warn('luaparse missing, skipping the Lightroom plug-in check (npm install)');
}

if (luaparse) {
    for (const file of ['lightroom/Clustr.lrplugin/Info.lua', 'lightroom/Clustr.lrplugin/ImportCollections.lua']) {
        try {
            luaparse.parse(fs.readFileSync(path.join(appDir, file), 'utf8'), { luaVersion: '5.1' });
            console.log(`${file} is syntactically valid Lua 5.1`);
        } catch (error) {
            console.error(`${file} Lua syntax error:`, error.message);
            failed = true;
        }
    }

    // The plug-in and core.js must agree on the manifest schema.
    const coreSource = fs.readFileSync(path.join(appDir, 'core.js'), 'utf8');
    const pluginSource = fs.readFileSync(path.join(appDir, 'lightroom/Clustr.lrplugin/ImportCollections.lua'), 'utf8');
    const coreSchema = coreSource.match(/schema: '(clustr\.export\/\d+)'/);
    const pluginSchema = pluginSource.match(/schema ~= '(clustr\.export\/\d+)'/);
    if (!coreSchema || !pluginSchema || coreSchema[1] !== pluginSchema[1]) {
        console.error('Lightroom manifest schema mismatch between core.js and the plug-in');
        failed = true;
    } else {
        console.log(`Lightroom manifest schema ${coreSchema[1]} matches the plug-in`);
    }

    if (!html.includes('buildLightroomManifest')) {
        console.error('app/index.html does not write the Lightroom manifest on export');
        failed = true;
    }
}

// The downloadable plug-in ZIP is a plain static file, so it must match the
// sources it was built from. Regenerate with: npm run plugin:zip
try {
    const zipPath = path.join(appDir, 'lightroom/Clustr.lrplugin.zip');
    const archive = unzipSync(fs.readFileSync(zipPath));
    let zipMatches = true;
    for (const name of ['Info.lua', 'ImportCollections.lua', 'README.txt']) {
        const entry = archive[`Clustr.lrplugin/${name}`];
        // Compare text with normalized line endings so CRLF checkouts still pass.
        const source = fs.readFileSync(path.join(appDir, 'lightroom/Clustr.lrplugin', name), 'utf8');
        if (!entry || Buffer.from(entry).toString('utf8').replace(/\r\n/g, '\n') !== source.replace(/\r\n/g, '\n')) {
            console.error(`lightroom/Clustr.lrplugin.zip is out of date (${name}). Run: npm run plugin:zip`);
            zipMatches = false;
            failed = true;
        }
    }
    if (zipMatches) console.log('Lightroom plug-in ZIP matches its sources');
} catch (error) {
    console.error('Lightroom plug-in ZIP is not readable:', error.message);
    failed = true;
}

for (const file of ['manifest.webmanifest', 'vercel.json']) {
    try {
        JSON.parse(fs.readFileSync(path.join(appDir, file), 'utf8'));
        console.log(`${file} is valid JSON`);
    } catch (error) {
        console.error(`${file} is not valid JSON:`, error.message);
        failed = true;
    }
}

try {
    const demo = JSON.parse(fs.readFileSync(path.join(appDir, 'demo', 'demo.json'), 'utf8'));
    const photos = Array.isArray(demo.photos) ? demo.photos : [];
    const timeline = Array.isArray(demo.timeline) ? demo.timeline : [];

    if (photos.length < 40 || photos.length > 60) {
        console.error(`Demo library should have 40-60 photos, found ${photos.length}`);
        failed = true;
    }
    if (timeline.length === 0) {
        console.error('Demo library has no timeline entries');
        failed = true;
    }

    for (const photo of photos) {
        if (!photo.file || !photo.date || !Number.isFinite(photo.lat) || !Number.isFinite(photo.lon)) {
            console.error(`Demo photo is missing metadata: ${JSON.stringify(photo.file)}`);
            failed = true;
            continue;
        }
        if (!fs.existsSync(path.join(appDir, 'demo', photo.file))) {
            console.error(`Missing demo photo file: app/demo/${photo.file}`);
            failed = true;
        }
    }

    for (const visit of timeline) {
        if (visit.kind !== 'visit' || !Number.isFinite(visit.start) || !Number.isFinite(visit.end)) {
            console.error('Demo timeline entry is not a valid visit');
            failed = true;
            break;
        }
    }

    console.log(`Demo library OK (${photos.length} photos, ${timeline.length} timeline visits)`);
} catch (error) {
    console.error('Demo library is not valid JSON:', error.message);
    failed = true;
}

if (failed) process.exit(1);

