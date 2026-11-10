import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const helperNames = ['buildTripSettings', 'computeAutoTripSettings', 'buildHierarchicalEvents', 'distanceKm'];
vm.runInContext(`${preApp}\n;globalThis.__helpers = { ${helperNames.join(', ')} };`, sandbox);
const h = sandbox.__helpers;

const HOME = { lat: 50.08, lon: 14.43 };
const BASE = new Date('2026-01-01T08:00:00').getTime();
const DAY = 86400000;

function makeVacation(seedInput) {
    let seed = seedInput;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };

    const photos = [];
    const homePhotos = [];
    const tripPhotos = [];
    const homeDays = new Set();
    let photoId = 0;

    const addPhoto = (time, locationName, coords, isHome) => {
        const item = {
            id: `p${photoId++}`,
            name: `p${photoId}.jpg`,
            date: new Date(time),
            hardData: {
                location: locationName,
                locationKey: `key-${locationName}`,
                coords,
                locationSource: isHome ? 'home' : 'timeline',
                dateStr: new Date(time).toLocaleDateString('cs-CZ'),
                timeStr: new Date(time).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                camera: 'timeline'
            },
            aiData: { tags: [], event_name: '' }
        };
        photos.push(item);
        if (isHome) homePhotos.push(item);
        else tripPhotos.push(item);
        return item;
    };

    // Home days spread across six months.
    const homeDayCount = 25 + Math.floor(rand() * 20);
    const usedHomeDays = new Set();
    while (usedHomeDays.size < homeDayCount) {
        const day = Math.floor(rand() * 175);
        usedHomeDays.add(day);
    }

    // Two vacations and several weekend trips, separated by at least a week.
    const tripRanges = [];
    const vacationCount = 2;
    const weekendCount = 2 + Math.floor(rand() * 2);
    let cursorDay = 10;
    for (let t = 0; t < vacationCount + weekendCount; t += 1) {
        const isVacation = t < vacationCount;
        const duration = isVacation ? 5 + Math.floor(rand() * 5) : 2 + Math.floor(rand() * 2);
        tripRanges.push({ startDay: cursorDay, duration, isVacation });
        cursorDay = cursorDay + duration + 7 + Math.floor(rand() * 8);
    }

    // Keep home days and trip days disjoint.
    tripRanges.forEach((trip) => {
        for (let d = trip.startDay; d < trip.startDay + trip.duration; d += 1) {
            usedHomeDays.delete(d);
        }
    });
    const finalHomeDays = [...usedHomeDays].sort((a, b) => a - b);
    finalHomeDays.forEach((day) => homeDays.add(day));

    finalHomeDays.forEach((day) => {
        const count = 5 + Math.floor(rand() * 16);
        for (let i = 0; i < count; i += 1) {
            addPhoto(
                BASE + day * DAY + 18 * 3600000 + i * 5 * 60000,
                'Doma',
                { lat: HOME.lat + (rand() - 0.5) * 0.004, lon: HOME.lon + (rand() - 0.5) * 0.004 },
                true
            );
        }
    });

    tripRanges.forEach((trip, tripIndex) => {
        let awayCoords;
        do {
            awayCoords = { lat: 48.2 + rand() * 2.4, lon: 12.0 + rand() * 4.5 };
        } while (h.distanceKm(HOME, awayCoords) < 50);
        tripRanges[tripIndex].coords = awayCoords;

        for (let day = 0; day < trip.duration; day += 1) {
            const stopsToday = 1 + (rand() < 0.4 ? 1 : 0);
            for (let stop = 0; stop < stopsToday; stop += 1) {
                const locationName = `Trip ${tripIndex + 1} Stop ${stop + 1} Day ${day + 1}`;
                const lat = awayCoords.lat + stop * 0.05 + (rand() - 0.5) * 0.01;
                const lon = awayCoords.lon + stop * 0.06 + (rand() - 0.5) * 0.01;
                const count = 20 + Math.floor(rand() * 60);
                const startHour = 9 + stop * 4;
                for (let i = 0; i < count; i += 1) {
                    addPhoto(
                        BASE + (trip.startDay + day) * DAY + startHour * 3600000 + i * 8 * 60000,
                        locationName,
                        { lat: lat + (rand() - 0.5) * 0.002, lon: lon + (rand() - 0.5) * 0.002 },
                        false
                    );
                }
            }
        }
    });

    return {
        photos,
        homePhotos,
        tripPhotos,
        homeDays: finalHomeDays,
        expectedTrips: tripRanges.length,
        tripRanges
    };
}

const seeds = Array.from({ length: 12 }, (_, index) => (index + 1) * 104729);
let failed = 0;

seeds.forEach((seed, index) => {
    const data = makeVacation(seed);
    const useExplicitHome = index % 2 === 0;
    const hierarchy = h.buildHierarchicalEvents(data.photos, useExplicitHome ? 'Doma' : '', h.buildTripSettings());

    const seen = new Set();
    hierarchy.groups.forEach((group) => {
        assert.ok(group.photos.length > 0, 'No empty groups');
        group.photos.forEach((photo) => {
            assert.ok(!seen.has(photo.id), `Photo assigned twice in seed ${seed}`);
            seen.add(photo.id);
        });
    });
    assert.equal(seen.size, data.photos.length, `All photos assigned in seed ${seed}`);

    const homeIds = new Set(data.homePhotos.map((photo) => photo.id));
    const tripIds = new Set(data.tripPhotos.map((photo) => photo.id));

    hierarchy.groups.filter((group) => group.eventName.startsWith('Home ')).forEach((group) => {
        group.photos.forEach((photo) => assert.ok(homeIds.has(photo.id), `Home group contains trip photo in seed ${seed}`));
    });
    hierarchy.groups.filter((group) => group.eventName.startsWith('Trip ')).forEach((group) => {
        group.photos.forEach((photo) => assert.ok(tripIds.has(photo.id), `Trip group contains home photo in seed ${seed}`));
    });

    try {
        assert.equal(hierarchy.tripCount, data.expectedTrips, `Unexpected trip count in seed ${seed}`);
        assert.equal(hierarchy.homeSessionCount, data.homeDays.length, `Unexpected home session count in seed ${seed}`);
        assert.ok(hierarchy.stopCount >= data.expectedTrips, `Every trip should have at least one stop in seed ${seed}`);
        assert.equal(hierarchy.extraCount, 0, `Unexpected extras in seed ${seed}`);
    } catch (error) {
        failed += 1;
        console.error('FAIL', seed, error.message, {
            photos: data.photos.length,
            homeDays: data.homeDays.length,
            expectedTrips: data.expectedTrips,
            trips: hierarchy.tripCount,
            homeSessions: hierarchy.homeSessionCount,
            stops: hierarchy.stopCount,
            extras: hierarchy.extraCount
        });
    }
});

assert.equal(failed, 0, `${failed} trip/home fuzz seeds failed`);
console.log(`Trip/home fuzz passed for ${seeds.length} synthetic six-month datasets.`);
