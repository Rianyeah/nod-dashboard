# Dashboard Security Hardening Design

**Date:** 2026-07-18

**Status:** Approved for implementation planning

**Scope:** Findings SEC-001 through SEC-010 in `security_best_practices_report.md`

## Objective

Replace the dashboard's client-only access gate and fixed bearer token with a production-safe, same-origin authentication system while preserving the existing username/password login experience. The change must deny anonymous API access, remove fallback secrets, limit abuse-prone endpoints, harden browser responses, and keep local development practical.

## Goals

- Authenticate the dashboard with a required environment-configured administrator and Argon2id password hash.
- Store an expiring signed session in an `HttpOnly` cookie rather than browser storage.
- Enforce authentication at FastAPI router boundaries so endpoints cannot accidentally omit it.
- Remove production cross-origin access and validate the origin of unsafe browser requests.
- Remove all production fallback credentials and refuse insecure production startup.
- Rate-limit login and RF analysis requests and bound RF analysis work.
- Disable production API documentation and add trusted-host and browser security headers.
- Remove identified HTML injection sinks from map rendering.
- Upgrade known vulnerable frontend dependencies and make backend dependency resolution reproducible.
- Prove the security behavior with backend, frontend, build, and browser tests.

## Non-goals

- Corporate OIDC/SSO integration. The design keeps clean authentication boundaries so OIDC can replace the single-admin verifier later.
- User registration, password recovery, multiple roles, or a user database.
- Cloudflare Access, VPN, or other access-proxy provisioning. Those remain recommended defense-in-depth deployment options.
- HSTS deployment. TLS termination is controlled by Zeabur, and HSTS requires a separate operational rollout decision.

## Architecture

### Authentication components

`backend/security.py` becomes the single security boundary and owns:

- production security configuration validation;
- Argon2id password verification;
- signed session creation and validation;
- cookie settings and expiration;
- same-origin enforcement for unsafe browser methods;
- N8N key verification using constant-time comparison.

The signed session uses a maintained signing library rather than custom cryptography. Its payload contains only the authenticated subject identifier and a session version. The signature timestamp enforces expiration. Because the session is stateless, rotating `DASHBOARD_SESSION_SECRET` invalidates every active session; logout removes the browser cookie.

`backend/main.py` owns HTTP integration:

- login, session-status, and logout routes;
- router-level authentication dependencies;
- request-size, security-header, and trusted-host middleware;
- production documentation configuration;
- rate-limit calls at login and RF analysis boundaries.

`frontend/src/services/api.js` sends same-origin cookie-authenticated requests and no longer reads or writes authentication tokens. A new frontend authentication context checks `/auth/session` when the SPA starts, exposes authenticated/loading state, and coordinates logout and `401` handling.

### Authentication boundary

The following remain public:

- the SPA shell and static assets;
- `POST /api/v1/auth/login`;
- a minimal `GET /api/v1/health` liveness response.

The following require a valid dashboard session at the router boundary:

- map;
- availability;
- sites;
- reporting;
- impact service;
- transport quality;
- ticketing;
- overview;
- activity ENOM;
- data potensi;
- RF tilt.

Admin cache/metrics routes and the N8N webhook keep separate machine authentication using `X-N8N-API-Key`; they do not accept the browser session as a substitute. This prevents a dashboard browser session from implicitly gaining machine-maintenance privileges.

## Security configuration

Production requires all of these variables before the server becomes ready:

