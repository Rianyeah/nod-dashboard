# Security deployment runbook

## Build and image selection

CI verifies every pull request and publishes the main-branch container as `ghcr.io/rianyeah/nod-dashboard:<git-sha>`. The SHA tag is immutable for a given commit. Before deploying or updating a Zeabur prebuilt service, replace `REPLACE_WITH_GIT_SHA` in the image reference with the successful workflow's full commit SHA. Do not deploy `latest`.

The Mapbox value used at build time is a publishable browser token, not a server secret. Restrict it to this dashboard's approved origins in Mapbox and configure it as the GitHub Actions variable `VITE_MAPBOX_TOKEN`; never use a privileged Mapbox token.

## Generate required secrets locally

Run these commands locally. Copy only the resulting values into Zeabur's Variables panel; do not save them in a tracked file or CI log.

```powershell
python -c "from getpass import getpass; from argon2 import PasswordHasher; print(PasswordHasher().hash(getpass('Dashboard password: ')))"
python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Use the first output for `DASHBOARD_PASSWORD_HASH`, the second for `DASHBOARD_SESSION_SECRET`, and the third for `N8N_API_KEY`.

## Required Zeabur variables

Set the following values in the dashboard service configuration:

- `APP_ENV=production`
- `PUBLIC_APP_ORIGIN=https://nod-dashboard.zeabur.app`
- `ALLOWED_HOSTS=nod-dashboard.zeabur.app`
- `DATABASE_URL` with the production PostgreSQL URL
- `DASHBOARD_USER` with the chosen operator username
- `DASHBOARD_PASSWORD_HASH` from the local Argon2id command
- `DASHBOARD_SESSION_SECRET` from the local random-secret command
- `DASHBOARD_SESSION_TTL_SECONDS=28800`
- `SESSION_COOKIE_SECURE=true`
- `N8N_API_KEY` from the local random-key command, for admin refreshes and alert webhooks
- `N8N_MAP_API_KEY` from a separate local random-key command, for read-only map exports

Configure `REDIS_URL` when the managed Redis service is available. The application still starts without Redis, but distributed rate limiting should be added before scaling past one API process.

Rotating `DASHBOARD_SESSION_SECRET` invalidates all active dashboard sessions and is the emergency session-revocation procedure.
