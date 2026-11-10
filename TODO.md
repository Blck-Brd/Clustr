# Clustr TODO

## Workflow / UX

- [ ] **Refine workflow design** - make one clear end-to-end path: choose Phase 2 mode → review/paint clusters in the heatmap → name folders → optional AI naming → export. Keep Auto sort as the quick path and the heatmap as the main manual tool.
  - [ ] Add undo/redo for drawn cluster ranges and created clusters.
  - [ ] Allow editing an existing cluster’s Start/End directly in the heatmap.
  - [ ] Support draft clusters (draw several ranges first, then apply them together).
  - [ ] Keep the folder tree visibly in sync while editing from the heatmap (verify with real data).
  - [ ] Add keyboard support and clearer empty/loading states in the panel.

## Next features

- [ ] **Ko-fi profile rework** - redesign/rework the Ko-fi profile and its link with the app.
- [ ] **Vercel issues** - document and fix deployment problems (environment variables, PWA/service-worker caching, HTTPS-to-localhost Ollama/CORS, Vercel root directory and headers).

## Clustering / data

- [ ] Import a Timeline JSON covering the photo dates (Croatia May 2026 is not covered by the current July-October Timeline).
- [ ] Review the new cluster heatmap with real data; tune `heatmapRadiusDays`, `maxInactiveDays`, `randomMinPhotos` and stop sensitivity.
- [ ] Add a per-trip stop sensitivity override.
- [ ] Test a full `D:\Fotky` run (35k files) after the large-folder performance pass.

## Storage / architecture

- [ ] Project picker and multiple IndexedDB projects.
- [ ] Chunked/optional cloud sync; IndexedDB remains primary.
- [ ] Vite + module build (remove in-browser Babel).
- [ ] IndexedDB thumbnail cache.
- [ ] Web Worker pool for more metadata work if needed.

## Mobile

- [ ] Test the preview on a real iPhone (Safari + installed PWA) and Android Chrome.
- [ ] Streaming/OPFS ZIP export for large phone batches instead of the in-memory cap.
- [ ] Optional Android `share_target` so photos can be shared into Clustr.
- [ ] Decide whether a mobile-specific guided tour is worth building (currently disabled).

## Discovery

- [ ] Verify the domain in Google Search Console and submit `https://clustr-photo.vercel.app/sitemap.xml`.
- [ ] Add the sitemap to Bing Webmaster Tools.
- [ ] Request indexing for `/`, `/about` and `/o-clustr` after the next production deploy.
- [ ] Add real product screenshots to `/about` once a clean demo library exists.

## Quality

- [ ] Playwright coverage for Phase 2 → cluster review → rename → export.
- [ ] Real-world test with `C:\Users\andre\Pictures` + a Timeline covering those dates.
- [ ] Final PWA offline/update-flow test on Vercel.

## Done

- [x] Timeline v2 (visits, activities, paths, nearest named location).
- [x] Density heatmap clustering (daily trip heatmap + spatiotemporal stop grid).
- [x] Screenshot/Clutter folder, excluded from clustering; size-based clutter detection.
- [x] Clean-state reset button.
- [x] Manual trip window and cluster review heatmap.
- [x] Localhost dev server with automatic Timeline.json loading.
- [x] Manual event/location edits cannot put one photo into two events.
- [x] Real cluster merge shares `tripId`/`clusterId`.
- [x] Random category for small/fuzzy bursts.
- [x] Identical duplicate files deduped on import.
- [x] Deprecated legacy HTML versions removed.
- [x] Heatmap docked as a bottom panel with day/range tile selection and folder creation from the selection.
- [x] Vercel Analytics script + package.
- [x] Heatmap black-screen guards (error boundary, canvas limits, fatal overlay).
- [x] Phase 2 workflow selector: Auto sort or Manual clusters in heatmap.
- [x] Manual cluster Start/End ranges and multiple back-to-back clusters from the heatmap.
- [x] Heatmap pre-clusters visible density bursts.
- [x] Natural folder sorting (`Trip 9` before `Trip 10`) and stable heatmap inputs.
- [x] Heatmap docked at the bottom; gallery tiles shrink while it is open.
- [x] CI fixed to use Playwright’s bundled Chromium; browser smoke test stable on Ubuntu.
- [x] Data Fill phase - Tinder-style location filling that propagates to nearby photos.
- [x] Shared photo engine extracted to `app/core.js` with a clustering parity snapshot.
- [x] Mobile shell: drawer navigation, 2-column gallery, safe-area padding and always-visible tile metadata.
- [x] Camera-roll import with append, duplicate skipping and persistent storage request.
- [x] Mobile ZIP export with XMP sidecars and Web Share fallback.
- [x] Touch-friendly full-screen heatmap with responsive canvases and pointer ranges.
- [x] Mobile AI fallback to Gemini; Ollama and visual tags stay desktop-only.
- [x] SEO setup: canonical/OG/Twitter, JSON-LD, robots, sitemap, English and Czech landing pages with FAQ schema, and a 1200x630 social card.
- [x] SEO validation in `npm run check`; safe service-worker navigation for the landing pages.

