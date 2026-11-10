import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

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
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await context.newPage();

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

    await page.getByRole('button', { name: /Close menu|Zavřít menu/ }).click();
    await page.waitForTimeout(300);

    const tileBoxes = await page.locator('[data-photo-id]').evaluateAll((tiles) => tiles.slice(0, 8).map((tile) => {
        const rect = tile.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y) };
    }));
    const columns = new Set(tileBoxes.map((box) => box.x)).size;
    assert.ok(columns >= 2, `Mobile gallery should show at least 2 columns, got ${columns}`);

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    assert.ok(noHorizontalOverflow, 'Mobile layout should not overflow horizontally');
    console.log(`Mobile gallery: ${columns} columns, no horizontal overflow`);

    await page.screenshot({ path: path.join(os.tmpdir(), 'clustr-mobile-check.png') });
    console.log('Screenshot:', path.join(os.tmpdir(), 'clustr-mobile-check.png'));

    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join(' | ')}`);
    console.log('Mobile browser test passed.');
} finally {
    if (browser) await browser.close();
    server.kill();
}
