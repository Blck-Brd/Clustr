# Deployment

## Vercel

The app lives in `app/` and is a static PWA with no build step.

1. Import the repository in Vercel.
2. **Root Directory**: `app` (this is the important one).
3. Framework Preset: **Other**.
4. Build Command: **leave empty / override off**.
5. Output Directory: **leave empty / override off** (Vercel serves the root of `app/`).
6. Install Command: **leave default / empty** (there are no runtime dependencies).
7. Development Command: **None / empty**.
8. Deploy.

If Vercel shows placeholder text such as `npm run build` or `public`, do not enable
the **Override** switch for those fields. With Root Directory `app` there is no
`package.json` in the deployed directory, so Vercel treats it as a plain static site.
The root `package.json` is only for local tests.

After deploying a new version, a previously installed PWA can keep the old app shell.
Bump `CACHE_NAME` in `app/sw.js` (already done for this release) and hard-reload once
(Ctrl+Shift+R) if the new UI does not appear.

`app/vercel.json` sets caching for the service worker, manifest content type and immutable icons.

### Analytics

`@vercel/analytics` is installed, and `app/index.html` injects Vercel's static
`/_vercel/insights/script.js` on non-localhost hosts. Enable **Web Analytics** for
the project in the Vercel dashboard once after deploying. Localhost is skipped so
local runs do not produce 404s.

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