- `APP_ENV=production`
- `PUBLIC_APP_ORIGIN=https://nod-dashboard.zeabur.app`
- `ALLOWED_HOSTS=nod-dashboard.zeabur.app`
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD_HASH` containing an Argon2id hash
- `DASHBOARD_SESSION_SECRET` containing at least 32 random bytes of entropy
- `DASHBOARD_SESSION_TTL_SECONDS=28800`
- `SESSION_COOKIE_SECURE=true`
- `N8N_API_KEY`

No credential, password, token, or signing-key fallback is permitted. Production startup fails with a message naming the missing variable but never prints its value. Development may run with `SESSION_COOKIE_SECURE=false`, but it must still provide explicit authentication values through the local untracked environment file.

The checked-in `.env.example` documents names and generation commands but contains no usable credential values. `zeabur.json` declares the required variables with empty secret values and deployment descriptions.

## Session and login flow

1. The browser posts username and password to `/api/v1/auth/login` from the configured same origin.
2. The backend applies login rate limiting before password verification.
3. Username and password comparisons are constant-time; the password is verified against the Argon2id hash.
4. On success, the backend sets `nod_session` with `HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/`, and an eight-hour maximum age.
5. The response contains only authentication state and the username, never a bearer token.
6. On SPA startup, `/api/v1/auth/session` returns the current authentication state.
7. Protected API calls use the cookie automatically. A `401` clears frontend authentication state and navigates to login.
8. Logout posts to `/api/v1/auth/logout`, clears the cookie with matching attributes, and clears frontend state.

The SPA removes legacy `nod_auth_token` and activity entries from `localStorage` once during migration. Client-side inactivity handling may log the user out earlier for UX, but the server's signed-cookie expiration is authoritative.

## CSRF and CORS

Production supports same-origin browser access only. CORS middleware is not installed by default. Local Vite development continues to use its existing `/api` proxy, so it also operates as same-origin from the browser's perspective.

For `POST`, `PUT`, `PATCH`, and `DELETE` requests authenticated by the dashboard cookie, the backend requires an `Origin` header exactly equal to `PUBLIC_APP_ORIGIN`. Safe methods remain usable without an Origin header. N8N/admin machine routes use their header key and are excluded from browser-origin authentication.

`SameSite=Strict` is defense-in-depth; exact Origin validation is the primary browser CSRF control for unsafe methods in this single-origin application.

## Rate and resource limits

### Login

- Maximum five failed attempts per username and client address in five minutes.
- A blocked key returns `429` with `Retry-After`.
- Successful authentication clears the failure counter.
- When production Redis is configured but unavailable, login rate limiting fails closed with `503`; intentional Redis-free development uses a bounded in-memory limiter.
- Logs record timestamp, result, and normalized client address but never credentials.

### RF analysis

- Maximum 10 analysis requests per authenticated subject and client address per minute.
- Maximum two concurrent analyses per application process.
- Latitude range: `-90..90`; longitude range: `-180..180`.
- Maximum analysis or target-link distance: 50,000 metres.
- Minimum sample interval: 10 metres.
- Maximum derived sample count: 5,001.
- Maximum clutter points: 200.
- Global JSON request-body limit: 1 MiB.

Invalid work factors return `422`; rate/concurrency limits return `429`; unavailable required limiting infrastructure returns `503`. No oversized request starts an elevation fetch or raster parse.

## HTTP and browser hardening

Production disables `/docs`, `/redoc`, and `/openapi.json`. Development keeps them enabled.

`TrustedHostMiddleware` accepts only `ALLOWED_HOSTS`. The public health route returns only `{\"status\": \"ok\"}`; detailed database and Redis readiness moves behind machine/admin protection or logs.

Every response receives:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a minimal `Permissions-Policy`
- a Content Security Policy with `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`.

The CSP permits only the specific Mapbox and Google Fonts connections/assets needed by the current UI. Inline JavaScript remains prohibited. Inline styles remain temporarily permitted because the current React/Mapbox implementation uses inline style attributes; removing that style exception is outside this change.

## XSS remediation

Mapbox and RF Tilt markers/popups must not interpolate API or database strings into `innerHTML` or `setHTML`. Dynamic text uses `textContent`; structured popup content is built with DOM nodes and passed through Mapbox `setDOMContent`. Inline event-handler attributes are replaced with `addEventListener`.

Static SVG/HTML fragments may remain only when every interpolated value is a code constant or a validated number. Tests use hostile site identifiers and names containing tags, quotes, and event-handler text and assert that they remain text.

## Dependency hardening

- Upgrade the frontend dependency tree until the production npm audit has no high or critical findings.
- Keep `package-lock.json` authoritative and continue using `npm ci` in Docker.
- Split backend dependency intent from resolved deployment dependencies: human-maintained direct requirements feed a fully pinned lock/constraints file used by Docker.
- Audit the resolved Python lock in CI rather than auditing today's latest versions permitted by broad ranges.
- Build and deploy immutable image digests rather than relying operationally on a moving `latest` tag.

## Error handling

- Authentication failures return one generic `401` message and do not reveal whether the username or password was wrong.
- Missing or invalid sessions return `401`; authenticated users lacking a machine key still receive the existing N8N/admin rejection.
- Missing production security configuration prevents startup without logging values.
- Rate-limit responses include `Retry-After` and avoid revealing other users' counters.
- Frontend `401` handling preserves the intended destination only as a same-origin React route; it does not accept an arbitrary redirect URL.

## Testing strategy

All behavior changes follow red-green-refactor TDD.

### Backend tests

- production configuration rejects every missing or insecure required value;
- valid Argon2id credentials create a cookie with the required attributes;
- invalid credentials return the same generic `401` response;
- signed sessions accept valid cookies and reject missing, modified, expired, or wrong-secret cookies;
- all dashboard routers reject missing/invalid sessions before database work;
- health and login remain public while docs are disabled in production;
- same-origin unsafe requests pass and attacker/missing origins fail;
- N8N/admin routes still require their separate key;
- login limits produce `429` and reset on success;
- RF request bounds, sample cap, rate limit, and concurrency guard fail before outbound calls;
- security headers and trusted-host behavior are asserted.

### Frontend tests

- no authentication token is read from or written to Web Storage;
- SPA startup checks `/auth/session` and shows a loading state before routing;
- login and logout use cookie-auth endpoints;
- a protected API `401` clears authentication state;
- hostile map labels are inserted as text, not HTML;
- the existing dashboard contract suite and production build remain green.

### Browser verification

- anonymous navigation redirects to login;
- valid login sets an HttpOnly cookie and opens the home page;
- reload preserves the session without localStorage;
- logout clears the cookie and protected API calls return `401`;
- an attacker-origin preflight receives no CORS permission;
- map and RF pages render under the enforced CSP with no blocked required resource;
- production docs return `404`.

## Deployment and migration

1. Generate the Argon2id password hash and session secret locally; never paste plaintext values into tracked files or logs.
2. Set every required variable in Zeabur before deploying the hardened image.
3. Deploy to a temporary Zeabur preview or staging domain and run the full automated/browser verification suite.
4. Deploy production. Existing fixed-token sessions become invalid and every user signs in again.
5. Confirm anonymous and invalid-cookie API requests return `401`, then remove any remaining legacy credentials from Zeabur.
6. Monitor login failures, `401`, `429`, RF latency, Redis availability, and CSP violations during rollout.

If required production variables are absent, the new image intentionally fails readiness instead of silently starting with insecure defaults. The previous image may be used only as a short rollback behind temporary network restrictions because it remains publicly vulnerable.

## Success criteria

- No operational API response is available anonymously or with a forged session.
- No usable credential or signing secret exists in tracked source or default configuration.
- No authentication token is stored in browser-accessible storage.
- Arbitrary-origin browser requests receive no CORS authorization.
- Unsafe cookie-authenticated requests require the exact configured origin.
- Production docs are unavailable and browser security headers are enforced.
- RF analysis cannot exceed the documented work factors or rate/concurrency limits.
- Hostile API strings do not become executable markup.
- Automated backend/frontend tests, audits, production build, and browser security checks pass before release.
