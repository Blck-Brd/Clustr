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

const fetchStats = { calls: 0 };
const sandbox = {
    console,
    React: { Component: class Component {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    Image: function Image() {},
    document: { createElement: () => ({ getContext: () => ({}) }) },
    fetch: async () => { fetchStats.calls += 1; return { ok: false, json: async () => ({}) }; },
    exifr: { parse: async () => ({}) }
};
vm.createContext(sandbox);

const helperNames = [
    'parseCoords', 'parseTimelinePoint', 'normalizeTimelineData', 'prepareTimeline',
    'findTimelineMatch', 'resolveTimelineEntry', 'findNearestNamedTimelineLocation', 'normalizeLocationName',
    'clusterPhotosByDensity', 'computeAutoClusterSettings', 'buildClusterSettings', 'applyDominantClusterLocation',
    'interpolateMissingLocations', 'findLocationInheritanceTargets',
    'buildPlaceholderEventName', 'buildPlaceholderStopName', 'buildEventNameForNaming', 'buildManualEventAiData', 'buildGroupPlaceholderName', 'mergePhotoTags', 'buildAutoTags', 'isLikelyScreenshot',
    'roundedCoordKey', 'distanceKm', 'extractPhotoMetadata', 'dedupeFilesBySignature',
    'buildTripSettings', 'computeAutoTripSettings', 'inferHomeReference', 'isHomePhoto',
    'clusterPhotosIntoTrips', 'buildHierarchicalEvents', 'RANDOM_FOLDER', 'RANDOM_CATEGORY'
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


// Locations are derived from Timeline, not EXIF GPS.
const timelineOnlyEntry = {
    kind: 'visit',
    name: 'Praha',
    coords: { lat: 50.08, lon: 14.43 },
    start: t0,
    end: t0 + 3600000,
    semanticType: 'UNKNOWN'
};
const timelineOnlyMeta = await h.extractPhotoMetadata(
    { id: 'timeline-only', name: 'no-gps.jpg', date: new Date(t0 + 1800000), hardData: {}, aiData: {}, file: {} },
    [timelineOnlyEntry],
    ''
);
assert.equal(timelineOnlyMeta.location, 'Praha');
assert.equal(timelineOnlyMeta.coords.lat, 50.08);
assert.equal(timelineOnlyMeta.locationSource, 'timeline');
assert.ok(timelineOnlyMeta.locationKey);

// Broken camera dates (e.g. 1899/0000) fall back to the file date.
const invalidDateMeta = await h.extractPhotoMetadata(
    { id: 'bad-date', name: 'bad-date.jpg', date: new Date('2020-06-01T10:00:00'), hardData: {}, aiData: {}, file: { lastModified: new Date('2020-06-01T10:00:00').getTime() } },
    [],
    '',
    { DateTimeOriginal: '1899:12:31 23:59:59' }
);
assert.equal(invalidDateMeta.date.getFullYear(), 2020);

// Manual locations survive Phase 2 even when the Timeline says something else.
const manualLocationMeta = await h.extractPhotoMetadata(
    {
        id: 'manual-location',
        name: 'manual-location.jpg',
        date: new Date(t0),
        hardData: { location: 'Praha', locationKey: 'praha', locationSource: 'manual', coords: null },
        aiData: { tags: [] },
        file: {}
    },
    [{ ...timelineOnlyEntry, name: 'Brno' }],
    ''
);
assert.equal(manualLocationMeta.location, 'Praha');
assert.equal(manualLocationMeta.locationSource, 'manual');

// A flat trip keeps its location suffix in the placeholder name.
assert.equal(h.buildGroupPlaceholderName({ eventKind: 'trip', eventName: 'Trip 1' }, 0, 'Pag'), 'Trip 1 - Pag');
assert.equal(h.buildGroupPlaceholderName({ eventKind: 'trip-stop', eventName: 'Trip 1/Stop 1' }, 0, 'Pag'), 'Trip 1/Stop 1');

// One vacation with 1289 photos should become ONE trip (with stop subfolders).
const vacationStart = new Date('2026-06-01T09:00:00').getTime();
const vacationPlaces = [
    { name: 'Praha', lat: 50.08, lon: 14.43 },
    { name: 'Kutná Hora', lat: 49.95, lon: 15.27 },
    { name: 'Český Krumlov', lat: 48.81, lon: 14.32 }
];
const oneWeekPhotos = [];
for (let day = 0; day < 7; day += 1) {
    const place = vacationPlaces[day % vacationPlaces.length];
    const dayStart = vacationStart + day * 86400000;
    for (let i = 0; i < 184; i += 1) {
        oneWeekPhotos.push(withCoords(
            dayStart + (i / 184) * 8 * 3600000,
            place.name,
            'key-' + place.name,
            { lat: place.lat + (i % 5) * 0.0004, lon: place.lon + (i % 7) * 0.0004 }
        ));
    }
}
oneWeekPhotos.push(withCoords(vacationStart + 7 * 86400000, 'Praha', 'key-Praha', { lat: 50.08, lon: 14.43 }));
assert.equal(oneWeekPhotos.length, 1289);

const oneWeekHierarchy = h.buildHierarchicalEvents(oneWeekPhotos, '', h.buildTripSettings());
assert.equal(oneWeekHierarchy.tripCount, 1);
assert.equal(oneWeekHierarchy.homeSessionCount, 0);
assert.ok(oneWeekHierarchy.stopCount >= 3);
assert.ok(Array.from(oneWeekHierarchy.groups, (group) => group.eventName).every((name) => name.startsWith('Trip 1/')));

// Six months: two one-week vacations, three weekend trips and home sessions.
const sixStart = new Date('2026-01-01T08:00:00').getTime();
const homeCoords = { lat: 50.08, lon: 14.43 };
const homeDayList = [
    0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
    28, 30, 32, 34, 36, 38, 40, 42, 44, 46,
    70, 72, 74, 76, 78, 80, 82, 84, 86, 88,
    110, 112, 114, 116, 118, 120, 122, 124, 126, 128
];
const homePhotos = [];
homeDayList.forEach((day) => {
    for (let i = 0; i < 10; i += 1) {
        homePhotos.push(withCoords(
            sixStart + day * 86400000 + 18 * 3600000 + i * 5 * 60000,
            'Doma',
            'home',
            { lat: homeCoords.lat + (i % 3) * 0.0003, lon: homeCoords.lon + (i % 2) * 0.0003 }
        ));
    }
});

const tripPhotos = [];
const addVacation = (startDay, lat, lon, label) => {
    for (let day = 0; day < 7; day += 1) {
        for (let i = 0; i < 50; i += 1) {
            tripPhotos.push(withCoords(
                sixStart + (startDay + day) * 86400000 + 9 * 3600000 + i * 10 * 60000,
                label,
                'key-' + label,
                { lat: lat + (i % 5) * 0.0004, lon: lon + (i % 7) * 0.0004 }
            ));
        }
    }
};
const addWeekend = (startDay, lat, lon, label) => {
    for (let day = 0; day < 2; day += 1) {
        for (let i = 0; i < 30; i += 1) {
            tripPhotos.push(withCoords(
                sixStart + (startDay + day) * 86400000 + 10 * 3600000 + i * 10 * 60000,
                label,
                'key-' + label,
                { lat: lat + (i % 4) * 0.0004, lon: lon + (i % 6) * 0.0004 }
            ));
        }
    }
};
addVacation(20, 48.5, 12.5, 'Dovolená A');
addVacation(100, 49.0, 16.0, 'Dovolená B');
addWeekend(50, 49.7, 13.3, 'Víkend A');
addWeekend(60, 50.6, 15.6, 'Víkend B');
addWeekend(130, 48.9, 14.1, 'Víkend C');

const sixMonths = h.buildHierarchicalEvents([...homePhotos, ...tripPhotos], '', h.buildTripSettings());
assert.equal(sixMonths.tripCount, 5);
assert.equal(sixMonths.homeSessionCount, homeDayList.length);
assert.ok(sixMonths.stopCount >= sixMonths.tripCount);
assert.equal(sixMonths.extraCount, 0);

const homeIds = new Set(homePhotos.map((photo) => photo.id));
const tripIds = new Set(tripPhotos.map((photo) => photo.id));
const homeGroupPhotos = sixMonths.groups.filter((group) => group.eventName.startsWith('Home ')).flatMap((group) => group.photos);
const tripGroupPhotos = sixMonths.groups.filter((group) => group.eventName.startsWith('Trip ')).flatMap((group) => group.photos);
assert.equal(homeGroupPhotos.length, homePhotos.length);
assert.equal(tripGroupPhotos.length, tripPhotos.length);
assert.ok(homeGroupPhotos.every((photo) => homeIds.has(photo.id)));
assert.ok(tripGroupPhotos.every((photo) => tripIds.has(photo.id)));

// Photos with Timeline coordinates but no resolved place name still take part in trips/stops.
const coordsOnlyPhotos = [0, 10, 20].map((minute) => {
    const item = withCoords(t0 + minute * 60000, 'Neznámé místo', '', { lat: 50.08, lon: 14.43 });
    return item;
});
const coordsOnlyHierarchy = h.buildHierarchicalEvents(coordsOnlyPhotos, '', h.buildTripSettings());
assert.equal(coordsOnlyHierarchy.tripCount, 1);
assert.ok(Array.from(coordsOnlyHierarchy.groups, (group) => group.eventName).every((name) => name.startsWith('Trip 1/')));

// AI naming can replace either the trip folder or the stop leaf.
assert.equal(
    h.buildEventNameForNaming('Trip 1/Stop 1 - Praha', 'Dovolená Itálie', 'trips'),
    'Dovolená Itálie/Stop 1 - Praha'
);
assert.equal(
    h.buildEventNameForNaming('Trip 1/Stop 1 - Praha', 'Staroměstské náměstí', 'stops'),
    'Trip 1/Staroměstské náměstí'
);
assert.equal(h.buildEventNameForNaming('Home 1', 'Oslava narozenin', 'trips'), 'Oslava narozenin');
assert.equal(h.buildEventNameForNaming('Event 1', 'Výlet', 'stops'), 'Výlet');

// Unnamed Timeline coordinates resolve to the nearest named Timeline location.
const namedTimeline = h.prepareTimeline([
    { kind: 'visit', name: 'Praha', coords: { lat: 50.08, lon: 14.43 }, start: t0, end: t0 + 3600000, semanticType: 'UNKNOWN' },
    { kind: 'visit', name: '', coords: { lat: 50.10, lon: 14.45 }, start: t0 + 7200000, end: t0 + 10800000, semanticType: 'UNKNOWN' }
]);
const nearestNamed = h.findNearestNamedTimelineLocation(namedTimeline, { lat: 50.10, lon: 14.45 }, '');
assert.ok(nearestNamed);
assert.equal(nearestNamed.name, 'Praha');
assert.equal(h.findNearestNamedTimelineLocation(namedTimeline, { lat: 49.0, lon: 13.0 }, ''), null);

const homeTimeline = h.prepareTimeline([
    { kind: 'visit', name: '', coords: { lat: 50.08, lon: 14.43 }, start: t0, end: t0 + 3600000, semanticType: 'HOME' }
]);
assert.equal(h.findNearestNamedTimelineLocation(homeTimeline, { lat: 50.085, lon: 14.435 }, '').name, 'Doma');
assert.equal(h.findNearestNamedTimelineLocation(homeTimeline, { lat: 50.085, lon: 14.435 }, 'Praha').name, 'Praha');

const beforeFetch = fetchStats.calls;
const nearestMeta = await h.extractPhotoMetadata(
    { id: 'nearest-test', name: 'nearest.jpg', date: new Date(t0 + 9000000), hardData: {}, aiData: {}, file: {} },
    namedTimeline,
    ''
);
assert.equal(nearestMeta.location, 'Praha');
assert.equal(nearestMeta.locationSource, 'timeline-near');
assert.equal(fetchStats.calls, beforeFetch, 'Nearest named Timeline lookup must not call Nominatim');

// Czech screenshots and location-less clutter are routed to the Screenshot-Clutter folder.
assert.equal(h.isLikelyScreenshot({ name: 'Snímek obrazovky 2026-11-06 160029.png', hardData: { camera: 'Nikon', location: 'Praha', coords: { lat: 50, lon: 14 } }, aiData: {} }), true);
assert.equal(h.isLikelyScreenshot({ name: 'random-image.png', hardData: { camera: 'Neznámý fotoaparát', location: 'Neznámé místo' }, aiData: {} }), true);
assert.equal(h.isLikelyScreenshot({ name: 'DSC_0001.jpg', hardData: { camera: 'Nikon', location: 'Praha', coords: { lat: 50, lon: 14 } }, aiData: {} }), false);

// A location-less 7-day vacation must become one flat trip folder, not many time events.
const noLocationVacation = [];
for (let day = 0; day < 7; day += 1) {
    for (let i = 0; i < 35; i += 1) {
        noLocationVacation.push(photo(
            vacationStart + day * 86400000 + 9 * 3600000 + i * 10 * 60000,
            'Neznámé místo',
            ''
        ));
    }
}
const noLocationHierarchy = h.buildHierarchicalEvents(noLocationVacation, '', h.buildTripSettings());
assert.equal(noLocationHierarchy.tripCount, 1);
assert.equal(noLocationHierarchy.stopCount, 0);
assert.equal(noLocationHierarchy.groups.length, 1);
assert.equal(noLocationHierarchy.groups[0].eventName, 'Trip 1');
assert.equal(noLocationHierarchy.groups[0].photos.length, noLocationVacation.length);

// A manual location without coordinates keeps the trip flat (no fake per-day stops).
noLocationVacation.forEach((item) => {
    item.hardData.location = 'Pag';
    item.hardData.locationKey = 'pag';
    item.hardData.locationSource = 'manual';
});
const manualLocationTrip = h.buildHierarchicalEvents(noLocationVacation, '', h.buildTripSettings());
assert.equal(manualLocationTrip.tripCount, 1);
assert.equal(manualLocationTrip.stopCount, 0);
assert.equal(manualLocationTrip.groups.length, 1);
assert.equal(manualLocationTrip.groups[0].eventName, 'Trip 1');

// A long event split into density episodes still becomes one parent trip.
const parentTripPhotos = [];
for (let day = 0; day < 3; day += 1) {
    for (let i = 0; i < 10; i += 1) parentTripPhotos.push(photo(vacationStart + day * 86400000 + 10 * 3600000 + i * 60000, 'Neznámé místo', ''));
}
for (let day = 6; day < 9; day += 1) {
    for (let i = 0; i < 10; i += 1) parentTripPhotos.push(photo(vacationStart + day * 86400000 + 10 * 3600000 + i * 60000, 'Neznámé místo', ''));
}
const parentTripHierarchy = h.buildHierarchicalEvents(parentTripPhotos, '', h.buildTripSettings());
assert.equal(parentTripHierarchy.tripCount, 1, 'Nearby density episodes should share one parent trip');
assert.equal(parentTripHierarchy.groups.length, 1);

// A long gap separates two parent trips.
const splitTripPhotos = [];
for (let day = 0; day < 3; day += 1) {
    for (let i = 0; i < 10; i += 1) splitTripPhotos.push(photo(vacationStart + day * 86400000 + 10 * 3600000 + i * 60000, 'Neznámé místo', ''));
}
for (let day = 14; day < 17; day += 1) {
    for (let i = 0; i < 10; i += 1) splitTripPhotos.push(photo(vacationStart + day * 86400000 + 10 * 3600000 + i * 60000, 'Neznámé místo', ''));
}
const splitHierarchy = h.buildHierarchicalEvents(splitTripPhotos, '', h.buildTripSettings());
assert.equal(splitHierarchy.tripCount, 2, 'A multi-day gap should separate parent trips');

// Heatmap mode uses a short parent gap so every visible burst becomes its own cluster.
const burstPhotos = [];
for (const day of [0, 10, 20, 30, 40]) {
    for (let i = 0; i < 10; i += 1) {
        burstPhotos.push(photo(vacationStart + day * 86400000 + 10 * 3600000 + i * 60000, 'Neznámé místo', ''));
    }
}
const burstHierarchy = h.buildHierarchicalEvents(burstPhotos, '', h.buildTripSettings({ parentTripGapHours: 12 }));
assert.equal(burstHierarchy.tripCount, 5, 'Each heatmap burst should become its own cluster');
assert.equal(burstHierarchy.groups.filter((group) => group.eventKind === 'trip').length, 5);

// Manual event edits must never detach a stop from its trip or leave a photo in two events.
const stopAiData = {
    event_name: 'Trip 1/Stop 1 - Praha',
    eventKind: 'trip-stop',
    clusterId: 'stop-1',
    tripId: 'trip-1',
    clusterNumber: 1,
    tripNumber: 1,
    stopNumber: 1,
    eventNameSource: 'placeholder'
};
const renamedStop = h.buildManualEventAiData(stopAiData, 'Karlův most');
assert.equal(renamedStop.event_name, 'Trip 1/Karlův most');
assert.equal(renamedStop.clusterId, 'stop-1');
assert.equal(renamedStop.tripId, 'trip-1');
assert.equal(renamedStop.eventKind, 'trip-stop');
assert.equal(renamedStop.stopNameSource, 'manual');

const flatTripAiData = { ...stopAiData, event_name: 'Trip 1', eventKind: 'trip', clusterId: 'trip-1', tripId: 'trip-1' };
const renamedFlatTrip = h.buildManualEventAiData(flatTripAiData, 'Croatia');
assert.equal(renamedFlatTrip.event_name, 'Croatia');
assert.equal(renamedFlatTrip.clusterId, 'trip-1');
assert.equal(renamedFlatTrip.tripId, 'trip-1');
assert.equal(renamedFlatTrip.eventKind, 'trip');

const mergedAiData = h.buildManualEventAiData(stopAiData, 'Merged event', 'evt-merged-1', 7);
assert.equal(mergedAiData.event_name, 'Merged event');
assert.equal(mergedAiData.clusterId, 'evt-merged-1');
assert.equal(mergedAiData.tripId, 'evt-merged-1');
assert.equal(mergedAiData.eventKind, 'misc');
assert.equal(mergedAiData.clusterNumber, 7);
assert.equal(mergedAiData.tripNumber, 0);
assert.equal(mergedAiData.stopNumber, 0);

// Identical name + size + mtime is the same file, not a second photo.
const deduped = h.dedupeFilesBySignature([
    { name: 'a.jpg', size: 10, lastModified: 1 },
    { name: 'A.JPG', size: 10, lastModified: 1 },
    { name: 'b.jpg', size: 20, lastModified: 1 }
]);
assert.equal(deduped.files.length, 2);
assert.equal(deduped.duplicates, 1);

// A home-heavy density episode must not drop its few away photos.
const mixedPhoto = (id, time, location, coords, locationSource) => ({
    id,
    name: `${id}.jpg`,
    date: new Date(time),
    hardData: {
        location,
        locationKey: location,
        coords,
        locationSource,
        camera: 'Nikon',
        dateStr: new Date(time).toLocaleDateString('cs-CZ'),
        timeStr: new Date(time).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    },
    aiData: { tags: [] }
});
const mixedDay = vacationStart + 40 * 86400000;
const mixedEpisode = [
    mixedPhoto('home-1', mixedDay + 9 * 3600000, 'Doma', { lat: 50.08, lon: 14.43 }, 'home'),
    mixedPhoto('home-2', mixedDay + 10 * 3600000, 'Doma', { lat: 50.0801, lon: 14.4301 }, 'home'),
    mixedPhoto('home-3', mixedDay + 11 * 3600000, 'Doma', { lat: 50.0802, lon: 14.4302 }, 'home'),
    mixedPhoto('away-1', mixedDay + 14 * 3600000, 'Mnichov', { lat: 48.14, lon: 11.58 }, 'timeline'),
    mixedPhoto('unknown-1', mixedDay + 15 * 3600000, 'Neznámé místo', null, 'unknown'),
    mixedPhoto('unknown-2', mixedDay + 16 * 3600000, 'Neznámé místo', null, 'unknown')
];
const mixedHierarchy = h.buildHierarchicalEvents(mixedEpisode, 'Doma', h.buildTripSettings());
const mixedSeen = new Set();
mixedHierarchy.groups.forEach((group) => group.photos.forEach((item) => {
    assert.ok(!mixedSeen.has(item.id), `Mixed episode photo assigned twice: ${item.id}`);
    mixedSeen.add(item.id);
}));
assert.equal(mixedSeen.size, mixedEpisode.length, 'Mixed episode must keep every photo');
assert.ok(
    mixedHierarchy.groups.some((group) => group.photos.some((item) => item.id === 'away-1') && !group.eventName.startsWith('Home ')),
    'Away photo must stay in a non-home event'
);

// Tiny isolated bursts become one Random catch-all instead of many events.
const randomBursts = [];
for (let i = 0; i < 2; i += 1) {
    randomBursts.push(photo(vacationStart + 200 * 86400000 + i * 60000, 'Neznámé místo', ''));
}
for (let i = 0; i < 2; i += 1) {
    randomBursts.push(photo(vacationStart + 230 * 86400000 + i * 60000, 'Neznámé místo', ''));
}
const randomHierarchy = h.buildHierarchicalEvents(randomBursts, '', h.buildTripSettings());
const randomGroups = randomHierarchy.groups.filter((group) => group.eventKind === 'random');
assert.equal(randomGroups.length, 1, 'Small bursts should share one Random group');
assert.equal(randomGroups[0].eventName, h.RANDOM_FOLDER);
assert.equal(randomGroups[0].photos.length, randomBursts.length);

// Screenshot/clutter detection uses file size when EXIF has no camera or location.
const tinyUnknown = {
    name: 'clutter.jpg',
    file: { size: 30 * 1024 },
    hardData: { camera: 'Neznámý fotoaparát', location: 'Neznámé místo', coords: null },
    aiData: { tags: [] }
};
const largeUnknown = {
    name: 'photo.jpg',
    file: { size: 2 * 1024 * 1024 },
    hardData: { camera: 'Neznámý fotoaparát', location: 'Neznámé místo', coords: null },
    aiData: { tags: [] }
};
assert.equal(h.isLikelyScreenshot(tinyUnknown), true);
assert.equal(h.isLikelyScreenshot(largeUnknown), false);

console.log('All clustering/Timeline helper tests passed.');
