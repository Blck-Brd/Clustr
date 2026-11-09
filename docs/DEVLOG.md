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
- **Nearest named Timeline lookup**:
  - When a Timeline segment has coordinates but no name, the app now finds the nearest named Timeline location (HOME/WORK or an explicitly named visit) within 8 km.
  - Only if nothing is close does it call Nominatim.
  - Tested with synthetic near/far coordinates and against the real Timeline HOME segment; the lookup avoids the Nominatim fetch.

### Third pass - workers, virtualization, localhost

- **EXIF worker pool** (`app/exif-worker.js`):
  - Up to 4 dedicated workers, one file at a time, only needed EXIF fields returned.
  - 30 s parse timeout; main-thread fallback if workers/exifr are unavailable.
  - `app/vendor/exifr.full.umd.js` is served locally and cached by the PWA.
- **Geocode worker** (`app/geo-worker.js`):
  - Serialized Nominatim requests (1.1 s), persistent in-worker cache.
  - Main-thread fallback with the existing reverseGeocode cache.
- **Worker pipeline**:
  - Phase 1/2 use `buildMetadataMap`: EXIF pool → Timeline resolve/nearest named → unique-coordinate geocoding → interpolation.
- **Virtualized gallery**:
  - Measures the scroll container, computes columns/rows and renders only the visible window plus overscan.
  - Browser test renders 48/120 tiles initially and after scrolling, instead of all 120.
- **Localhost**:
  - `npm run dev` now runs `tools/serve.mjs` at **http://127.0.0.1:4173/**.
  - The server exposes `/Timeline.json` from the repo root; the app auto-loads it on startup.
- **Browser test** (`npm run test:browser`):
  - Playwright + installed Chrome.
  - Verifies Timeline auto-load, EXIF worker response, and virtualized tile count.

### Fourth pass - density heatmap clustering, clutter, clean state

- **Daily density heatmap for trips/episodes**:
  - Daily photo counts are smoothed over ±2 days.
  - Active days use `max(1, peak × 0.15)`; runs split only at low-density valleys with at most 1 rest day.
  - The 2–8 May location-less vacation now becomes **one `Trip 1` folder**, not ~10 time events.
- **Spatiotemporal grid heatmap for stops**:
  - Photos are binned by time (`epsTime/2`) and projected space (`epsSpace/2`).
  - The grid is smoothed with a 3×3×3 neighborhood; connected hot cells become stops.
  - This replaces the previous DBSCAN implementation while keeping the same Auto/Manual settings.
- **Screenshot/Clutter routing**:
  - Detects English/Czech screenshot names (`Screenshot`, `Snímek obrazovky`, `obrazovky`), `Screenshots`/clutter/download paths, and PNG/WebP/GIF files with no camera and no location.
  - Everything goes to the `Screenshot-Clutter` folder and is excluded from trip clustering.
- **Clean state**:
  - Added the 🧹 reset button. It clears IndexedDB, local settings, geocode cache and cloud metadata, then reloads.
  - The Timeline auto-load is skipped for the first reload after reset.
  - Cloud metadata is no longer restored from Firestore; IndexedDB is the source of truth.
- **Real Pictures dataset check**:
  - `C:\Users\andre\Pictures`: 633 images → **371 screenshots/clutter**, 262 Croatia photos.
  - Root Timeline covers July–October 2026, while Croatia is 2–8 May 2026, so no Timeline locations exist for it.
  - Result after the fixes: **1 screenshot/clutter group + 1 `Trip 1` folder (262 photos, flat)**.

### Fifth pass - whole-trip density, manual trip window, cluster review heatmap

- **All-photo density episodes**:
  - Trip episodes are now built from **all normal photos**, not only located/away photos.
  - If only a few photos have a location, the unknown photos in the same density episode stay in the trip instead of becoming separate events.
  - A trip needs at least `minPoints` located photos before stop subfolders are attempted; otherwise it becomes one flat `Trip N` folder.
