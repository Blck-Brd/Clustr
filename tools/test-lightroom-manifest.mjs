import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { lua, lauxlib, lualib, to_luastring, to_jsstring } from 'fengari';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreSource = fs.readFileSync(path.join(root, 'app', 'core.js'), 'utf8');
const pluginSource = fs.readFileSync(path.join(root, 'app', 'lightroom', 'Clustr.lrplugin', 'ImportCollections.lua'), 'utf8');

// --- Load the real manifest builder from core.js -------------------------------
const sandbox = {
    console: { info() {}, log() {}, warn() {}, error() {} },
    React: { Component: class Component {} },
    Date,
    Math,
    Intl,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { languages: ['en'], language: 'en' },
    document: { createElement: () => ({ getContext: () => ({}) }) },
    fetch: async () => ({ ok: false, json: async () => ({}) })
};
vm.createContext(sandbox);
vm.runInContext(`${coreSource}\n;globalThis.__manifest = buildLightroomManifest;`, sandbox);
const buildLightroomManifest = sandbox.__manifest;
assert.equal(typeof buildLightroomManifest, 'function', 'buildLightroomManifest is missing from core.js');

const photo = (name, event, location, tags, date) => ({
    file: { name },
    name,
    fileName: name,
    folderParts: event.split('/'),
    photo: { name, date, aiData: { event_name: event, tags }, hardData: { location } }
});

const entries = [
    photo('DSC_7269.NEF', 'Trip 3 - Praha/Stop 1 - Staré Město', 'Praha', ['Praha', 'muzeum'], new Date('2026-07-21T17:38:00Z')),
    photo('DSC_7270.NEF', 'Trip 3 - Praha/Stop 1 - Staré Město', 'Praha', ['Praha'], new Date('2026-07-21T17:39:00Z')),
    photo('DSC_7300.NEF', 'Trip 3 - Praha/Stop 2 - "Karlův most"', 'Praha', ['Praha'], new Date('2026-07-22T09:00:00Z')),
    photo('DSC_9000.NEF', 'Home 1', 'Brno', ['Home'], new Date('2026-07-25T20:00:00Z')),
    photo('IMG_0001.JPG', 'Screenshot-Clutter', '', [], new Date('2026-07-26T10:00:00Z'))
];

const manifest = JSON.parse(JSON.stringify(buildLightroomManifest(entries, { generatedAt: '2026-11-22T12:00:00Z' })));

assert.equal(manifest.schema, 'clustr.export/1');
assert.equal(manifest.root, 'Clustr 2026-11-22');
assert.equal(manifest.generatedAt, '2026-11-22T12:00:00.000Z');
assert.equal(manifest.photoCount, 5);
assert.deepEqual(manifest.sets, [['Trip 3 - Praha']]);

const collectionPaths = manifest.collections.map((collection) => collection.path.join(' > '));
assert.deepEqual(collectionPaths, [
    'Trip 3 - Praha > Stop 1 - Staré Město',
    'Trip 3 - Praha > All photos',
    'Trip 3 - Praha > Stop 2 - "Karlův most"',
    'Home 1',
    'Screenshot-Clutter'
], `unexpected collection tree: ${JSON.stringify(collectionPaths)}`);

const tripCollection = manifest.collections.find((collection) => collection.path.join('/') === 'Trip 3 - Praha/All photos');
assert.equal(tripCollection.photos.length, 3, 'trip collection should hold every stop photo');
assert.deepEqual(
    manifest.collections.find((collection) => collection.path.join('/') === 'Trip 3 - Praha/Stop 1 - Staré Město').photos[0],
    { name: 'DSC_7269.NEF', path: 'Trip 3 - Praha/Stop 1 - Staré Město/DSC_7269.NEF' }
);
assert.equal(manifest.photos[0].date, '2026-07-21T17:38:00.000Z');
assert.deepEqual(manifest.photos[0].keywords, ['Praha', 'muzeum']);

// A trip with one stop must not get a duplicate "All photos" collection.
const singleStop = JSON.parse(JSON.stringify(buildLightroomManifest([
    photo('A.NEF', 'Trip 1 - Alone/Stop 1 - Only', 'X', [], new Date('2026-01-01T10:00:00Z'))
], { generatedAt: '2026-11-22T12:00:00Z' })));
assert.deepEqual(singleStop.collections.map((collection) => collection.path.join(' > ')), ['Trip 1 - Alone > Stop 1 - Only']);

