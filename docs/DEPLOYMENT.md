# Deployment

## Vercel

The app lives in `app/` and is a static PWA with no build step.

1. Import the repository in Vercel.
2. Set **Root Directory** to `app`.
3. Framework preset: **Other**.
4. Build command: empty.
5. Output directory: empty (serve the root of `app/`).
6. Deploy.

`app/vercel.json` sets caching for the service worker, manifest content type and immutable icons.

## GitHub Pages

GitHub Pages serves the repository root. The app is therefore reachable at `/Clustr/app/` unless you publish only the `app/` folder. Relative manifest, icon and service-worker paths keep it functional either way.

## Local

```powershell
npm run dev
```

This serves `app/` with `npx serve`. Opening `app/index.html` directly also works for most features.

## Local AI note

When the PWA is served over HTTPS, browsers may block requests to `http://localhost:11434` through mixed-content or Private Network Access rules. Use the local server (`npm run dev`) for Ollama, or run `OLLAMA_ORIGINS=*` and a local proxy if you need the deployed app to reach local AI.
