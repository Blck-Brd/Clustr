# Clustr - AI Photo Sorter

Clustr is a local-first, browser-based photo organizer. It reads EXIF metadata, matches photo times against Google Timeline, groups photos into events by time and place, names those events with AI, adds visual tags, and exports a folder hierarchy with Adobe Lightroom XMP sidecars.

It is a single-file React app with no build step and no backend. It can be deployed as a PWA on Vercel or GitHub Pages.

## Workflow

1. **Upload Folder** - select a photo directory.
2. **Timeline JSON (optional)** - import Google Timeline so locations can be assigned by photo time.
3. **Phase 2 - Grouping** - choose **Auto sort** (density trips/stops, home sessions, Random) or **Manual clusters in heatmap**. Auto reads EXIF, Timeline and locations and builds the event tree. Heatmap mode prepares the photos and opens the bottom heatmap panel in draw mode; drag a date range or set Start/End and create each cluster/folder manually. The event tree is still available for AI naming and export.
4. **Phase 3 - AI Names** - sends each event summary (date, time, location, tags) to Ollama or Gemini and replaces the temporary names. Manually named events are left untouched.
5. **Phase 4 - Visual Tags** - optional batch or single-image tagging with Moondream / Llama Vision through Ollama.
6. **Review and Export** - use Tinder mode, edit folders/tags, then export photos and XMP sidecars.

### Cluster-level edits

- Phase 2 creates `Trip N` folders with `Stop N - location` subfolders, plus `Home N` sessions. Rename `Trip N` to “Vacation”.
- Selecting a photo and changing its **location** or **event name** in the bulk editor applies the change to every photo in the same stop/event. A single stop rename keeps its trip folder; selecting multiple events merges them into one event.
- Renaming a folder in the tree also marks the affected event as manually named, so phase 3 will not overwrite it.
- Wrapping events in a parent folder keeps AI naming available for the leaf events.
- Phase 2 preserves manually named events (including their cluster/trip identity) when it is run again.

## Features

- **EXIF extraction** - capture date, camera, GPS, and automatic season / time-of-day tags.
- **Timeline matching** - imports visits, activities and timeline paths, binary-searches by EXIF time, and resolves unnamed coordinates to the nearest named Timeline location before falling back to GPS/Nominatim.
- **Local persistence** - photo metadata and Timeline data are saved to IndexedDB and relinked after a refresh by file name, size and modified time.
- **Trips + home hierarchy (default)** - a smoothed **daily photo-density heatmap** finds active days and rest valleys, so one vacation becomes one trip folder. Nearby density episodes are merged into one parent trip; internal segments become stop subfolders only when there are enough located photos. Stops use a spatiotemporal **grid heatmap**.
- **Places/density profile** - the same grid heatmap used as flat place events if you do not want trip folders.
- **Screenshot / Clutter folder** - Czech/English screenshots, lossless images without camera/location, very small no-EXIF images, Downloads/meme paths and similar clutter go to `Screenshot-Clutter`, outside the clustering.
- **Random category** - small, short, location-less bursts and leftovers go to one `Random` folder instead of creating a full event per burst; `randomMinPhotos` is adjustable.
- **Duplicate-safe import** - identical files (same name, size and modified time) are loaded once and reported.
- **Clean state** - the 🧹 button clears IndexedDB, local settings and cloud metadata.
- **Manual trip window** - create one trip folder from all photos in a date range (e.g. 2–8 May) with an optional whole-trip location.
- **Cluster review heatmap** - docked bottom panel; review clusters over time or on a map, click a day tile or drag a range to filter the gallery, then create a folder directly from the selected photos.
- **Heatmap-first Phase 2** - choose auto sort or heatmap clustering; heatmap mode pre-builds one cluster per visible density burst, opens the bottom panel in draw mode, and supports click-start/click-end, drag ranges and Start/End date inputs for adding more folders.
- **TODO roadmap** - see `TODO.md` for Location Tinder, Ko-fi profile rework, Vercel issues and remaining architecture tasks.
- **Auto + manual sensitivity** - Auto derives the trip/home or place window from the dataset. Trip sensitivity (gap, home radius, session gap) and stop/place sensitivity (time, space, min photos) are separate.
- **Trip or stop AI naming** - Phase 3 can name the top-level trip folders or the stop subfolders, preserving the other level.
- **Manual cluster edits** - Split selected photos into a new event, or merge events by renaming them together.
- **Location inheritance** - a manually added location propagates through the event and to nearby photos that have no location of their own (12 h window).
- **RAW + HEIC previews** - embedded thumbnails via exifr, HEIC conversion via heic2any, TIFF/RAW decoding via UTIF.
- **Worker pool** - EXIF parsing runs in a pool of dedicated workers; Nominatim geocoding runs in a serialized geocode worker.
- **Virtualized gallery** - only visible photo tiles are mounted, so 2,000+ photos stay responsive.
- **AI event names** - strict JSON prompts, output-shape normalization, retries, and clear model errors.
- **Vision tagging** - short image descriptions converted into cleaned keyword tags.
- **Folder tree** - nested folders with drag & drop, rename, wrap, and bulk editing.
- **Tinder mode** - fast keep / discard review with arrow keys.
- **Lightroom export** - Windows-safe folder/file names, duplicate handling, and escaped XMP keywords and city metadata.
- **PWA** - installable app shell with a service worker and offline caching for the app and CDN libraries.
- **CZ / EN UI** and persisted settings (models, home location, folders).

