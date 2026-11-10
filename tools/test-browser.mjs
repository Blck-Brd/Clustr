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
        const text = message.text();
        // Ollama polling is optional and logs a refused connection when it is not running.
        if (/ERR_CONNECTION_REFUSED|localhost:11434/i.test(text)) return;
        // Timeline.json is optional, so CI intentionally runs without it.
        const url = message.location()?.url || '';
        if (/Failed to load resource/i.test(text) && /\/Timeline\.json(?:$|[?#])/i.test(url)) return;
        pageErrors.push(url ? `${text} (${url})` : text);
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Clustr', { exact: false }).first().waitFor({ timeout: 20000 });

    await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return;
        await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
    });
    await page.goto(`${baseUrl}about`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').filter({ hasText: /Sort thousands of camera photos/ }).waitFor({ timeout: 10000 });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Clustr', { exact: false }).first().waitFor({ timeout: 20000 });
    console.log('About page navigation: OK');

    const earlyAccessModal = page.locator('[data-early-access-modal]');
    await earlyAccessModal.waitFor({ timeout: 5000 }).catch(() => {});
    if (await earlyAccessModal.count()) {
        await earlyAccessModal.getByRole('button', { name: /Continue|Pokračovat/ }).click();
        await earlyAccessModal.waitFor({ state: 'detached', timeout: 5000 });
    }
    await page.locator('[data-tour="feedback"]').click();
    const feedbackModal = page.locator('[data-feedback-modal]');
    await feedbackModal.waitFor({ timeout: 5000 });
    assert.equal((await feedbackModal.locator('[data-feedback-email]').innerText()).trim(), 'andrejkos2077@gmail.com', 'Feedback dialog should show the email address');
    await feedbackModal.getByRole('button', { name: /Close|Zavřít/ }).click();
    await feedbackModal.waitFor({ state: 'detached', timeout: 5000 });
    console.log('Feedback dialog: OK');

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

    const allCrumbs = await page.locator('[data-folder-breadcrumbs]').innerText();
    assert.ok(/All photos|Všechny fotky/.test(allCrumbs), `Breadcrumb should say All photos: ${allCrumbs}`);
    console.log('All photos breadcrumb: OK');

    // First-run tour auto-opens; skip it, then replay it from the help dialog.
    await page.locator('[data-app-tour]').waitFor({ timeout: 6000 });
    await page.locator('[data-tour-next]').click();
    await page.locator('[data-tour-skip]').click();
    await page.locator('[data-app-tour]').waitFor({ state: 'detached', timeout: 5000 });
    await page.locator('[data-tour="help"]').click();
    await page.locator('[data-start-tour]').click();
    await page.locator('[data-app-tour]').waitFor({ timeout: 5000 });
    await page.locator('[data-tour-skip]').click();
    console.log('App tour: OK');

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

    assert.ok((await page.locator('[data-phase="2"]').innerText()).includes('✓'), 'Phase 2 should show a completion checkmark');
    for (const step of [3, 4, 5]) {
        const card = page.locator(`[data-phase="${step}"]`);
        const text = await card.innerText();
        assert.ok(/optional|volitelné/.test(text), `Phase ${step} should be marked optional`);
        await card.locator('button', { hasText: '⚙️' }).click();
    }
    assert.ok(await page.locator('[data-phase="3"] select').first().isVisible(), 'Phase 3 cog should reveal settings');
    console.log('Phase checkmarks, optional labels and cogs: OK');
    await page.locator('[data-open-heatmap]').click();
    await page.locator('[data-heatmap-panel]').waitFor({ timeout: 10000 });
    await page.locator('[data-cluster-group]').first().waitFor({ timeout: 10000 });
    const reviewGroups = await page.locator('[data-cluster-group]').count();
    assert.ok(reviewGroups > 0, 'Cluster review should show clusters after Phase 2');
    const canvasSize = await page.locator('[data-cluster-review-canvas="timeline"]').evaluate((canvas) => ({ width: canvas.width, height: canvas.height }));
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0, 'Cluster heatmap canvas should have a size');
    await page.locator('[data-heatmap-help]').click();
    await page.locator('[data-heatmap-help-modal]').waitFor({ timeout: 5000 });
    await page.locator('[data-heatmap-help-modal]').getByRole('button', { name: /Got it|Rozumím/ }).click();
    await page.locator('[data-heatmap-help-modal]').waitFor({ state: 'detached', timeout: 5000 });
    console.log('Heatmap help: OK');
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

    await page.locator('[data-folder-tree]').getByText('Heatmap - Folder', { exact: false }).first().click();
    const folderCrumbs = await page.locator('[data-folder-breadcrumbs]').innerText();
    assert.ok(folderCrumbs.includes('Heatmap - Folder'), `Breadcrumb should show the selected folder: ${folderCrumbs}`);
    console.log('Folder breadcrumb: OK');

    // Phase 5: fill a missing location and let it propagate to nearby photos.
    await page.locator('[data-start-data-fill]').click();
    await page.locator('[data-data-fill]').waitFor({ timeout: 10000 });
    for (let attempt = 0; attempt < 6; attempt += 1) {
        if (await page.locator('[data-data-fill]').count() === 0) break;
        await page.locator('[data-data-fill-input]').fill('Testovací místo');
        await page.locator('[data-data-fill-apply]').click();
        await page.waitForTimeout(400);
    }
    assert.equal(await page.locator('[data-start-data-fill]').isDisabled(), true, 'Data fill should disable once all locations are filled');
    console.log('Data fill phase: OK');

    // Export: fake the File System Access API and verify progress + Lightroom XMP.
    await page.evaluate(() => {
        window.__xmp = [];
        const dir = {
            getDirectoryHandle: async () => dir,
            getFileHandle: async () => ({
                createWritable: async () => ({
                    write: async (data) => {
                        if (typeof data === 'string') window.__xmp.push(data);
                        await new Promise((resolve) => setTimeout(resolve, 6));
                    },
                    close: async () => {}
                })
            })
        };
        window.showDirectoryPicker = async () => dir;
    });
    await page.locator('[data-export-open]').click();
    await page.locator('[data-export-run]').click();
    await page.locator('[data-export-progress]').waitFor({ timeout: 10000 });
    await page.getByText(/Export hotov|Export done/).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    const supportModal = page.locator('[data-support-modal]');
    if (await supportModal.count()) {
        await supportModal.getByRole('button', { name: /Maybe later|Možná později/ }).click();
    }
    await page.locator('[data-support-button]').click();
    await supportModal.waitFor({ timeout: 5000 });
    assert.equal(await supportModal.locator('a').getAttribute('href'), 'https://ko-fi.com/andrewblackbird', 'Support CTA should link to Ko-fi');
    assert.ok(await supportModal.getByRole('link', { name: /To podporuji|I support that|Koupit mi kávu|Buy me a coffee/ }).isVisible(), 'Support modal should show the CTA');
    await supportModal.getByRole('button', { name: /Maybe later|Možná později/ }).click();
    await supportModal.waitFor({ state: 'detached', timeout: 5000 });
    const xmpSidecars = await page.evaluate(() => window.__xmp);
    assert.ok(xmpSidecars.length > 0, 'XMP sidecars should be written');
    assert.ok(xmpSidecars[0].includes('<dc:subject>'), 'XMP should contain keywords');
    assert.ok(xmpSidecars[0].includes('<lr:hierarchicalSubject>'), 'XMP should contain the Lightroom hierarchy');
    assert.ok(xmpSidecars[0].includes('<Iptc4xmpCore:Location>'), 'XMP should contain the Lightroom location field');
    console.log('Export progress + Lightroom XMP: OK');

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