// --- Decode that same manifest with the plug-in's Lua JSON decoder -------------
assert.ok(/^local Json = \{\}/m.test(pluginSource), 'Json decoder table not found in the plug-in');

const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);

// `import 'LrApplication'` and friends: memoized empty tables, the test only
// exercises the JSON decoder plus the shape of the manifest.
const prelude = `
local modules = {}
function import(name)
    if not modules[name] then modules[name] = {} end
    return modules[name]
end
import('LrTasks').startAsyncTask = function() end
`;
let preludeOk = lauxlib.luaL_loadstring(L, to_luastring(prelude)) === 0 && lua.lua_pcall(L, 0, 0, 0) === 0;
assert.ok(preludeOk, 'could not stub the Lightroom SDK');

// Run the plug-in chunk, then hand back its private Json table.
const chunk = `${pluginSource}\nreturn Json\n`;
assert.equal(lauxlib.luaL_loadstring(L, to_luastring(chunk)), 0, 'plug-in did not compile');
const runStatus = lua.lua_pcall(L, 0, 1, 0);
assert.equal(runStatus, 0, `plug-in chunk failed to run: ${lua.lua_tostring(L, -1)}`);
assert.equal(lua.lua_type(L, -1), lua.LUA_TTABLE, 'plug-in did not return its Json table');
lua.lua_setglobal(L, to_luastring('ClustrJson'));

const jsonText = JSON.stringify(manifest);
const decodeScript = `
local ok, result = pcall(ClustrJson.decode, MANIFEST_TEXT)
if not ok then error('decode failed: ' .. tostring(result)) end
local function dump(value, out)
    local kind = type(value)
    if kind == 'table' then
        local count = 0
        for _ in pairs(value) do count = count + 1 end
        local isArray = count > 0
        for index = 1, count do
            if value[index] == nil then isArray = false break end
        end
        if count == 0 then
            out[#out + 1] = '[]'
            return
        end
        if isArray then
            out[#out + 1] = '['
            for index = 1, count do
                if index > 1 then out[#out + 1] = ',' end
                dump(value[index], out)
            end
            out[#out + 1] = ']'
        else
            local keys = {}
            for key in pairs(value) do keys[#keys + 1] = key end
            table.sort(keys)
            out[#out + 1] = '{'
            for index, key in ipairs(keys) do
                if index > 1 then out[#out + 1] = ',' end
                out[#out + 1] = string.format('%q', key)
                out[#out + 1] = ':'
                dump(value[key], out)
            end
            out[#out + 1] = '}'
        end
    elseif kind == 'string' then
        out[#out + 1] = string.format('%q', value)
    elseif kind == 'number' then
        out[#out + 1] = string.format('%d', value)
    elseif kind == 'boolean' then
        out[#out + 1] = tostring(value)
    else
        out[#out + 1] = 'null'
    end
end
local out = {}
dump(result, out)
return table.concat(out)
`;
lua.lua_pushstring(L, to_luastring(jsonText));
lua.lua_setglobal(L, to_luastring('MANIFEST_TEXT'));
assert.equal(lauxlib.luaL_loadstring(L, to_luastring(decodeScript)), 0, 'decoder harness did not compile');
assert.equal(lua.lua_pcall(L, 0, 1, 0), 0, 'decoder failed');
const luaDump = to_jsstring(lua.lua_tostring(L, -1));

// Compare canonical forms: sort keys and drop undefined-valued JS keys first.
const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return String(Math.trunc(value));
    if (value === null) return 'null';
    return String(value);
};

assert.equal(
    luaDump,
    canonical(JSON.parse(jsonText)),
    'Lua decoder did not round-trip the manifest'
);

console.log('Lightroom manifest + plug-in decoder: OK');
console.log(`  ${manifest.sets.length} sets, ${manifest.collections.length} collections, ${manifest.photoCount} photos`);
console.log(`  ${decodeScript.length} byte round-trip through the plug-in's Lua decoder (Czech names, quotes, backslashes)`);
