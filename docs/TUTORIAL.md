# Clustr - User Manual

A calm way to sort a big photo library into folders that make sense. Clustr groups photos by time, place and density heatmaps, then exports the folder tree with Lightroom-ready metadata. AI names and visual tags are optional; the sorting itself is local and manual-friendly.

---

## 1. Getting started

1. Open the app and click **Upload Folder**. Choose the folder with your photos.
2. Clustr reads the photos in your browser. You do not need an account.
3. If you want locations from your Google Timeline, click **Timeline JSON** and import the export. This is optional.
4. The **question mark** opens the built-in guide whenever you need it.

The first time you load a folder, Clustr shows a short guided tour with a spotlight on each part of the screen. Skip it whenever you like. To replay it, open the **question mark** and choose **Start tour**.

You can work while previews and metadata are still loading. The sidebar shows each phase with a checkmark when it is done. Settings stay tucked under the **cog icon** next to each phase, so the panel remains compact.

---

## 2. Photos and previews

Clustr accepts JPG, PNG, WebP, HEIC/HEIF, NEF, CR2, ARW, DNG, RAF, ORF and TIFF.

- If a RAW or HEIC file has a same-name JPG beside it, that JPG is used as the preview straight away.
- Otherwise Clustr reads the preview stored inside the file, or converts the HEIC in the background.
- A tile that says **No preview** has no preview Clustr can read. The photo is still sorted and exported normally.

On the first run, a large RAW folder can take a while because every file has to be read from disk. Paired JPGs make this much faster.

---

## 3. Phase 1 - EXIF metadata

Click **Extract EXIF**. Clustr reads the capture date, camera, GPS and location, and adds gentle automatic tags such as the season and time of day.

Open the **cog** to set **Where is home?**. This helps Clustr tell a home photo session apart from a real trip.

---

## 4. Phase 2 - Clustering and heatmaps

This is the main sorting step. You can use it in two ways:

- **Heatmap clustering** - prepares the photos and opens the bottom heatmap in drawing mode. Draw a date range or set Start/End, then create a folder from the selected photos.
- **Auto clustering** - builds trips, stops, home sessions, Random and Screenshot-Clutter automatically.

Open the **cog** to tune the sort: profile, trip and stop sensitivity, home radius, session gaps and the Random minimum.

### The folder tree

The **Folder Tree** on the left filters the gallery. Click a folder to show its contents, including every subfolder. Click it again to remove the filter.

Above the photo tiles, the breadcrumb bar always tells you what you are looking at:

- **All photos** when nothing is filtered.
- One row for each selected folder, for example `Trip 1 → Stop 2 - Turnov`.
- Several rows when several folders are selected.

The **×** on a row clears that folder filter.

### Adding another cluster to an existing folder

1. In the heatmap panel, select or draw the next cluster.
2. Under **Add to existing folder**, choose the target folder. The picker shows the folder hierarchy with indentation.
3. Click **Add**.

The selected photos join that folder and inherit its location. This is the quick way to put 30 Turnov photos, two weeks of Croatia and another 90 Turnov photos into the same Turnov folder.

### Naming a new folder

The **New folder from selection** field is one folder name. Typing `Something xx/yy` creates a single folder named `Something xx - yy`; it does not create subfolders.

---

## 5. Phase 3 - Event names (optional)

Open the **cog** to choose whether names apply to trips or stops, and which Ollama or Gemini model to use. You can also enter a custom model name and a Gemini API key there.

Click **Name events** to replace temporary names. Events you renamed yourself are protected and will not be overwritten.

---

## 6. Phase 4 - Visual tags (optional)

Open the **cog** to choose the vision model, then click **Visual tags**. Clustr describes each photo and turns the description into a few useful keywords.

This phase needs Ollama running on your computer. If you do not need tags, simply skip it.

---

## 7. Phase 5 - Data fill (optional)

Click **Fill locations**. Clustr shows photos that still have no location, one at a time.

- Type a place and press **Enter**, or click **Apply**.
- The place is applied to the photo and to nearby photos without a location.
- Use **Skip** to leave a photo unchanged.
- **Esc** closes the phase.
- The **cog** sets how many hours count as "nearby" (12 hours by default).

---

## 8. Reviewing and editing

- **Tinder** - keep or discard photos with the left and right arrow keys.
- **Folder tree** - rename folders, wrap events in a parent folder, split a folder or edit several photos at once.
- **Heatmap panel** - filter by day, draw another cluster, rename clusters or add photos to an existing folder.
- **Bulk edit** - select photos and change their event, location or tags together.

Finished phases show a green checkmark. Phases 3, 4 and 5 are optional and say so.

---

## 9. Exporting

Click **Export**, choose a destination folder and confirm. A progress window shows the current photo, the number of photos written and a progress bar.

Clustr writes the photos into their folder hierarchy and adds a Lightroom-readable `.xmp` sidecar next to each file. The sidecar includes:

- **Keywords** - your tags, the event name and the location.
- **Folder hierarchy** - the event path, for example `Trip 1|Stop 2 - Turnov`.
- **Location** - the place name in Lightroom's City and Location fields.

Use a Chromium-based browser for export; it uses the browser's folder access feature.

---

## 10. Your data, in plain words

Clustr is local-first. Your photos, metadata and Timeline stay in your browser (IndexedDB). Photo files are never uploaded, and nothing is stored in the repository.

AI naming and visual tags are optional. Ollama runs on your computer. If you choose Gemini, only the text summaries are sent to Google with your API key. Reverse geocoding for GPS coordinates uses OpenStreetMap Nominatim. If you never use those features, Clustr stays entirely on your device.

---

## 11. Troubleshooting

### Previews

- **A RAW tile says No preview** - the file has no embedded preview and no same-name JPG. It still exports normally.
- **A preview stays on "Loading preview" too long** - reload the page once. Large RAW folders are simply slow on the first run.
- **Previews still look old after an update** - a hard reload (Ctrl+Shift+R, or close and reopen the installed app) loads the newest version.

### Sorting

- **A trip is split into several folders** - open the Phase 2 cog and increase the trip gap or lower the sensitivity.
- **Stops are missing** - there may be no Timeline or GPS locations for those days. Import a Timeline that covers the photo dates, then run Phase 2 again.
- **A second cluster should join a folder** - use **Add to existing folder** in the heatmap instead of creating a new folder.

### Export

- **Export is unavailable** - use a Chromium-based browser.
- **Lightroom does not show the tags** - import the `.xmp` sidecars or make sure Lightroom is set to read sidecar files for RAW photos.
- **The export stopped** - check that the destination still exists and has enough free space, then run it again.

### Ollama and Gemini

- **Ollama does not respond** - start Ollama, set `OLLAMA_ORIGINS=*` and restart it. AI phases are optional.
- **A model is missing** - pull it first, for example `ollama pull llama3.2`.
- **Gemini says the key is invalid** - paste the key again in the Phase 3 cog and check that the selected model is available for your account.

---

## 12. Still stuck

Open an issue at **https://github.com/Blck-Brd/Clustr/issues** and describe what you see and what you expected. A screenshot helps. If a specific photo misbehaves, mention its format (NEF, HEIC, JPG) and whether it has a same-name JPG beside it.

Thank you for sorting with Clustr.