## Requirements

- A Chromium-based browser (the export uses the File System Access API).
- Optional: [Ollama](https://ollama.com/) running at `http://localhost:11434` for local AI.
- Optional: a Gemini API key for cloud text analysis.

The event-naming model must be installed in Ollama. The app detects installed models and lists them in the dropdown, but the built-in preset names still require an explicit pull (for example `ollama pull llama3.2` or `ollama pull gemma2:2b`).

For Gemini, the presets use valid API model IDs (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`). Any other model can be entered via **Google Gemini: Custom model**.

## Local usage

Open `app/index.html` directly, or serve the app folder locally:

```powershell
npm run dev
```

This serves the app at **http://127.0.0.1:4173/** and exposes the root `Timeline.json` at `/Timeline.json`; when present, the app imports it automatically on load. The personal file stays ignored by Git.

Browser smoke test (requires installed Chrome):

```powershell
npm run test:browser
```

## Repository layout

```text
app/                  PWA source and assets
tools/                Checks, tests and icon generation
docs/                 Architecture, deployment, Timeline format and DEVLOG
```

For Ollama from a local file or local server:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

See `docs/DEPLOYMENT.md` for details.

> Note: When the app is served over HTTPS, browsers may restrict HTTP requests to `http://localhost` because of mixed-content / Private Network Access rules. Local AI through Ollama is most reliable when the app is opened locally (`index.html`, `http://localhost`, or `vercel dev`) rather than from the public HTTPS deployment.

## Troubleshooting

**"Ollama neodpovídá" / no installed models appear**

Ollama must be running and must allow requests from the page origin. Start it with CORS enabled, then reload the app:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

**Event names are generic or missing**

Event naming sends a strict JSON prompt, validates the response shape, retries missing names, and reports model errors instead of silently falling back. If a model still returns poor names, try `gemma2:2b` or a larger text model. Remaining clusters get a location/date-based fallback name, never just `Archiv ...`.

**Locations are wrong or missing**

Timeline matching uses EXIF time with a 2-hour tolerance. Photos without a Timeline match fall back to GPS; missing locations are interpolated from the nearest known location within 12 hours and then filled from the cluster's dominant location. Manual location edits are preserved on re-runs.

Important: the imported Timeline must cover the **photo dates**. If it does not, those photos have no location and are grouped by density into one flat trip folder (no stop subfolders) rather than being split by fixed time gaps.

**Screenshots/clutter still appear in events**

They should be routed to `Screenshot-Clutter`. Detection covers English and Czech “screenshot/obrazovky” names, `Screenshots`/clutter folder paths, and PNG/WebP/GIF images with no camera and no location. Re-run Phase 2 after updating.

**Vision tags are poor**

Small vision models such as Moondream do not follow keyword instructions reliably, so the app asks for a short description and extracts keywords locally. Tags are limited to 8 and cleaned of stopwords. Use a stronger vision model for better results.

## Data & privacy

- `Timeline.json` and other location-history files are excluded by `.gitignore`.
- API keys are entered at runtime and are never stored in this repository.
- Project metadata and Timeline data are stored locally in IndexedDB; photo blobs are never stored.
- If Firebase globals (`__firebase_config`, `__app_id`) are present, only the Gemini API key is synced through Firestore.
- All photo processing happens in the browser.

## Notes

- The app loads React, Babel, Tailwind, exifr, heic2any, and UTIF from CDNs, so the first load needs an internet connection.
- Babel transforms JSX in the browser; this is convenient for a single-file tool but slower than a pre-built bundle.
- Phase 2 resets non-manual names to temporary `Trip N/Stop M - location`, `Home N` or `Event N` names. Manually renamed events (via the tree or bulk editor) are preserved.

## Continue here

See `docs/DEVLOG.md` for the current checkpoint, test results and next tasks.
