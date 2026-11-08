# Clustr Devlog

## 2026-11-08 - Trips, stops and devlog checkpoint

### Product direction

The target behavior is hierarchical:

- **One vacation = one top-level folder** (for example `Trip 1`), even when it covers many cities and days.
- **Stops inside the vacation = subfolders** (`Trip 1/Stop 1 - Kutná Hora`).
- **Weekend trips = separate top-level trip folders.**
- **Home photo shoots = separate `Home N` events.**
- **Locations usually are not in the photos.** They are derived from the Google Timeline JSON by matching photo time to Timeline visits/activities/paths.

The `Places` profile remains available for flat density events when trip folders are not wanted.

### Implemented in the working tree

- Timeline v2:
  - Parses `visit` / `placeVisit`, `activity` and `timelinePath`.
  - Supports HOME/WORK semantic types, `geo:lat,lon`, coordinate arrays and `latitudeE7` / `longitudeE7`.
  - Binary-searches a normalized Timeline index.
- Phase 2:
  - Reads EXIF time/camera; location comes from Timeline, then GPS/reverse-geocode fallback, then 12 h interpolation.
  - Default **Trips + home** profile:
    - Home inference from Timeline HOME, explicit home setting, or the location with the most distinct days (datasets > 30 days).
    - Away photos grouped into trips by `tripGapHours` (default 72 h) and a max trip length.
    - Density DBSCAN inside each trip creates stop subfolders.
    - Home photos become home sessions split by `homeSessionGapHours` (default 4 h).
    - Unknown-location photos attach to the nearest episode by time or are grouped separately.
  - **Places** profile: flat spatiotemporal DBSCAN.
  - Auto/manual sensitivity, manual split and merge, location inheritance.
  - Placeholder names: `Trip N/Stop M - location`, `Home N`, `Event N`.
- Phase 3: optional AI naming - choose **Trips** (top-level folders) or **Stops** (subfolders); the other level is preserved. Manual names are protected by `tripNameSource` / `stopNameSource`.
- Phase 4: optional vision tags.
- Persistence: IndexedDB metadata + normalized Timeline; relink by name/size/modified time. Firestore stores only the Gemini key.
- PWA: `app/manifest.webmanifest`, `app/sw.js`, icons, `app/vercel.json`.

### Key files

- `app/index.html` - the whole app.
- `tools/test-clustering.mjs` - clustering/Timeline/inheritance/trip tests.
- `tools/check-app.mjs` - Babel transform + JSON validation.
- `docs/ARCHITECTURE.md` - pipeline and data model.
- `docs/TIMELINE-FORMAT.md` - Timeline input shapes.
- `docs/DEPLOYMENT.md` - Vercel/PWA deployment.
- `Timeline.json` (repository root) - personal test data, **ignored by Git, never commit**.

### Test scenarios

Run:

```powershell
npm run check
npm test
```

Current automated scenarios:

- Timeline-only photos (no EXIF GPS) get a location and coordinates from Timeline.
- Photos with Timeline coordinates but no resolved place name still join trips/stops.
- 1-week vacation with **1,289 photos** becomes **one trip** with multiple stop subfolders.
- 6-month dataset with:
  - two 1-week vacations,
  - three weekend trips,
  - 40 home photo sessions,
  - becomes **5 trips + 40 home sessions**, with all home photos in `Home N` groups and all away photos in `Trip N/...` groups.
- Density profile: dense bursts vs sparse driving, overnight split, same-place merge, auto/manual sensitivity.
- Location inheritance: manual location applies to the event and nearby photos without their own location.
- Timeline normalization against the real 293-entry `Timeline.json`: 109 visits, 85 activities, 99 paths.

### Second pass - reliability, real Timeline, AI naming

Added after the first checkpoint:

- **Real Timeline integration test** (`tools/test-timeline-real.mjs`):
  - Reads the ignored `Timeline.json` from the repository root when present.
  - Normalizes 293 entries (109 visits, 85 activities, 99 paths).
  - Verifies match/resolve coverage, HOME/WORK handling, no-EXIF-GPS extraction and the full trip/stop hierarchy built from Timeline-derived coordinates.
  - Skips cleanly in CI when the personal file is absent.
- **Trip/home fuzz test** (`tools/test-trip-fuzz.mjs`):
  - 12 synthetic six-month datasets with two vacations, weekend trips and home sessions.
  - Asserts every photo assigned exactly once, no home photo in a trip group, no trip photo in a home group, expected trip/home-session counts and no empty groups.
- **Trip-level AI naming** (`namingLevel = trips`):
  - Phase 3 groups by `tripId`, names the top-level `Trip N` folder and preserves stop subfolders.
  - `namingLevel = stops` names stop leaves/home events and preserves the parent trip folder.
  - `tripNameSource` / `stopNameSource` track manual vs placeholder vs AI names.
- **Separate stop sensitivity** inside the Trips profile:
  - Trip sensitivity (trip gap, home radius, home-session gap) is independent from stop density (time/space/min photos).
- **Name replacement helper** tested for both levels.

### Known limitations / next steps

1. **Trips closer than the trip gap merge by design** - two trips without home photos and with less than `tripGapHours` between away photos become one trip. Increase/decrease the gap in manual mode if needed.
2. **Main-thread processing** - EXIF and geocoding still run on the main thread. Move to a Web Worker pool for large folders.
3. **Gallery rendering** - no virtualization yet; 2,000+ tiles are heavy.
4. **Local AI over HTTPS** - Ollama at `http://localhost:11434` may be restricted when the PWA is served from Vercel HTTPS. Use local serving / `vercel dev` for local AI.
5. **Ollama presets** - default preset names may not be installed; the app lists installed models and preflights the selected one.

### Continue here

- Repository: https://github.com/Blck-Brd/Clustr
- Deploy: Vercel Root Directory = `app`; no build command.
- Local run: `npm run dev` (serves `app/`).
- Tests: `npm run check`, `npm test`.
- Next recommended task: Web Worker pool + virtualized gallery; optional per-project/per-trip overrides.
