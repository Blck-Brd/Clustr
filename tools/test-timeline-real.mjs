import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timelinePath = path.join(root, 'Timeline.json');

if (!fs.existsSync(timelinePath)) {
    console.log('Timeline.json not found at repository root - skipping real Timeline integration test.');
    process.exit(0);
}

const preApp = fs.readFileSync(path.join(root, 'app', 'core.js'), 'utf8');

const sandbox = {
    console,
    React: { Component: class Component {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    Image: function Image() {},
    document: { createElement: () => ({ getContext: () => ({}) }) },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    exifr: { parse: async () => ({}) }
};
vm.createContext(sandbox);

const helperNames = [
    'normalizeTimelineData', 'prepareTimeline', 'findTimelineMatch', 'resolveTimelineEntry',
    'findNearestNamedTimelineLocation', 'extractPhotoMetadata', 'buildTripSettings', 'buildHierarchicalEvents',
    'roundedCoordKey', 'normalizeLocationName'
];
vm.runInContext(`${preApp}\n;globalThis.__helpers = { ${helperNames.join(', ')} };`, sandbox);
const h = sandbox.__helpers;

const raw = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const items = Array.isArray(raw) ? raw : (raw.timelineObjects || raw.semanticSegments || []);
const entries = h.normalizeTimelineData(items);
assert.ok(entries.length > 0, 'Timeline should contain entries');

const counts = entries.reduce((accumulator, entry) => {
    accumulator[entry.kind] = (accumulator[entry.kind] || 0) + 1;
    return accumulator;
}, {});
console.log('Real Timeline entries:', entries.length, counts);

const sorted = h.prepareTimeline(entries);
const sample = entries.filter((_, index) => index % Math.max(1, Math.floor(entries.length / 40)) === 0);
let resolvedWithLocation = 0;

sample.forEach((entry) => {
    const timestamp = entry.start + ((entry.end || entry.start) - entry.start) / 2;
    const match = h.findTimelineMatch(sorted, timestamp);
    assert.ok(match, 'Every sampled timestamp should match a Timeline segment');
    const resolved = h.resolveTimelineEntry(match, timestamp, 'Praha');
    if (resolved && (resolved.name || resolved.coords)) resolvedWithLocation += 1;
});
assert.ok(resolvedWithLocation >= Math.floor(sample.length * 0.9), 'Most sampled Timeline entries should resolve a name or coordinates');
console.log(`Timeline match/resolve: ${resolvedWithLocation}/${sample.length}`);

const homeEntry = entries.find((entry) => entry.kind === 'visit' && entry.semanticType === 'HOME' && entry.coords);
if (homeEntry) {
    const timestamp = homeEntry.start + ((homeEntry.end || homeEntry.start) - homeEntry.start) / 2;
    const meta = await h.extractPhotoMetadata(
        { id: 'home-test', name: 'no-gps-home.jpg', date: new Date(timestamp), hardData: {}, aiData: {}, file: {} },
        sorted,
        'Praha'
    );
    assert.equal(meta.location, 'Praha');
    assert.ok(meta.coords && Number.isFinite(meta.coords.lat));
    assert.ok(meta.locationKey);
    assert.notEqual(meta.locationSource, 'unknown');

    // An unnamed segment near HOME inherits the nearest named Timeline location.
    const nearbyCoords = { lat: homeEntry.coords.lat + 0.01, lon: homeEntry.coords.lon + 0.01 };
    const nearest = h.findNearestNamedTimelineLocation(sorted, nearbyCoords, 'Praha');
    assert.ok(nearest, 'Nearby HOME should provide a nearest named location');
    assert.equal(nearest.name, 'Praha');

    const unnamedNearHome = {
        kind: 'visit',
        name: '',
        coords: nearbyCoords,
        start: (homeEntry.end || homeEntry.start) + 3600000,
        end: (homeEntry.end || homeEntry.start) + 7200000,
        semanticType: 'UNKNOWN'
    };
    const syntheticTimeline = h.prepareTimeline([homeEntry, unnamedNearHome]);
    const nearestMeta = await h.extractPhotoMetadata(
        { id: 'nearest-home-test', name: 'no-gps-nearest.jpg', date: new Date(unnamedNearHome.start + 1800000), hardData: {}, aiData: {}, file: {} },
        syntheticTimeline,
        'Praha'
    );
    assert.equal(nearestMeta.location, 'Praha');
    assert.ok(['home', 'timeline-near'].includes(nearestMeta.locationSource));
}

const workEntry = entries.find((entry) => entry.kind === 'visit' && entry.semanticType === 'WORK' && entry.coords);
if (workEntry) {
    const timestamp = workEntry.start + ((workEntry.end || workEntry.start) - workEntry.start) / 2;
    const meta = await h.extractPhotoMetadata(
        { id: 'work-test', name: 'no-gps-work.jpg', date: new Date(timestamp), hardData: {}, aiData: {}, file: {} },
        sorted,
        'Praha'
    );
    assert.equal(meta.location, 'Práce');
    assert.ok(meta.coords && Number.isFinite(meta.coords.lat));
}

// Build one synthetic photo per real Timeline segment and run the full hierarchical pipeline.
const syntheticPhotos = entries.map((entry, index) => {
    const timestamp = entry.start + ((entry.end || entry.start) - entry.start) / 2;
    const resolved = h.resolveTimelineEntry(entry, timestamp, 'Praha');
    const coords = resolved?.coords || null;
    const location = resolved?.name || 'Neznámé místo';
    const locationKey = coords
        ? h.roundedCoordKey(coords, 1)
        : (location !== 'Neznámé místo' ? h.normalizeLocationName(location) : '');
    return {
        id: `real-${index}`,
        name: `real-${index}.jpg`,
        date: new Date(timestamp),
        hardData: {
            location,
            locationKey,
            coords,
            locationSource: resolved?.semanticType === 'HOME' ? 'home' : 'timeline',
            dateStr: '',
            timeStr: '',
            camera: 'timeline'
        },
        aiData: { tags: [], event_name: '' }
    };
});

assert.equal(syntheticPhotos.length, entries.length);
const hierarchy = h.buildHierarchicalEvents(syntheticPhotos, 'Praha', h.buildTripSettings());
assert.ok(hierarchy.groups.length > 0);

const assigned = new Set();
hierarchy.groups.forEach((group) => {
    assert.ok(group.photos.length > 0, 'No event group should be empty');
    group.photos.forEach((photo) => assigned.add(photo.id));
});
assert.equal(assigned.size, syntheticPhotos.length, 'Every Timeline-derived photo must be assigned exactly once');

console.log('Timeline-derived hierarchy:', {
    trips: hierarchy.tripCount,
    stops: hierarchy.stopCount,
    homeSessions: hierarchy.homeSessionCount,
    extras: hierarchy.extraCount,
    groups: hierarchy.groups.length
});

console.log('Real Timeline integration test passed.');
