// Builds app/lightroom/Clustr.lrplugin.zip from the plug-in sources so the
// download link in the app is a plain static file (works without JS).
// Run after editing anything in app/lightroom/Clustr.lrplugin/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'app', 'lightroom', 'Clustr.lrplugin');
const outputPath = path.join(root, 'app', 'lightroom', 'Clustr.lrplugin.zip');

const files = ['Info.lua', 'ImportCollections.lua', 'README.txt'];
const tree = {};

for (const name of files) {
    const filePath = path.join(pluginDir, name);
    if (!fs.existsSync(filePath)) {
        console.error(`Missing plug-in file: ${path.relative(root, filePath)}`);
        process.exit(1);
    }
    // Normalize so a Windows (CRLF) checkout still produces the same archive.
    const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
    tree[`Clustr.lrplugin/${name}`] = strToU8(text);
}

// Fixed mtime keeps the archive byte-identical for identical sources.
const archive = zipSync(tree, { level: 9, mtime: new Date('2024-01-01T00:00:00Z') });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, archive);

console.log(`Wrote ${path.relative(root, outputPath).replace(/\\/g, '/')} (${archive.length} bytes, ${files.length} files)`);
