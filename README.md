# Clustr - AI Photo Sorter

Clustr is a local-first, browser-based photo organizer. It reads EXIF metadata, matches photo times against Google Timeline, groups photos into events by time and place, names those events with AI, adds visual tags, and exports a folder hierarchy with Adobe Lightroom XMP sidecars.

It is a single-file React app with no build step and no backend. It can be deployed as a PWA on Vercel or GitHub Pages.

## Workflow

1. **Upload Folder** - select a photo directory.
2. **Timeline JSON (optional)** - import Google Timeline so locations can be assigned by photo time.
3. **Phase 2 - Grouping** - reads EXIF date/time, assigns a location from Timeline (falling back to GPS), interpolates missing locations, groups photos by time and location, applies automatic tags, and sets temporary names such as `Event 1 - Kutná Hora`.
4. **Phase 3 - AI Names** - sends each event summary (date, time, location, tags) to Ollama or Gemini and replaces the temporary names. Manually named events are left untouched.
5. **Phase 4 - Visual Tags** - optional batch or single-image tagging with Moondream / Llama Vision through Ollama.
6. **Review and Export** - use Tinder mode, edit folders/tags, then export photos and XMP sidecars.

### Cluster-level edits

- Selecting a photo and changing its **location** or **event name** in the bulk editor applies the change to every photo in the same event.
- Renaming a folder in the tree also marks the affected event as manually named, so phase 3 will not overwrite it.
- Wrapping events in a parent folder keeps AI naming available for the leaf events.
- Phase 2 preserves manually named events when it is run again.

## Features

- **EXIF extraction** - capture date, camera, GPS, and automatic season / time-of-day tags.
- **Timeline matching** - imports visits, activities and timeline paths, then binary-searches by EXIF time with GPS reverse-geocoding fallback.
- **Local persistence** - photo metadata and Timeline data are saved to IndexedDB and relinked after a refresh by file name, size and modified time.
- **Density-based clustering** - spatiotemporal DBSCAN (1.5 h / 4 km, minimum 3 photos). Dense photo bursts become events; sparse driving photos attach to the nearest event; same-place bursts separated by short breaks merge.
- **Location inheritance** - a manually added location propagates through the event and to nearby photos that have no location of their own (12 h window).
- **RAW + HEIC previews** - embedded thumbnails via exifr, HEIC conversion via heic2any, TIFF/RAW decoding via UTIF.
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

## Repository layout

```text
app/                  PWA source and assets
legacy/html-versions/ Previous single-file HTML versions
tools/                Checks, tests and icon generation
docs/                 Architecture, deployment and Timeline format
```

For Ollama from a local file or local server:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

## Deploy to Vercel

The repository includes `app/vercel.json`, `manifest.webmanifest`, `sw.js`, and PWA icons.

1. Import the repository in Vercel.
2. Set **Root Directory** to `app`.
3. Framework preset: **Other**.
4. Build command: none.
5. Output directory: none.
6. Deploy.

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

**Vision tags are poor**

Small vision models such as Moondream do not follow keyword instructions reliably, so the app asks for a short description and extracts keywords locally. Tags are limited to 8 and cleaned of stopwords. Use a stronger vision model for better results.

## Data & privacy

- `Timeline.json` and other location-history files are excluded by `.gitignore`.
- API keys are entered at runtime and are never stored in this repository.
- Project metadata and Timeline data are stored locally in IndexedDB; photo blobs are never stored.
- If Firebase globals (`__firebase_config`, `__app_id`) are present, only the Gemini API key is synced through Firestore.
- All photo processing happens in the browser.
- Previous HTML versions are kept for reference under `legacy/html-versions/`.

## Notes

- The app loads React, Babel, Tailwind, exifr, heic2any, and UTIF from CDNs, so the first load needs an internet connection.
- Babel transforms JSX in the browser; this is convenient for a single-file tool but slower than a pre-built bundle.
- Phase 2 resets non-manual event names to temporary `Event N - location` names. Manually renamed events (via the tree or bulk editor) are preserved.
