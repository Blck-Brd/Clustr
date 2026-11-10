import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(root, 'app');

const requiredFiles = [
    'index.html',
    'core.js',
    'manifest.webmanifest',
    'sw.js',
    'exif-worker.js',
    'geo-worker.js',
    'preview-worker.js',
    'vendor/exifr.full.umd.js',
    'vendor/utif.js',
    'vendor/fflate.umd.js',
    'vendor/heic2any.min.js',
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
const marker = '<script type="text/babel">';
const start = html.indexOf(marker);
const end = html.indexOf('</script>', start);

if (start === -1 || end === -1) {
    console.error('Could not find the Babel application script in app/index.html');
    process.exit(1);
}

const code = html.slice(start + marker.length, end);

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

for (const file of ['manifest.webmanifest', 'vercel.json']) {
    try {
        JSON.parse(fs.readFileSync(path.join(appDir, file), 'utf8'));
        console.log(`${file} is valid JSON`);
    } catch (error) {
        console.error(`${file} is not valid JSON:`, error.message);
        failed = true;
    }
}

if (failed) process.exit(1);

