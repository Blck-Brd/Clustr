# Clustr TODO

## Next features

- [ ] **Location Tinder** - show a small queue of photos with missing locations (ideally a representative photo from each cluster). The user enters the location manually, and the app applies it to the whole cluster. Extend the same flow to event names if useful.
- [ ] **Ko-fi profile rework** - redesign/rework the Ko-fi profile and its link with the app.
- [ ] **Vercel issues** - document and fix deployment problems (environment variables, PWA/service-worker caching, HTTPS-to-localhost Ollama/CORS, Vercel root directory and headers).

## Clustering / data

- [ ] Import a Timeline JSON covering the photo dates (Croatia May 2026 is not covered by the current July-October Timeline).
- [ ] Review the new cluster heatmap with real data; tune `heatmapRadiusDays`, `maxInactiveDays` and stop sensitivity.
- [ ] Add a per-trip stop sensitivity override.
- [ ] Add a "merge clusters" action that also shares `tripId`/`clusterId`, not only the display name.

## Storage / architecture

- [ ] Project picker and multiple IndexedDB projects.
- [ ] Chunked/optional cloud sync; IndexedDB remains primary.
- [ ] Vite + module build (remove in-browser Babel).
- [ ] IndexedDB thumbnail cache.
- [ ] Web Worker pool for more metadata work if needed.

## Quality

- [ ] Playwright coverage for Phase 2 → cluster review → rename → export.
- [ ] Real-world test with `C:\Users\andre\Pictures` + a Timeline covering those dates.
- [ ] Final PWA offline/update-flow test on Vercel.

## Done

- [x] Timeline v2 (visits, activities, paths, nearest named location).
- [x] Density heatmap clustering (daily trip heatmap + spatiotemporal stop grid).
- [x] Screenshot/Clutter folder, excluded from clustering.
- [x] Clean-state reset button.
- [x] Manual trip window and cluster review heatmap.
- [x] Localhost dev server with automatic Timeline.json loading.
