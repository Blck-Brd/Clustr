import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'UTC';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'app', 'index.html');
const corePath = path.join(root, 'app', 'core.js');
const goldenPath = path.join(root, 'tools', 'fixtures', 'core-parity.golden.json');
const update = new Set(process.argv.slice(2)).has('--update');

const helperNames = [
    'buildTripSettings', 'computeAutoTripSettings', 'clusterPhotosIntoTrips',
    'buildHierarchicalEvents', 'distanceKm', 'naturalCompare'
];

const extractBabelScript = (html) => {
    const marker = '<script type="text/babel">';
    const start = html.indexOf(marker);
    const end = html.indexOf('</script>', start);
    assert.ok(start !== -1 && end !== -1, 'Babel script not found');
    return html.slice(start + marker.length, end);
};

const extractPreApp = (script) => {
    const appStart = script.indexOf('const App = () =>');
    assert.ok(appStart !== -1, 'App component marker not found');
    return script.slice(0, appStart);
};

const loadHelpers = (code) => {
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
    vm.runInContext(`${code}\n;globalThis.__helpers = { ${helperNames.join(', ')} };`, sandbox);
    return sandbox.__helpers;
};

const HOME = { lat: 50.08, lon: 14.43 };
const BASE = Date.UTC(2026, 0, 1, 8, 0, 0);
const DAY = 86400000;

const makeDataset = (seedInput) => {
    let seed = seedInput;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    const photos = [];
    const addPhoto = (time, location, coords, source) => {
        photos.push({
            id: `p${photos.length}`,
            name: `p${photos.length}.jpg`,
            date: new Date(time),
            hardData: {
                location,
                locationKey: `key-${location}`,
                coords,
                locationSource: source,
                dateStr: '',
                timeStr: '',
                camera: 'timeline'
            },
            aiData: { tags: [], event_name: '' }
        });
    };

    const homeDays = [];
    while (homeDays.length < 18) {
        const day = Math.floor(rand() * 150);
        if (!homeDays.includes(day)) homeDays.push(day);
    }

    const trips = [
        { startDay: 12, duration: 6 },
        { startDay: 48, duration: 3 },
        { startDay: 96, duration: 4 }
    ];

    trips.forEach((trip) => {
        for (let day = trip.startDay; day < trip.startDay + trip.duration; day += 1) {
            const index = homeDays.indexOf(day);
            if (index >= 0) homeDays.splice(index, 1);
        }
    });

    homeDays.forEach((day) => {
        const count = 4 + Math.floor(rand() * 6);
        for (let i = 0; i < count; i += 1) {
            addPhoto(
                BASE + day * DAY + 19 * 3600000 + i * 7 * 60000,
                'Doma',
                { lat: HOME.lat + (rand() - 0.5) * 0.003, lon: HOME.lon + (rand() - 0.5) * 0.003 },
                'home'
            );
        }
    });

    trips.forEach((trip, tripIndex) => {
        let away;
        do {
            away = { lat: 48.2 + rand() * 2.2, lon: 12.0 + rand() * 4.2 };
        } while (distanceBetween(HOME, away) < 60);

        for (let day = 0; day < trip.duration; day += 1) {
            const stops = 1 + (rand() < 0.5 ? 1 : 0);
            for (let stop = 0; stop < stops; stop += 1) {
                const location = `Trip ${tripIndex + 1} Stop ${stop + 1} Day ${day + 1}`;
                const count = 12 + Math.floor(rand() * 24);
                for (let i = 0; i < count; i += 1) {
                    addPhoto(
                        BASE + (trip.startDay + day) * DAY + (9 + stop * 4) * 3600000 + i * 9 * 60000,
                        location,
                        {
                            lat: away.lat + stop * 0.05 + (rand() - 0.5) * 0.008,
                            lon: away.lon + stop * 0.06 + (rand() - 0.5) * 0.008
                        },
                        'timeline'
                    );
                }
            }
        }
    });

    return photos.sort((a, b) => a.date - b.date);
};

const distanceBetween = (a, b) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
};

const roundNumbers = (value) => JSON.parse(JSON.stringify(value, (key, item) => (
    typeof item === 'number' ? Number(item.toFixed(6)) : item
)));

const summarize = (h, photos, homeLocation) => {
    const hierarchy = h.buildHierarchicalEvents(photos, homeLocation, h.buildTripSettings());
    return {
        settings: roundNumbers(h.buildTripSettings()),
        autoSettings: roundNumbers(h.computeAutoTripSettings(photos, homeLocation)),
        counts: {
            trips: hierarchy.tripCount,
            stops: hierarchy.stopCount,
            homeSessions: hierarchy.homeSessionCount,
            extras: hierarchy.extraCount,
            groups: hierarchy.groups.length
        },
        groups: hierarchy.groups.map((group) => ({
            eventName: group.eventName,
            eventKind: group.eventKind,
            tripNumber: group.tripNumber,
            stopNumber: group.stopNumber,
            clusterId: group.clusterId,
            tripId: group.tripId,
            count: group.photos.length,
            first: group.photos[0].date.toISOString(),
            last: group.photos[group.photos.length - 1].date.toISOString(),
            locations: [...new Set(group.photos.map((photo) => photo.hardData?.locationKey).filter(Boolean))].sort()
        }))
    };
};

const buildSummary = (helpers) => {
    const dataset = makeDataset(424242);
    return {
        naturalSort: ['Trip 10', 'Trip 9', 'Trip 1', 'Trip 2'].sort(helpers.naturalCompare),
        home: summarize(helpers, dataset, 'Doma'),
        inferredHome: summarize(helpers, dataset, '')
    };
};

const sources = [];
if (fs.existsSync(corePath)) {
    sources.push(['app/core.js', fs.readFileSync(corePath, 'utf8')]);
} else {
    sources.push(['app/index.html', extractPreApp(extractBabelScript(fs.readFileSync(htmlPath, 'utf8')))]);
}

const results = sources.map(([name, code]) => ({
    name,
    summary: buildSummary(loadHelpers(code))
}));

if (results.length > 1) {
    assert.deepEqual(results[0].summary, results[1].summary, 'Core extraction must not change clustering output');
}

const current = results[0].summary;

const firstDiff = (a, b, at = '') => {
    if (a === b) return null;
    if (typeof a !== typeof b || a === null || b === null) return { at, a, b };
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) return { at, a, b };
        if (a.length !== b.length) return { at: `${at}.length`, a: a.length, b: b.length };
        for (let index = 0; index < a.length; index += 1) {
            const diff = firstDiff(a[index], b[index], `${at}[${index}]`);
            if (diff) return diff;
        }
        return null;
    }
    if (typeof a === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) {
            if (!(key in a) || !(key in b)) return { at: `${at}.${key}`, a: a[key], b: b[key] };
            const diff = firstDiff(a[key], b[key], `${at}.${key}`);
            if (diff) return diff;
        }
        return null;
    }
    return { at, a, b };
};

if (update) {
    fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
    fs.writeFileSync(goldenPath, `${JSON.stringify(current, null, 2)}\n`);
    console.log(`Wrote ${path.relative(root, goldenPath)} from ${results[0].name}`);
} else {
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    const diff = firstDiff(current, golden);
    if (diff) {
        console.error('First difference:', diff);
        assert.fail(`Clustering output from ${results[0].name} differs from the baseline snapshot`);
    }
    console.log(`Core parity snapshot matches (${current.home.groups.length} groups) from ${results[0].name}`);
}
