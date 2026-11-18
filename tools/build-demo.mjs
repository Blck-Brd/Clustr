// Builds the bundled demo library in app/demo/.
//
// Photos come from Lorem Picsum (https://picsum.photos, images licensed under the
// Unsplash license). They are downloaded once and committed, so the demo never
// touches a third-party host at runtime. Dates, places and cameras are invented.
//
// Usage: node tools/build-demo.mjs [--force]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'app', 'demo');
const force = process.argv.includes('--force');
const WIDTH = 1200;
const HEIGHT = 800;

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const TRIPS = [
  {
    id: 'alps',
    camera: { make: 'Sony', model: 'ILCE-7M3' },
    dayTimes: [
      ['09:15', '11:40', '15:05', '17:30'],
      ['10:05', '12:20', '16:10', '18:00'],
      ['08:50', '11:10', '14:30', '17:45']
    ],
    stops: [
      { name: "Cortina d'Ampezzo", lat: 46.5405, lon: 12.1357 },
      { name: 'Lago di Braies', lat: 46.6947, lon: 12.0856 },
      { name: 'Tre Cime di Lavaredo', lat: 46.6186, lon: 12.3055 }
    ],
    start: '2024-06-14',
    picsum: [29, 54, 62, 66, 15, 92, 93, 19, 18, 17, 71, 94]
  },
  {
    id: 'santorini',
    camera: { make: 'Apple', model: 'iPhone 13 Pro' },
    dayTimes: [
      ['09:40', '11:25', '13:50', '16:35', '18:55'],
      ['10:15', '12:40', '15:20', '18:10'],
      ['09:05', '11:55', '14:45', '17:40']
    ],
    stops: [
      { name: 'Oia', lat: 36.4618, lon: 25.3753 },
      { name: 'Fira', lat: 36.4162, lon: 25.4319 },
      { name: 'Akrotiri', lat: 36.3516, lon: 25.4033 }
    ],
    start: '2024-09-02',
    picsum: [12, 13, 14, 16, 47, 49, 52, 58, 59, 74, 77, 51, 98]
  },
  {
    id: 'lisbon',
    camera: { make: 'FUJIFILM', model: 'X-T4' },
    dayTimes: [
      ['10:20', '12:45', '15:30', '18:20'],
      ['09:30', '11:50', '14:40', '17:55'],
      ['10:00', '13:10', '16:05', '18:40']
    ],
    stops: [
      { name: 'Lisboa', lat: 38.7223, lon: -9.1393 },
      { name: 'Sintra', lat: 38.7979, lon: -9.3885 },
      { name: 'Cascais', lat: 38.6979, lon: -9.4215 }
    ],
    start: '2025-03-21',
    picsum: [43, 57, 61, 78, 87, 99, 42, 63, 76, 68, 55, 70]
  },
  {
    id: 'home',
    camera: { make: 'Apple', model: 'iPhone 13 Pro' },
    home: { name: 'Praha', lat: 50.0755, lon: 14.4378 },
    days: [
      ['2025-04-05', ['18:10', '19:05', '20:20']],
      ['2025-04-18', ['17:45', '18:50', '19:40']],
      ['2025-05-01', ['18:20', '19:30', '20:05']],
      ['2025-05-09', ['19:15', '20:10']],
      ['2025-05-17', ['17:55', '19:05']]
    ],
    picsum: [0, 1, 4, 8, 24, 26, 30, 40, 60, 64, 90, 80, 34]
  }
];

