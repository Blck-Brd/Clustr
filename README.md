# AI Photo Sorter

A single-file, browser-based photo organizer. It reads EXIF metadata, imports Google Timeline data, clusters photos into events, generates visual tags with a local vision model, and exports a folder hierarchy with Adobe Lightroom XMP sidecar files.

Open `index.html` in a modern Chromium browser (Chrome, Edge, Brave). There is no build step and no backend.

## Features

- **EXIF extraction** – capture date, camera, GPS, and automatic season / time-of-day tags.
- **RAW + HEIC previews** – embedded thumbnails via exifr, HEIC conversion via heic2any, TIFF/RAW decoding via UTIF.
- **Google Timeline import** – reverse-geocodes photos and fills location gaps using anchor interpolation.
- **AI event clustering** – groups photos by time and location, then names the groups with Ollama or Gemini.
- **Vision tagging** – batch or single-image tagging with Moondream / Llama Vision through Ollama.
- **Folder tree** – nested folders with drag & drop, rename, wrap, and bulk editing.
- **Tinder mode** – fast keep / discard review with arrow keys.
- **Lightroom export** – writes photos into folders and generates XMP sidecars with escaped keywords and city metadata.
- **CZ / EN UI** and persisted settings (models, home location, folders).

## Requirements

- A Chromium-based browser (the export uses the File System Access API).
- Optional: [Ollama](https://ollama.com/) running at `http://localhost:11434` for local AI.
- Optional: a Gemini API key for cloud text analysis.

## Usage

1. Open `index.html`.
2. Click **Upload Folder** and pick a photo directory.
3. Optionally import a Google Timeline JSON file.
4. Run **Extract EXIF**, then **Create Events**, then **Visual Tags**.
5. Review in **Tinder** mode, adjust folders/tags, and use **Export** to write the sorted result.

## Data & privacy

- `Timeline.json` and other location-history files are excluded by `.gitignore`.
- API keys are entered at runtime and are never stored in this repository.
- If Firebase globals (`__firebase_config`, `__app_id`) are present, the app syncs workspace metadata through Firestore; otherwise it stays local.
- Previous HTML versions are kept for reference under `AI Image sorter/`.

## Notes

- The app loads React, Babel, Tailwind, exifr, heic2any, and UTIF from CDNs, so the first load needs an internet connection.
- Babel transforms JSX in the browser; this is convenient for a single-file tool but slower than a pre-built bundle.