- **Manual location propagates across the whole trip**:
  - `tripId`, `tripStart` and `tripEnd` are stored on every trip photo.
  - A bulk location edit now applies to every photo with the same `tripId`, not just the same stop/cluster or the 12-hour neighbourhood.
  - A flat trip placeholder is renamed to `Trip N - location`.
- **Manual trip window**:
  - New “📅 Manual trip window” action. Select photos (or use the full range), set From/To dates, a name and an optional location.
  - It creates one trip folder from all photos in the window; this is the explicit escape hatch for “we know Croatia was 2 May–8 May”.
- **Cluster review heatmap**:
  - New “📊 Review clusters (heatmap)” action in Phase 2.
  - Time heatmap: one row per cluster, columns are days, colour intensity = photos per day. Click a row to select.
  - Map view: photos/clusters coloured by cluster; click a point to select.
  - Sidebar lists clusters with counts and dates. Select one or more, set a name and/or location, and apply to the whole selection.
  - Single selected trip also exposes "Edit trip window".
  - If no clusters are available, the modal shows a diagnostic empty state with photo/cluster/clutter counts and a reminder to run Phase 2.
  - Playwright now runs Phase 2 with synthetic photos, verifies the heatmap canvas and group list, and renames a cluster through the review UI.
- **Screenshot/Clutter** remains a separate `Screenshot-Clutter` group and is excluded from trip/stop clustering.
- **TODO**:
  - Created `TODO.md` with: Location Tinder, Ko-fi profile rework, Vercel issues, project picker, Vite build, real-world Timeline coverage and test coverage.

### Sixth pass - parent trips for long events

- **Parent trip layer**:
  - Density episodes are merged into a parent trip when the gap is at most `parentTripGapHours` (default **120 h / 5 days**) and the total duration is within `maxTripDays`.
  - A long vacation can therefore contain multiple internal density episodes/stops, but only **one top-level trip folder**.
  - Trips separated by a larger gap remain separate parent trips.
- **Flat vs stops**:
  - A parent trip needs at least `minPoints` located photos before stop subfolders are attempted.
  - With no/few locations, the parent is one flat `Trip N` folder; the known location still fills the rest of the trip through dominant-location fill.
- **Manual location** continues to propagate by `tripId` across the whole parent trip window.
- **Tests**:
  - Two nearby density blocks (3 days + gap + 3 days) become one parent trip.
  - A 14-day separation creates two parent trips.
  - Real Pictures dataset remains **1 `Trip 1` folder** for 262 location-less Croatia photos plus 371 screenshots/clutter.
  - Real Timeline hierarchy and 12-seed six-month fuzz still pass.

### Seventh pass - one photo, one event; Random; clutter by size

- **Manual event edits no longer double a photo into two events**:
  - Bulk **Event** keeps a stop inside its trip (`Trip 1/Stop 1 -> Trip 1/<new name>`) instead of flattening it to a top-level folder while keeping the old `tripId`.
  - Selecting several events/clusters and applying one name now performs a real merge: the photos share `clusterId` and `tripId`; trip-level merges keep their stop leaves.
  - Dragging photos onto an existing event folder adopts that event's `clusterId`/`tripId`; dropping into a new folder creates one real new event; dropping into a parent folder keeps the leaf identity.
  - Manual/AI-named photos are excluded from regrouping and restored after Phase 2, so re-running grouping cannot move them into a second event.
  - `placeholderEventIndex()` keeps location renames from producing several `Event 0 - ...` folders.
- **Random / fuzz category**:
  - Small, short, location-less bursts and leftovers now go to one `Random` folder instead of one `Event N` per burst.
  - New `randomMinPhotos` setting (default 3) is available in the manual trip and stop/place settings.
  - `Random` is excluded from dominant-location fill, so unrelated photos do not inherit one location.
- **Screenshots / clutter by size**:
  - An image with no camera, no location and either a lossless extension or a file smaller than 120 KB is routed to `Screenshot-Clutter`.
  - Screenshots remain a separate category/folder and are excluded from trips, stops and Random.