const pad = (n) => String(n).padStart(2, '0');
const addDays = (iso, days) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(file, bytes);
  return bytes.length;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  let authors = new Map();
  try {
    const res = await fetch('https://picsum.photos/v2/list?page=1&limit=100');
    if (res.ok) {
      const list = await res.json();
      authors = new Map(list.map((item) => [Number(item.id), item.author]));
    }
  } catch (e) {
    console.warn('Could not fetch the Picsum author list:', e.message);
  }

  const photos = [];
  const timeline = [];
  let totalBytes = 0;

  for (const trip of TRIPS) {
    const rand = mulberry32(trip.picsum.reduce((sum, id) => sum + id, 0));
    let index = 0;

    const addPhoto = async ({ file, date, lat, lon, stop, semanticType = '' }) => {
      const target = path.join(outDir, file);
      let size = 0;
      try {
        size = (await fs.stat(target)).size;
      } catch (e) {
        size = 0;
      }
      if (!size || force) {
        size = await download(`https://picsum.photos/id/${trip.picsum[index]}/${WIDTH}/${HEIGHT}`, target);
      }
      totalBytes += size;
      photos.push({
        file,
        date,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        make: trip.camera.make,
        model: trip.camera.model,
        bytes: size,
        place: stop,
        author: authors.get(trip.picsum[index]) || 'Unknown'
      });
      index += 1;
      return { date, lat, lon, stop, semanticType };
    };

    if (trip.home) {
      for (const [day, times] of trip.days) {
        const timesMs = [];
        for (let slot = 0; slot < times.length; slot += 1) {
          const lat = trip.home.lat + (rand() - 0.5) * 0.03;
          const lon = trip.home.lon + (rand() - 0.5) * 0.045;
          const date = `${day}T${times[slot]}:00`;
          await addPhoto({
            file: `${trip.id}-${pad(index + 1)}.jpg`,
            date,
            lat,
            lon,
            stop: trip.home.name,
            semanticType: 'HOME'
          });
          timesMs.push(new Date(date).getTime());
        }
        timeline.push({
          kind: 'visit',
          name: trip.home.name,
          coords: { lat: trip.home.lat, lon: trip.home.lon },
          start: Math.min(...timesMs) - 45 * 60000,
          end: Math.max(...timesMs) + 45 * 60000,
          semanticType: 'HOME'
        });
      }
      continue;
    }

    const byDay = new Map();
    for (let day = 0; day < trip.dayTimes.length; day += 1) {
      const dayIso = addDays(trip.start, day);
      const stop = trip.stops[day % trip.stops.length];
      const times = trip.dayTimes[day];

      for (let slot = 0; slot < times.length; slot += 1) {
        const lat = stop.lat + (rand() - 0.5) * 0.02;
        const lon = stop.lon + (rand() - 0.5) * 0.03;
        const date = `${dayIso}T${times[slot]}:00`;
        const added = await addPhoto({
          file: `${trip.id}-${pad(index + 1)}.jpg`,
          date,
          lat,
          lon,
          stop: stop.name
        });
        if (!byDay.has(dayIso)) byDay.set(dayIso, { stop, dates: [] });
        byDay.get(dayIso).dates.push(new Date(added.date).getTime());
      }
    }

    byDay.forEach(({ stop, dates }) => {
      timeline.push({
        kind: 'visit',
        name: stop.name,
        coords: { lat: stop.lat, lon: stop.lon },
        start: Math.min(...dates) - 60 * 60000,
        end: Math.max(...dates) + 60 * 60000,
        semanticType: 'UNKNOWN'
      });
    });
  }

  timeline.sort((a, b) => a.start - b.start);

  const payload = {
    version: 1,
    label: 'Demo library',
    description: 'Sample photos with invented dates, places and cameras. Nothing here is uploaded.',
    photoCount: photos.length,
    photos,
    timeline
  };

  await fs.writeFile(path.join(outDir, 'demo.json'), `${JSON.stringify(payload, null, 2)}\n`);

  const credits = [
    '# Demo photo credits',
    '',
    'Demo photos are served by [Lorem Picsum](https://picsum.photos/) and licensed under the',
    '[Unsplash license](https://unsplash.com/license). They were downloaded once and committed,',
    'so the demo never contacts a third-party host at runtime.',
    '',
    '| File | Photographer |',
    '| --- | --- |',
    ...photos.map((photo) => `| ${photo.file} | ${photo.author} |`),
    '',
    'Dates, places, GPS coordinates and camera models in `demo.json` are fictional and only',
    'exist to demonstrate clustering.',
    ''
  ].join('\n');
  await fs.writeFile(path.join(outDir, 'CREDITS.md'), credits);

  console.log(`Wrote ${photos.length} demo photos (${(totalBytes / 1024 / 1024).toFixed(1)} MB) and ${timeline.length} timeline visits.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
