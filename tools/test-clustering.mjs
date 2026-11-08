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
    'clusterPhotosByDensity', 'computeAutoClusterSettings', 'buildClusterSettings', 'applyDominantClusterLocation',
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

// Density-based clustering: two dense bursts separated by a drive must stay separate.
const withCoords = (time, location, locationKey, coords) => {
    const item = photo(time, location, locationKey);
    item.hardData.coords = coords;
    return item;
};
const at = (time, location, key, lat, lon) => withCoords(time, location, key, { lat, lon });

const pragueBurst = [0, 20, 40, 60, 80, 100].map((minute) => at(
    t0 + minute * 60000,
    'Praha',
    'prague',
    50.080 + (minute % 3) * 0.002,
    14.430 + (minute % 2) * 0.002
));
// Sparse photos taken during the drive. Only two, so they are noise and must attach to
// the nearest dense event instead of forming their own cluster.
const drivePhotos = [
    at(t0 + 150 * 60000, 'Neznámé místo', '', 50.030, 14.600),
    at(t0 + 210 * 60000, 'Neznámé místo', '', 50.010, 14.900)
];
const kutnaBurst = [0, 20, 40, 60, 80, 100].map((minute) => at(
    t0 + 260 * 60000 + minute * 60000,
    'Kutná Hora',
    'kutna',
    49.950 + (minute % 3) * 0.002,
    15.270 + (minute % 2) * 0.002
));

const vacationPhotos = [...pragueBurst, ...drivePhotos, ...kutnaBurst];
const vacationClusters = h.clusterPhotosByDensity(vacationPhotos);

assert.equal(vacationClusters.length, 2, 'dense stops should not merge across a drive');
assert.deepEqual(Array.from(vacationClusters, (cluster) => cluster.length).sort((a, b) => a - b), [7, 7]);
assert.equal(vacationClusters.reduce((sum, cluster) => sum + cluster.length, 0), vacationPhotos.length);

vacationClusters.forEach((cluster) => h.applyDominantClusterLocation(cluster));
const vacationLocations = Array.from(vacationClusters, (cluster) => cluster[0].hardData.location).sort();
assert.deepEqual(vacationLocations, ['Kutná Hora', 'Praha']);

// Two days at the same place with an overnight gap are separate events.
const overnightPhotos = [
    ... [0, 20, 40].map((minute) => at(t0 + minute * 60000, 'Praha', 'prague', 50.08, 14.43)),
    ... [0, 20, 40].map((minute) => at(t0 + 12 * 3600000 + minute * 60000, 'Praha', 'prague', 50.08, 14.43))
];
const overnightClusters = h.clusterPhotosByDensity(overnightPhotos);
assert.equal(overnightClusters.length, 2, 'overnight gap should split density clusters');

// Same place, short break: merge. Same time gap but a different place: keep separate.
// Auto sensitivity adapts to the dataset, manual settings are clamped.
const denseForAuto = [0, 10, 20, 30, 40, 50].map((minute) => at(t0 + minute * 60000, 'Praha', 'prague', 50.08, 14.43));
const sparseForAuto = [0, 120, 240, 360].map((minute) => at(t0 + minute * 60000, 'Praha', 'prague', 50.08, 14.43));
const denseAuto = h.computeAutoClusterSettings(denseForAuto);
const sparseAuto = h.computeAutoClusterSettings(sparseForAuto);
assert.ok(denseAuto.epsTimeHours >= 0.75 && denseAuto.epsTimeHours <= 3);
assert.ok(denseAuto.epsSpaceKm >= 2 && denseAuto.epsSpaceKm <= 10);
assert.ok(sparseAuto.epsTimeHours >= denseAuto.epsTimeHours);
assert.equal(denseAuto.minPoints, 3);

const manualSettings = h.buildClusterSettings({ epsTimeHours: 0.5, epsSpaceKm: 2, minPoints: 2 });
assert.equal(manualSettings.epsTimeHours, 0.5);
assert.equal(manualSettings.epsSpaceKm, 2);
assert.equal(manualSettings.minPoints, 2);
assert.ok(manualSettings.splitGapHours >= 2);
assert.ok(manualSettings.splitJumpKm >= 2);

const morningAtSamePlace = [0, 10, 20].map((minute) => at(t0 + minute * 60000, 'Praha', 'prague', 50.08, 14.43));
const afternoonAtSamePlace = [130, 140, 150].map((minute) => at(t0 + minute * 60000, 'Praha', 'prague', 50.0805, 14.4305));
assert.equal(h.clusterPhotosByDensity([...morningAtSamePlace, ...afternoonAtSamePlace]).length, 1);

const afternoonElsewhere = [130, 140, 150].map((minute) => at(t0 + minute * 60000, 'Kutná Hora', 'kutna', 49.95, 15.27));
assert.equal(h.clusterPhotosByDensity([...morningAtSamePlace, ...afternoonElsewhere]).length, 2);

assert.equal(h.buildPlaceholderEventName(0, 'Praha'), 'Event 1 - Praha');
assert.equal(h.buildPlaceholderEventName(2, 'Neznámé místo'), 'Event 3');
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
