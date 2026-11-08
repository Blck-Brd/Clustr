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

This serves `app/` at **http://127.0.0.1:4173/** and also exposes the root `Timeline.json` at `/Timeline.json`. When that file exists, the app imports it automatically. Opening `app/index.html` directly also works for most features, but workers and the auto-loaded Timeline are more reliable through the local server.

Browser smoke test (uses installed Chrome):

```powershell
npm run test:browser
```

## Local AI note

When the PWA is served over HTTPS, browsers may block requests to `http://localhost:11434` through mixed-content or Private Network Access rules. Use the local server (`npm run dev`) for Ollama, or run `OLLAMA_ORIGINS=*` and a local proxy if you need the deployed app to reach local AI.
