# Clustr Tutorial (English)

Clustr is a local-first photo organizer. It groups photos into cluster folders using time, place and density heatmaps, then exports the folder tree with Adobe Lightroom XMP sidecars. AI event names and visual tags are optional.

## 1. Load your photos

1. Click **Upload Folder** and choose the folder that contains your photos.
2. Clustr accepts JPG, PNG, WebP, HEIC/HEIF, NEF, CR2, ARW, DNG, RAF, ORF and TIFF.
3. Previews load in the background:
   - If a RAW/HEIC file has a same-name JPG next to it, the JPG is used immediately.
   - Otherwise Clustr reads the embedded preview or converts the HEIC in a worker.
   - A tile that says **No preview** has no extractable preview; the photo is still exported normally.

You can start working while previews are still loading. Phase progress no longer overwrites finished previews.

## 2. Import Timeline (optional)

Click **Timeline JSON** and choose your Google Timeline export. Clustr uses the time of each photo to find visits, activities and paths, and assigns a location when the photo has no GPS.

## 3. Phase 1 - EXIF metadata

Click **Extract EXIF**. Clustr reads capture date, camera, GPS and location, and adds automatic season/time-of-day tags.

Open the **cog** next to Phase 1 to set **Where is home?**. This helps separate home sessions from real trips.

## 4. Phase 2 - Clustering & heatmaps

This is the main sorting step. You have two modes:

- **Heatmap clustering** - prepares the photos and opens the bottom heatmap panel in draw mode. Draw a range or set Start/End, then create a folder from the selected photos.
- **Auto clustering** - builds trips, stops, home sessions, Random and Screenshot-Clutter automatically.

Phase 2 settings (profile, trip/stop sensitivity, home radius, session gaps, Random minimum) are behind the **cog**.

### Folder tree and breadcrumbs

The left **Folder Tree** filters the gallery. Click a folder to show its contents, including all subfolders.

Above the photo tiles you will always see:

- **All photos** when nothing is filtered.
- One row per selected folder using the path format `Parent → Child → Stop`, for example `Trip 1 → Stop 2 - Turnov`.
- Multiple rows when several folders are selected.

Click the **×** on a breadcrumb row to clear that folder filter.

### Add a second cluster to an existing folder

1. In the heatmap panel, select or draw the second cluster.
2. Choose the target folder under **Add to existing folder**. The picker shows the folder hierarchy with indentation.
3. Click **Add**.

The selected photos join that folder and inherit its location. This is useful when you have 30 photos from Turnov, two weeks in Croatia, and then 90 more Turnov photos that belong in the same folder.

### Folder names

The **New folder from selection** name is a single folder name. Typing `Something xx/yy` creates one folder named `Something xx - yy`; it does not create subfolders.

## 5. Phase 3 - Event names (optional)

Open the **cog** to choose:

- whether names apply to trips or stops/subfolders,
- an Ollama or Gemini model,
- custom model names and the Gemini API key.

Click **Name events** to replace placeholder names. Manually named events are protected from AI renaming.

## 6. Phase 4 - Visual tags (optional)

Open the **cog** to choose the vision model (Moondream, Llama Vision or a custom Ollama model), then click **Visual tags**. Clustr describes each photo and turns the description into keyword tags.

## 7. Phase 5 - Data fill (optional)

Click **Fill locations**. Clustr shows one photo at a time that is missing a location.

- Type a place and press **Enter** or click **Apply**.
- The location is applied to the photo and to nearby photos without a location.
- Use the **cog** to change the nearby time window (default 12 hours).
- **Skip** leaves the photo unchanged; **Esc** closes the phase.

## 8. Review and export

- **Tinder** - keep or discard photos with the left/right arrow keys.
- Folder tree - rename, wrap, split or bulk-edit events and locations.
- **Export** - choose a destination folder and confirm. A progress dialog shows the current photo and a progress bar.
- Clustr writes the photos and a Lightroom-readable `.xmp` sidecar next to each file.

### Lightroom metadata

Each XMP sidecar contains:

- `dc:subject` - flat keywords (tags, event leaf name, location).
- `lr:hierarchicalSubject` - the event path as a Lightroom hierarchy, for example `Trip 1|Stop 2 - Turnov`.
- `photoshop:City` - the location.
- `Iptc4xmpCore:Location` - the same location in Lightroom's Location field.

## Tips

- Completed phases show a green checkmark. Optional phases are labelled `(optional)`.
- Settings stay hidden behind the phase cog, so the sidebar remains compact.
- Large RAW folders take longer on the first run because previews and EXIF are read from disk. Paired JPGs make this much faster.
- Clustr is local-first: photos, metadata and Timeline data stay in your browser (IndexedDB). Ollama and Nominatim are optional network services.
- After an update, hard-reload once (Ctrl+Shift+R) so the new service worker and preview worker are used.

## Troubleshooting

- **A raw tile says No preview** - the file has no embedded preview and no JPG sibling. The file still exports.
- **A preview stays on "Loading preview" too long** - reload once, then check that the service worker updated (see above).
- **Ollama does not respond** - run Ollama locally, set `OLLAMA_ORIGINS=*` and restart it. AI phases are optional.
- **Export is unavailable** - use a Chromium-based browser; the export uses the File System Access API.
