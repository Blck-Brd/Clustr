import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { unzipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4176;
const baseUrl = `http://127.0.0.1:${port}/`;
const smallJpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const normalJpg = Buffer.concat([smallJpg, Buffer.alloc(140 * 1024)]);

const photoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clustr-mobile-photos-'));
const photoPaths = [];
for (let index = 0; index < 12; index += 1) {
    const filePath = path.join(photoDir, `phone-${String(index).padStart(3, '0')}.jpg`);
    fs.writeFileSync(filePath, normalJpg);
    photoPaths.push(filePath);
}

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

const server = spawn(process.execPath, [path.join(root, 'tools', 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
});

let browser;

try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
        try {
            localStorage.setItem('clustr-early-access-seen', '1');
            localStorage.setItem('clustr-tour-seen', '1');
            Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
            Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
        } catch (error) {}
        const createObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => {
            if (blob && blob.type === 'application/zip') window.__zipBlob = blob;
            return createObjectURL(blob);
        };
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function click() {
            if (this.download && /\.zip$/i.test(this.download)) {
                window.__zipName = this.download;
                return;
            }
            return originalClick.call(this);
        };
    });

    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/ERR_CONNECTION_REFUSED|localhost:11434/i.test(text)) return;
        const url = message.location()?.url || '';
        if (/Failed to load resource/i.test(text) && /\/Timeline\.json(?:$|[?#])/i.test(url)) return;
        pageErrors.push(url ? `${text} (${url})` : text);
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('Clustr', { exact: false }).first().waitFor({ timeout: 20000 });

    const earlyAccess = page.locator('[data-early-access-modal]');
    await earlyAccess.waitFor({ timeout: 5000 }).catch(() => {});
    if (await earlyAccess.count()) {
        await earlyAccess.getByRole('button', { name: /Continue|Pokračovat/ }).click();
        await earlyAccess.waitFor({ state: 'detached', timeout: 5000 });
    }

    const menuButton = page.getByRole('button', { name: /Open menu|Otevřít menu/ });
    await menuButton.waitFor({ timeout: 5000 });
    console.log('Mobile menu button: OK');

    const addPhotos = page.locator('input[accept*="image/"]');
    assert.equal(await addPhotos.count(), 1, 'Mobile photo input should exist');

    await menuButton.click();
    const sidebar = page.locator('[data-tour="upload"]');
    await sidebar.waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    const sidebarBox = await sidebar.boundingBox();
    assert.ok(sidebarBox && sidebarBox.x + sidebarBox.width > 0, 'Sidebar should be on screen after opening');

    await addPhotos.setInputFiles(photoPaths);
    await page.locator('[data-photo-id]').first().waitFor({ timeout: 20000 });
    const loadedMessage = page.getByText(/Photos added|Fotky přidány/);
    await loadedMessage.waitFor({ timeout: 5000 }).catch(() => {});
    if (await page.getByRole('button', { name: 'OK', exact: true }).count()) {
        await page.getByRole('button', { name: 'OK', exact: true }).click();
    }
    console.log('Camera-roll import: OK');

    await page.locator('[data-mobile-panel-close]').click();
    await page.waitForTimeout(300);

    const tileBoxes = await page.locator('[data-photo-id]').evaluateAll((tiles) => tiles.slice(0, 8).map((tile) => {
        const rect = tile.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y) };
    }));
    const columns = new Set(tileBoxes.map((box) => box.x)).size;
    assert.ok(columns >= 4, `Mobile gallery should show at least 4 columns, got ${columns}`);

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(noHorizontalOverflow, 'Mobile layout should not overflow horizontally');
    console.log(`Mobile gallery: ${columns} columns, no horizontal overflow`);

    await page.screenshot({ path: path.join(os.tmpdir(), 'clustr-mobile-check.png') });
    console.log('Screenshot:', path.join(os.tmpdir(), 'clustr-mobile-check.png'));

    const panelToggle = page.locator('[data-mobile-panel-toggle]');
    await panelToggle.click();
    await page.waitForTimeout(300);
    const openBox = await page.locator('[data-tour="upload"]').boundingBox();
    assert.ok(openBox && openBox.x + openBox.width > 0, 'Panel arrow should open the sidebar');
    await page.locator('[data-mobile-panel-close]').click();
    await page.waitForTimeout(300);
    const closedBox = await page.locator('[data-tour="upload"]').boundingBox();
    assert.ok(!closedBox || closedBox.x + closedBox.width <= 0, 'Panel arrow should hide the sidebar');
    console.log('Mobile panel arrow toggle: OK');

    await panelToggle.click();
    await page.waitForTimeout(300);
    await page.locator('[data-tour="export"]').click();
    await page.locator('[data-export-run]').click();
    await page.getByText(/Export hotov|Export done/).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    const zipPayload = await page.evaluate(async () => {
        if (!window.__zipBlob) return null;
        const bytes = new Uint8Array(await window.__zipBlob.arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        return { name: window.__zipName, base64: btoa(binary) };
    });
    assert.ok(zipPayload, 'ZIP blob should be created');
    assert.match(zipPayload.name, /^clustr-export-.*\.zip$/, 'ZIP should have the export name');
    const archive = unzipSync(new Uint8Array(Buffer.from(zipPayload.base64, 'base64')));
    const archiveFiles = Object.keys(archive);
    assert.ok(archiveFiles.some((name) => /\.jpg$/i.test(name)), `ZIP should contain photos: ${archiveFiles.join(', ')}`);
    assert.ok(archiveFiles.some((name) => /\.xmp$/i.test(name)), 'ZIP should contain XMP sidecars');
    const xmpFile = archiveFiles.find((name) => /\.xmp$/i.test(name));
    assert.ok(Buffer.from(archive[xmpFile]).toString('utf8').includes('<dc:subject>'), 'XMP should contain keywords');
    console.log(`Mobile ZIP export: OK (${archiveFiles.length} files)`);

    await menuButton.click();
    await page.locator('[data-auto-clustering]').click();
    await page.getByText(/Seskupeno|Grouped/).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.locator('[data-mobile-panel-close]').click();
    console.log('Mobile Phase 2: OK');

    await menuButton.click();
    await page.locator('[data-open-heatmap]').click();
    const heatmapPanel = page.locator('[data-heatmap-panel]');
    await heatmapPanel.waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    const heatmapBox = await heatmapPanel.boundingBox();
    assert.ok(heatmapBox && heatmapBox.width >= page.viewportSize().width - 1, 'Mobile heatmap should fill the screen');

    await page.locator('[data-heatmap-draw-mode]').click();
    const timelineCanvas = page.locator('[data-cluster-review-canvas="timeline"]');
    const canvasBox = await timelineCanvas.boundingBox();
    assert.ok(canvasBox, 'Timeline canvas should be rendered');
    await page.touchscreen.tap(canvasBox.x + Math.min(200, canvasBox.width - 20), canvasBox.y + 12);
    await page.getByText(/Start:/).waitFor({ timeout: 5000 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'clustr-mobile-heatmap.png') });
    console.log('Mobile heatmap touch range: OK');

    await page.locator('[data-heatmap-close]').click();
    await heatmapPanel.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`);
    console.log('Mobile browser test passed.');
} finally {
    if (browser) await browser.close();
    server.kill();
}
