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
   - Read EXIF `DateTimeOriginal` / `CreateDate`.
   - Match Timeline segments by time using a sorted index (`visit`, `activity`, `timelinePath`).
   - Fall back to GPS + Nominatim reverse geocoding.
   - Interpolate missing locations from the nearest known location within 12 hours.
   - Group by actual coordinates when available (15 km merge radius, falling back to rounded keys/normalized names), 24-hour maximum gap and 72-hour maximum cluster duration.
   - Assign `clusterId`, `clusterNumber`, temporary `Event N - location` names and auto tags.
   - Fill unknown locations inside a cluster from its dominant location.
4. **Phase 3 - AI names**
   - Group by `clusterId`, build one summary per event (date, time, location, tags).
   - Ask Ollama/Gemini for JSON names in batches, normalize response shapes, retry missing names.
   - Preserve manual names (`eventNameSource === 'manual'`).
5. **Phase 4 - visual tags** - optional vision-model pass.
6. **Export** - folder hierarchy + XMP sidecars.

## Photo data model

```js
{
  id, name, file, url, date,
  hardData: {
    dateStr, timeStr, location, locationKey, locationSource, camera
  },
  aiData: {
    tags, event_name, eventNameSource, clusterId, clusterNumber, category
  }
}
```

`locationSource`: `manual | timeline | gps | interpolated | cluster | unknown`

`eventNameSource`: `manual | placeholder | ai`

## Persistence

- IndexedDB (`clustr` / `project`) stores photo metadata and normalized Timeline data after a 1.5 s debounce.
- Photo blobs are never stored. After a reload, the app asks you to re-select the folder and relinks metadata by name, size and last-modified time.
- Firestore now stores only the Gemini API key. It no longer receives the full photo metadata payload.

## Known scale limits (next rework targets)

- Phase 2 still runs EXIF + geocoding on the main thread. Move it into a worker pool.
- The gallery renders every tile; virtualize the grid for 2,000+ photos.
- Add a collision-safe project picker if multiple photo libraries should be kept side by side.
