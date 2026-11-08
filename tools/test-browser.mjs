import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}/`;
const smallPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
);

const waitForServer = async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
            const response = await fetch(baseUrl);
            if (response.ok) return;
        } catch (error) {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Dev server did not start');
};

const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clustr-photos-'));
for (let index = 0; index < 120; index += 1) {
    fs.writeFileSync(path.join(photoDir, `photo-${String(index).padStart(3, '0')}.png`), smallPng);
}

const server = spawn(process.execPath, [path.join(root, 'tools', 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
});

let browser;

try {
    await waitForServer();
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Clustr', { exact: false }).first().waitFor({ timeout: 20000 });

    if (fs.existsSync(path.join(root, 'Timeline.json'))) {
        await page.getByText(/Timeline \(293\)/).waitFor({ timeout: 10000 });
        console.log('Timeline auto-load: OK');
    }

    // Worker pool: parse an image through exif-worker.js in a real browser event loop.
    const workerResult = await page.evaluate(async () => {
        const response = await fetch('icons/favicon.png');
        const blob = await response.blob();
        const file = new File([blob], 'favicon.png', { type: 'image/png' });
        return await new Promise((resolve) => {
            const worker = new Worker('exif-worker.js');
            const timer = setTimeout(() => {
                worker.terminate();
                resolve({ type: 'timeout' });
            }, 20000);
            worker.onmessage = (event) => {
                clearTimeout(timer);
                worker.terminate();
                resolve(event.data);
            };
            worker.onerror = (event) => {
                clearTimeout(timer);
                worker.terminate();
                resolve({ type: 'onerror', message: event.message });
            };
            worker.postMessage({ type: 'parse', id: 'browser-test', file });
        });
    });
    assert.equal(workerResult.type, 'result', `EXIF worker failed: ${JSON.stringify(workerResult)}`);
    console.log('EXIF worker: OK');

    // Virtualized gallery: load 120 tiny images and ensure only a window is rendered.
    await page.locator('input[webkitdirectory]').setInputFiles(photoDir);
    await page.locator('[data-photo-id]').first().waitFor({ timeout: 15000 });

    const initialTiles = await page.locator('[data-photo-id]').count();
    assert.ok(initialTiles > 0, 'Gallery should render tiles');
    assert.ok(initialTiles < 120, `Gallery should virtualize (${initialTiles}/120 tiles rendered)`);
    console.log(`Virtualized gallery: ${initialTiles}/120 tiles rendered`);

    await page.locator('[data-gallery="true"]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(500);
    const afterScrollTiles = await page.locator('[data-photo-id]').count();
    assert.ok(afterScrollTiles > 0, 'Gallery should render tiles after scrolling');
    assert.ok(afterScrollTiles < 120, `Gallery should stay virtualized after scrolling (${afterScrollTiles}/120)`);
    console.log(`Virtualized gallery after scroll: ${afterScrollTiles}/120 tiles rendered`);

    assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join(' | ')}`);
    console.log('Browser test passed.');
} finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(photoDir, { recursive: true, force: true });
}
