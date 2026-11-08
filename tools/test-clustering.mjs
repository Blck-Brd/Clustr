import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const marker = '<script type="text/babel">';
const start = html.indexOf(marker);
const end = html.indexOf('</script>', start);
assert.ok(start !== -1 && end !== -1, 'Babel script not found');

const script = html.slice(start + marker.length, end);
const appStart = script.indexOf('const App = () =>');
assert.ok(appStart !== -1, 'App component marker not found');
const preApp = script.slice(0, appStart);

const sandbox = {
    console,
    React: {},
    localStorage: { getItem: () => null, setItem: () => {} },
    Image: function Image() {},
    document: { createElement: () => ({ getContext: () => ({}) }) },
    fetch: async () => ({ ok: false, json: async () => ({}) })
};
vm.createContext(sandbox);

const helperNames = [
    'parseCoords', 'parseTimelinePoint', 'normalizeTimelineData', 'prepareTimeline',
    'findTimelineMatch', 'resolveTimelineEntry', 'normalizeLocationName',
    'clusterPhotosByTimeAndLocation', 'applyDominantClusterLocation',
    'interpolateMissingLocations', 'findLocationInheritanceTargets',
    'buildPlaceholderEventName', 'mergePhotoTags', 'buildAutoTags', 'isLikelyScreenshot',
    'roundedCoordKey', 'distanceKm'
];

vm.runInContext(
    `${preApp}\n;globalThis.__helpers = { ${helperNames.join(', ')} };`,
    sandbox
);
const h = sandbox.__helpers;

const t0 = new Date('2025-07-01T10:00:00').getTime();
const iso = (ms) => new Date(ms).toISOString();

const photo = (time, location, locationKey, extra = {}) => ({
    id: Math.random().toString(36).slice(2),
    name: 'photo.jpg',
    date: new Date(time),
    hardData: {
        location,
        locationKey,
        dateStr: new Date(time).toLocaleDateString('cs-CZ'),
        timeStr: new Date(time).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        camera: 'Nikon'
    },
    aiData: { tags: [], event_name: '', ...(extra.aiData || {}) },
    ...extra
});

// Coordinate parsing (vm objects have a different prototype, so compare values)
const samePoint = (actual, lat, lon) => {
    assert.equal(actual.lat, lat);
    assert.equal(actual.lon, lon);
};
samePoint(h.parseCoords('50.08,14.43'), 50.08, 14.43);
samePoint(h.parseTimelinePoint('geo:50.08,14.43'), 50.08, 14.43);
samePoint(h.parseTimelinePoint('50.08, 14.43'), 50.08, 14.43);
assert.equal(h.roundedCoordKey({ lat: 50.081, lon: 14.437 }, 1), 'geo:50.1,14.4');

// Timeline normalization: visits, activities and paths
const rawTimeline = [
    {
        startTime: iso(t0),
        endTime: iso(t0 + 3600000),
        visit: { topCandidate: { semanticType: 'UNKNOWN', placeLocation: 'geo:50.08,14.43' } }
    },
    {
        startTime: iso(t0 + 3600000),
        endTime: iso(t0 + 7200000),
        activity: { start: 'geo:50.08,14.43', end: 'geo:49.95,15.27', topCandidate: { type: 'WALKING' } }
    },
    {
        startTime: iso(t0 + 7200000),
        endTime: iso(t0 + 10800000),
        timelinePath: [
            { point: '50.08, 14.43', durationMinutesOffsetFromStartTime: '0' },
            { point: '49.95, 15.27', durationMinutesOffsetFromStartTime: '60' }
        ]
    },
    {
        startTime: iso(t0 + 10800000),
        endTime: iso(t0 + 14400000),
        visit: { topCandidate: { semanticType: 'HOME', placeLocation: 'geo:50.10,14.40' } }
    }
];

const entries = h.normalizeTimelineData(rawTimeline);
assert.equal(entries.length, 4);
assert.deepEqual(Array.from(entries, (entry) => entry.kind), ['visit', 'activity', 'path', 'visit']);
assert.equal(entries[0].coords.lat, 50.08);
assert.equal(entries[2].points.length, 2);

const homeEntry = entries[3];
assert.equal(h.resolveTimelineEntry(homeEntry, t0 + 12000000, '').name, 'Doma');
assert.equal(h.resolveTimelineEntry(homeEntry, t0 + 12000000, 'Praha').name, 'Praha');

const pathResolution = h.resolveTimelineEntry(entries[2], t0 + 10800000, '');
assert.equal(pathResolution.coords.lat, 49.95);

const match = h.findTimelineMatch(h.prepareTimeline(entries), t0 + 1200000);
assert.ok(match, 'Timeline match should exist');
assert.equal(match.kind, 'visit');

