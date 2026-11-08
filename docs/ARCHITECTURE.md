# Clustr Architecture

## Repository layout

```text
app/                 PWA source (single-file React app for now)
  index.html         UI, EXIF, Timeline, clustering, AI phases, export
  manifest.webmanifest
  sw.js              Service worker (app shell + CDN cache)
  icons/             PWA icons
  vercel.json        Vercel headers for the app directory
legacy/html-versions/ Old single-file HTML iterations
tools/               Checks, tests and asset generation
docs/                Architecture, deployment and data-format notes
```

## Pipeline

1. **Folder selection** - browser `File` objects, `file.lastModified` used until EXIF is read.
2. **Phase 1 (optional)** - EXIF only. Time, camera, GPS and auto tags.
3. **Phase 2 - grouping**
   - Read EXIF `DateTimeOriginal` / `CreateDate`. Photos usually have **no GPS**; location is derived from Timeline by photo time.
   - Match Timeline segments by time using a sorted index (`visit`, `activity`, `timelinePath`).
   - For unnamed coordinates, search the Timeline itself for the nearest named location (HOME/WORK or a named visit, 8 km), then fall back to GPS + Nominatim reverse geocoding, then interpolate missing locations from the nearest known location within 12 hours.
   - **Default profile: Trips + home.**
     - Infer home from Timeline HOME, the explicit home setting, or the location with the most distinct days (only for datasets longer than 30 days).
     - Home photos become home sessions (`Home N`), split by the home-session gap.
     - Away photos become trips, split when the away gap exceeds the trip gap (default 72 h) or the trip exceeds the max duration.
     - Inside each trip, run density DBSCAN to create stop subfolders: `Trip N/Stop M - location`. Stop sensitivity is Auto per trip or Manual from the UI.
   - **Places profile:** flat spatiotemporal DBSCAN events (`Event N - location`) using Auto or manual time/space/min-photo values.
   - Assign `clusterId`, `tripId`, `tripNumber`, `stopNumber`, `eventKind`, temporary names and auto tags.
   - Fill unknown locations inside a group from its dominant location.
4. **Phase 3 - AI names**
   - Choose naming level: **Trips** groups by `tripId`, or **Stops** groups by `clusterId`.
   - Build one summary per group (date, time, location, tags), ask Ollama/Gemini for JSON names in batches, normalize response shapes, retry missing names.
   - Trip naming replaces the first path segment and preserves stops; stop naming replaces the leaf and preserves the trip folder. Manual names are skipped (`tripNameSource` / `stopNameSource`).
5. **Phase 4 - visual tags** - optional vision-model pass.
6. **Export** - folder hierarchy + XMP sidecars.

## Photo data model

```js
{
  id, name, file, url, date,
  hardData: {
    dateStr, timeStr, location, locationKey, locationSource, coords, camera
  },
  aiData: {
    tags, event_name, eventNameSource, tripNameSource, stopNameSource,
    clusterId, clusterNumber, eventKind, tripId, tripNumber, stopNumber, category
  }
}
```

`locationSource`: `manual | inherited | timeline | timeline-near | gps | interpolated | cluster | unknown`

Manual location edits propagate to the whole event and to photos without their own location within 12 hours. Manual event-name edits propagate to the whole event and block Phase 3 from overwriting it.

Manual event actions:
- **Split** gives the selected photos a new `clusterId` and event name without touching the rest of the original event.
- **Event / merge** renames whole events; selecting photos from multiple events assigns them a shared `clusterId` and merges the events.

`eventNameSource`: `manual | placeholder | ai`

## Persistence

- IndexedDB (`clustr` / `project`) stores photo metadata and normalized Timeline data after a 1.5 s debounce.
- Photo blobs are never stored. After a reload, the app asks you to re-select the folder and relinks metadata by name, size and last-modified time.
- Firestore now stores only the Gemini API key. It no longer receives the full photo metadata payload.

## Workers and gallery

- `app/exif-worker.js` is run in a pool of up to 4 dedicated workers. Each parses one file and returns only the needed EXIF fields; malformed files time out after 30 s.
- `app/geo-worker.js` serializes Nominatim requests (1.1 s spacing) and caches results. The main thread falls back to inline parsing/geocoding if workers are unavailable.
- `app/vendor/exifr.full.umd.js` is served locally so the worker pool does not depend on a CDN at runtime.
- The gallery renders only visible rows (plus overscan), using measured width/height and a translated grid.

## Next rework targets

- Add a collision-safe project picker so multiple photo libraries can coexist in IndexedDB.
- Move from in-browser Babel to a Vite build with modules and Playwright E2E coverage.
- Optional per-project/per-trip sensitivity overrides.