- **Duplicate imports**:
  - Files with the same name, size and modified time (`file.lastModified`) are loaded once. The app reports how many identical copies were skipped.
- **Manual location on a flat trip**:
  - Manual locations are now actually read from `hardData.locationSource` (the previous check looked at `aiData`, so manual places were lost on re-run).
  - A single named location without coordinates keeps the trip flat (`Trip N - Pag`) instead of inventing per-day stops.
- **Broken EXIF dates**:
  - Camera dates before 1900 (seen as 1899 in the `D:\Fotky` subset) or after next year fall back to the file's modified date instead of creating a bogus trip.
- **Heatmap / review verification**:
  - Verified Phase 2 -> Review clusters on a 1,500-file subset of `D:\Fotky`: 57 groups, canvas 980x1286, no page errors.
  - Empty review after Phase 2 is therefore treated as stale PWA shell or a dataset that is entirely screenshot/clutter. `sw.js` cache bumped to `clustr-shell-v10`; hard-reload once after deploying.
- **Deployment**:
  - Vercel: Root Directory `app`, Framework `Other`, Build/Output/Install/Dev commands empty (no override). Documented in `docs/DEPLOYMENT.md`.
- **Housekeeping**:
  - Deprecated `legacy/html-versions/` removed.
- **Tests**:
  - Manual stop rename preserves the trip and ids; multi-event merge shares ids; duplicate-file dedupe; mixed home/away episode keeps every photo; small bursts become one `Random`; tiny no-EXIF images classify as clutter.

### Eighth pass - analytics, heatmap safety

- **Vercel Analytics**: installed `@vercel/analytics`; `app/index.html` injects `/_vercel/insights/script.js` on non-localhost hosts. Enable Web Analytics in the Vercel dashboard.
- **Heatmap black screen hardening**:
  - Added a React error boundary around the cluster review so a bad cluster cannot blank the whole app.
  - Bounds/geo bounds are computed without huge `Math.min(...array)` spreads and ignore invalid dates.
  - Timeline canvas height is capped under Chrome's canvas limit (also with device pixel ratio), row height shrinks for very large group counts, and labels are skipped when rows are too small.
  - Sidebar renders the first 500 groups with a "showing first N" note instead of thousands of buttons.
  - If the canvas must truncate, it reports how many clusters are shown; the sidebar can still select others.

### Ninth pass - heatmap bottom panel and folder carving

- **Bottom heatmap panel**:
  - The cluster review is no longer a full-screen modal. It opens as a docked panel in the lower ~38% of the main area; the gallery stays visible above and shrinks to the remaining space.
  - Closing it clears the heatmap photo filter.
- **Tile selection**:
  - Click a day tile to select only that day's photos in a row; drag across days to select a range. Clicking the row label still selects the whole cluster.
  - Selected tiles are outlined, the gallery filters to the selected photos, and the header shows `📊 N from heatmap` with a clear button.
  - Clicking a tile clears the coarse row selection so the selection is exactly what you see.
- **Create folders from the heatmap**:
  - Name/location inputs now include **New folder from selection**, which creates one real event/folder from the highlighted photos (new shared `clusterId`/`tripId`) without touching the rest of the source trip.
  - This is the escape hatch for a large `Trip 1` with visible density gaps: select the later day range, name it, create the folder, and the remaining days stay in the original trip.
- **Safety**:
  - Panel canvas remains capped/virtualized-safe; the sidebar list is capped at 500 rows; the bulk selection bar moves above the panel while it is open.
  - Browser test now covers tile selection -> gallery filter -> create folder.

### Tenth pass - heatmap-first Phase 2 and manual cluster ranges

- **Phase 2 workflow selector**:
  - New choice: **Auto sort** or **Manual clusters in heatmap**.
  - Auto keeps the existing Trips/Places + home/stop pipeline.
  - Heatmap mode still reads EXIF, Timeline and locations, routes screenshots/clutter, then puts all normal photos into one `Uncategorized` group and opens the heatmap panel automatically in draw mode.