// Clustering by time and location
const photos = [
    photo(t0, 'Praha', 'geo:50.1,14.4'),
    photo(t0 + 3600000, 'Praha', 'geo:50.1,14.4'),
    photo(t0 + 3 * 3600000, 'Kutná Hora', 'geo:50.0,15.3'),
    photo(t0 + 4 * 3600000, 'Kutná Hora', 'geo:50.0,15.3'),
    photo(t0 + 10 * 3600000, 'Kutná Hora', 'geo:50.0,15.3'),
    photo(t0 + 40 * 3600000, 'Kutná Hora', 'geo:50.0,15.3'),
    photo(t0 + 41 * 3600000, 'Neznámé místo', '')
];

const clusters = h.clusterPhotosByTimeAndLocation(photos);
assert.equal(clusters.length, 3);
assert.deepEqual(Array.from(clusters, (cluster) => cluster.length), [2, 3, 2]);

const dominant = h.applyDominantClusterLocation(clusters[2]);
assert.equal(dominant.location, 'Kutná Hora');
assert.equal(clusters[2][1].hardData.location, 'Kutná Hora');
assert.equal(clusters[2][1].hardData.locationSource, 'cluster');

assert.equal(h.buildPlaceholderEventName(0, 'Praha'), 'Event 1 - Praha');
assert.equal(h.buildPlaceholderEventName(2, 'Neznámé místo'), 'Event 3');

// Distance-based location grouping (same rounded key/name but far apart must split)
const withCoords = (time, location, locationKey, coords) => {
    const item = photo(time, location, locationKey);
    item.hardData.coords = coords;
    return item;
};
const distancePhotos = [
    withCoords(t0, 'Praha', 'geo:50.1,14.4', { lat: 50.08, lon: 14.43 }),
    withCoords(t0 + 3600000, 'Praha', 'geo:50.1,14.4', { lat: 50.12, lon: 14.50 }),
    withCoords(t0 + 7200000, 'Praha', 'geo:50.1,14.4', { lat: 49.95, lon: 15.27 })
];
const distanceClusters = h.clusterPhotosByTimeAndLocation(distancePhotos);
assert.equal(distanceClusters.length, 2);
assert.deepEqual(Array.from(distanceClusters, (cluster) => cluster.length), [2, 1]);
assert.ok(h.distanceKm({ lat: 50.08, lon: 14.43 }, { lat: 49.95, lon: 15.27 }) > 15);

// Missing-location interpolation (nearest known location within the window)
const interpolationPhotos = [
    photo(t0, 'Praha', 'geo:50.1,14.4'),
    photo(t0 + 2 * 3600000, 'Neznámé místo', ''),
    photo(t0 + 20 * 3600000, 'Neznámé místo', ''),
    photo(t0 + 22 * 3600000, 'Kutná Hora', 'geo:50.0,15.3')
];
h.interpolateMissingLocations(interpolationPhotos);
assert.equal(interpolationPhotos[1].hardData.location, 'Praha');
assert.equal(interpolationPhotos[1].hardData.locationSource, 'interpolated');
assert.equal(interpolationPhotos[2].hardData.location, 'Kutná Hora');
assert.ok(interpolationPhotos[1].aiData.tags.includes('Praha'));

// Nearby photos without their own location inherit a manually added one
const inheritancePhotos = [
    photo(t0, 'Praha', 'geo:50.1,14.4'),
    photo(t0 + 1 * 3600000, 'Neznámé místo', ''),
    photo(t0 + 2 * 3600000, 'Kutná Hora', 'geo:50.0,15.3'),
    photo(t0 + 30 * 3600000, 'Neznámé místo', '')
];
const inheritanceTargets = h.findLocationInheritanceTargets(
    inheritancePhotos,
    new Set([inheritancePhotos[0].id]),
    12 * 3600000
);
assert.ok(inheritanceTargets.has(inheritancePhotos[1].id));
assert.ok(!inheritanceTargets.has(inheritancePhotos[2].id));
assert.ok(!inheritanceTargets.has(inheritancePhotos[3].id));

// Tags
assert.equal(h.normalizeLocationName('Kutná Hora'), 'kutna hora');
const tags = h.mergePhotoTags(['Jaro', 'Praha', 'cat', 'Neznámé místo'], ['Léto', 'Den', 'Praha'], 'Praha');
assert.ok(tags.includes('cat'));
assert.ok(tags.includes('Léto'));
assert.ok(tags.includes('Den'));
assert.ok(!tags.includes('Jaro'));
assert.ok(!tags.includes('Neznámé místo'));

assert.equal(h.isLikelyScreenshot({ name: 'Screenshot_2025.png', aiData: {} }), true);
assert.equal(h.isLikelyScreenshot({ name: 'DSC_0001.jpg', aiData: {} }), false);

console.log('All clustering/Timeline helper tests passed.');
