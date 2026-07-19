# Mapbox production build on Zeabur

Mapbox GL runs in the browser, so it needs a **public** token at frontend build time. A
Zeabur runtime variable cannot change an already-built Vite bundle.

## 1. Create the production token

In Mapbox, create a dedicated public token with prefix `pk.` and only the scopes needed by
this dashboard:

```text
styles:read
fonts:read
```

Set this exact URL restriction (origin only, no path or wildcard):

```text
https://nod-dashboard-secure.zeabur.app
```

Use a separate development token that allows `http://localhost:5173`. Never use or expose
an `sk.` token in the frontend.

## 2. Configure the GitHub Actions variable

Open:

```text
Rianyeah/nod-dashboard
-> Settings
-> Secrets and variables
-> Actions
-> Variables
-> New repository variable
```

Configure:

```text
Name: VITE_MAPBOX_TOKEN
Value: pk.<public-token-mapbox>
```

It must be on the **Variables** tab because the workflow reads
`${{ vars.VITE_MAPBOX_TOKEN }}`. Do not place this value only in Zeabur.

The publish job and Dockerfile now fail before publishing when the value is empty, starts
with `sk.`, or does not start with `pk.`. The token value is never printed.

## 3. Publish and deploy

After the GitHub variable is present:

1. Merge the verified branch into `main`.
2. Wait until both `verify` and `publish` are green.
3. Copy the immutable image SHA produced by the workflow.
4. Update the prebuilt image in Zeabur and redeploy.

## 4. Production troubleshooting checklist

Check in this order:

1. Open `/site-map`; the route must render even if Mapbox fails.
2. Confirm the browser console has no uncaught Mapbox exception.
3. Confirm the Mapbox style request returns `200`.
4. `401` means the token is invalid or deleted.
5. `403` means token scope or URL restriction is wrong.
6. `429` means the Mapbox rate limit was reached.
7. Confirm `/api/v1/map/sites` returns `200`; `401` is a session problem and `500` is a backend/database problem.
8. Confirm the Mapbox canvas has nonzero width and height.
9. Test Standard, Satellite, sectors, markers, popup, fullscreen, and sidebar resize.
10. In RF Tilt, run an analysis and test Coverage Map, style switching, target pin drag, and route navigation.

The UI shows basemap/token/WebGL errors separately from marker API errors. A marker API
failure leaves the basemap and site table usable; a Mapbox failure leaves the site table
usable.