- **Manual cluster ranges**:
  - In draw mode, drag anywhere on the timeline to set a global date range, or type precise **Start** / **End** dates.
  - The range is shown as a vertical band, the gallery filters to exactly the photos inside it, and **Create cluster** creates one real folder from them.
  - After creating a cluster the range clears but draw mode stays on, so multiple clusters can be drawn back-to-back.
  - `Screenshot-Clutter` is always excluded from range selection.
- **Why it matters**:
  - A large `Trip 1` with density gaps can now be split into several named folders directly on the timeline; the remaining photos stay in `Uncategorized` (heatmap mode) or in the original trip (auto mode).
- **Tests**:
  - Playwright now also covers the heatmap-first flow: select heatmap mode -> prepare -> panel opens in draw mode -> set Start/End -> create a named folder.
  - Service worker cache bumped to `clustr-shell-v10`.

### Eleventh pass - tidy Phase 2 controls

- Phase 2 settings are no longer a wall of selects.
  - Two primary actions: **📊 Heatmap clustering** (cyan, prominent) and **⚡ Auto clustering**.
  - The auto button has a **⚙️** cog that toggles manual clustering settings (profile, sensitivity, min photos, Random min) only when needed.
  - Small secondary actions remain: **Open heatmap** and **Manual trip**.
- This makes the heatmap the clear core tool and keeps auto tuning out of the way.
- Service worker cache bumped to `clustr-shell-v10`.

### Twelfth pass - bottom heatmap, click-start/end clustering

- **Heatmap panel truly at the bottom**:
  - The panel was accidentally rendered as a sibling of the main column, so the outer flex row pushed it to the right and shrank the gallery. It now lives inside the main column below the gallery: gallery on top, panel across the bottom.
  - Gallery tile size drops from 150 px / 8 columns to 92 px / up to 12 columns while the heatmap is open, so more photos stay visible above it.
- **Heatmap clustering now pre-builds the visible bursts**:
  - Heatmap mode runs the same density segmentation with a 12 h parent gap, so every separate burst in the heatmap becomes its own cluster/folder immediately.
  - The panel still opens in draw mode for editing or adding more clusters.
- **Click-start / click-end painting**:
  - In draw mode, the first click sets the cluster start (dashed marker), the second click sets the end (full band).
  - A third click starts a new cluster. Dragging still selects a range, and Start/End inputs still work for precision.
- Service worker cache bumped to `clustr-shell-v10`.

### Known limitations / next steps

1. **Timeline coverage matters** - if the Timeline JSON does not cover the photo dates (for example Croatia May 2026 vs a July–October Timeline), those photos have no location. They will be grouped by density into one flat trip folder without stops. Import a Timeline covering those dates for location names/stops.
2. **Location-less trips are flat** - without GPS/Timeline coordinates there are no meaningful stop subfolders, so the whole trip is one folder.
3. **Local AI over HTTPS** - Ollama at `http://localhost:11434` may be restricted when the PWA is served from Vercel HTTPS. Use local serving / `vercel dev` for local AI.
4. **Ollama presets** - default preset names may not be installed; the app lists installed models and preflights the selected one.
5. **Project storage** - still one IndexedDB project; a project picker is the next storage task.
6. **Build system** - still in-browser Babel; Vite modules are the next architecture task.

### Continue here

- Repository: https://github.com/Blck-Brd/Clustr
- Deploy: Vercel Root Directory = `app`; Framework `Other`; Build/Output/Install/Dev commands empty; no overrides.
- After deploying, hard-reload once (Ctrl+Shift+R) because the PWA shell cache was bumped to `clustr-shell-v10`.
- Local run: `npm run dev` → http://127.0.0.1:4173/
- Tests: `npm run check`, `npm test`, `npm run test:browser`.
- Next recommended task: run the full `D:\Fotky` library once and tune `randomMinPhotos` / clutter cutoff; then import a Timeline covering the photo dates, then project picker + Vite build.
