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
const smallJpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
// Keep the browser smoke-test photos above the clutter-size cutoff so they are
// treated as normal photos, not screenshots.
const normalJpg = Buffer.concat([smallJpg, Buffer.alloc(140 * 1024)]);

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
    fs.writeFileSync(path.join(photoDir, `photo-${String(index).padStart(3, '0')}.jpg`), normalJpg);
}

const server = spawn(process.execPath, [path.join(root, 'tools', 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
});

let browser;

try {
    await waitForServer();
    const launchBrowser = async () => {
        const preferred = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'chrome' : null);
        if (preferred) {
            try {
                return await chromium.launch({ channel: preferred, headless: true });
            } catch (error) {
                console.warn(`Playwright channel "${preferred}" unavailable, using bundled Chromium.`);
            }
        }
        return chromium.launch({ headless: true });
    };
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Ollama polling is optional and logs a refused connection when it is not running.
        if (/ERR_CONNECTION_REFUSED|localhost:11434/i.test(message.text())) return;
        pageErrors.push(message.text());
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

    // Cluster review heatmap: empty state before Phase 2.
    await page.locator('[data-open-heatmap]').click();
    await page.locator('[data-heatmap-panel]').waitFor({ timeout: 10000 });
    assert.ok(await page.getByText(/Nejprve spusťte fázi 2|Run Phase 2 first/).count() > 0, 'Cluster review should explain that Phase 2 is required');
    await page.locator('[data-heatmap-close]').click();
    console.log('Cluster review empty state: OK');

    // Run Phase 2 and verify clusters appear in the heatmap review.
    await page.locator('[data-auto-clustering]').click();
    await page.getByText(/Seskupeno|Grouped/).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator('[data-open-heatmap]').click();
    await page.locator('[data-heatmap-panel]').waitFor({ timeout: 10000 });
    await page.locator('[data-cluster-group]').first().waitFor({ timeout: 10000 });
    const reviewGroups = await page.locator('[data-cluster-group]').count();
    assert.ok(reviewGroups > 0, 'Cluster review should show clusters after Phase 2');
    const canvasSize = await page.locator('[data-cluster-review-canvas="timeline"]').evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0, 'Cluster heatmap canvas should have a size');
    await page.locator('[data-cluster-group]').first().click();
    await page.locator('[data-review-name]').fill('Test Trip');
    await page.locator('[data-review-apply]').click();
    await page.getByText('Test Trip', { exact: false }).first().waitFor({ timeout: 5000 });
    await page.locator('[data-heatmap-close]').click();
    console.log('Cluster review with clusters: OK');

    // Tile selection filters the gallery, and a new folder can be created from it.
    await page.locator('[data-open-heatmap]').click();
    await page.locator('[data-heatmap-panel]').waitFor({ timeout: 10000 });
    await page.locator('[data-cluster-review-canvas="timeline"]').click({ position: { x: 300, y: 16 } });
    await page.waitForTimeout(400);
    assert.ok(await page.locator('[data-photo-id]').count() > 0, 'Heatmap tile should highlight photos in the gallery');
    await page.locator('[data-review-name]').fill('Heatmap/Folder');
    await page.locator('[data-review-create]').click();
    await page.getByText(/Složka vytvořena|Folder created/).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator('[data-folder-tree]').getByText('Heatmap - Folder', { exact: false }).first().waitFor({ timeout: 5000 });
    console.log('Heatmap tile -> folder: OK');

    // Add a second heatmap selection to the folder that already exists.
    await page.locator('[data-cluster-group]').first().click();
    await page.locator('[data-review-target]').selectOption('Heatmap - Folder');
    await page.locator('[data-review-add-to-folder]').click();
    await page.getByText(/Přidáno do složky|Added to folder/).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    console.log('Heatmap selection -> existing folder: OK');
    await page.locator('[data-heatmap-close]').click();

    // Clean state: reset clears photos/folders and skips the Timeline auto-load once.
    page.once('dialog', (dialog) => dialog.accept());
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await page.getByRole('button', { name: '🧹' }).click();
    await navigation;
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('[data-photo-id]').count(), 0, 'Reset should remove photos');
    assert.equal(await page.getByText(/Timeline \(293\)/).count(), 0, 'Reset should skip the Timeline auto-load on first reload');
    console.log('Clean-state reset: OK');

    assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join(' | ')}`);
    console.log('Browser test passed.');
} finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(photoDir, { recursive: true, force: true });
}

