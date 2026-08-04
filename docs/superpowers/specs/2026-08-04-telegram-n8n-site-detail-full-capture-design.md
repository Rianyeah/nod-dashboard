# Telegram N8N Full Site-Detail Capture Design

**Date:** 2026-08-04

**Status:** Approved for implementation planning

## Context

The NOD Telegram bot needs to accept a request for a site, capture the shared
site-detail modal, and return the image through N8N. The required output is one
PNG containing the complete modal through the bottom of its internal scroll
area. Text must remain readable when the recipient zooms the image.

The current Data Potensi flow is designed for an interactive authenticated
browser. It loads the page, searches a paginated table, fetches the selected
site's detail bundle, and opens `SiteDetailModal`. Automating that full flow on
every Telegram request would repeatedly load unrelated dashboard content and
would require N8N or Browserless to hold dashboard credentials.

The approved direction is a minimal capture-only frontend route protected by
a short-lived, site-scoped token. Browserless opens that route directly,
captures the expanded modal, and returns PNG binary to N8N. N8N sends the PNG
as a Telegram document so Telegram does not reduce its readability through
photo compression.

## Goals

- Return one full-height PNG for a requested Site ID, including all content
  below the modal's normal scroll boundary.
- Reuse the existing `SiteDetailModal` markup, formatting, field groups, and
  charts so the capture stays visually aligned with the dashboard.
- Avoid browser login, table search, and dashboard-password storage in the
  N8N workflow.
- Ensure the captured Site ID exactly matches the requested Site ID.
- Never send a loading, partially rendered, wrong-site, or API-error image.
- Preserve PNG quality by using Telegram Send Document.
- Target a normal end-to-end response time of 5-12 seconds, a median at or
  below 8 seconds, and a normal p95 at or below 15 seconds.

## Non-goals

- Do not create a general-purpose authenticated screenshot service.
- Do not expose other dashboard pages through capture tokens.
- Do not reuse the admin N8N key or the read-only N8N map key.
- Do not redesign `SiteDetailModal` or change its normal interactive behavior.
- Do not change Neon schemas or source data.
- Do not pass screenshot bytes or base64 image data into the AI model context.
- Do not use a persistent logged-in Browserless profile as the primary path.

## Approaches considered

### Fresh dashboard login for every request

Browserless can open `/login`, submit credentials, navigate to Data Potensi,
search the table, click a row, and capture the modal. This requires no product
changes but adds several page loads, stores dashboard credentials in the
automation boundary, and can capture the wrong row if search results are not
fully settled. Expected total bot latency is approximately 10-25 seconds.

### Reusable authenticated Browserless profile

A stored Browserless profile removes most login latency and can reduce total
bot time to roughly 7-17 seconds. It still loads the full dashboard, depends
on the dashboard's eight-hour browser-session expiry, and needs recovery when
saved authentication state becomes stale.

### Short-lived capture URL

The selected approach mints a site-scoped token, loads a minimal page that
renders only the requested modal, waits for an explicit readiness contract,
and captures the modal element. It removes dashboard login, global charts,
table search, and row selection from the request path. Expected total bot
latency is approximately 5-12 seconds.

## Architecture

The solution has four isolated boundaries:

1. **Capture-token issuer:** authenticates N8N and mints a short-lived token
   scoped to one normalized Site ID.
2. **Capture bundle endpoint:** validates that token and returns the complete
   data required by the modal.
3. **Capture-only frontend route:** renders the existing modal in full-height
   capture mode and exposes an explicit ready marker.
4. **N8N capture subworkflow:** requests the token, invokes Browserless,
   receives PNG binary, and sends it to Telegram.

The capture feature is separate from dashboard browser sessions and separate
from the existing `/integrations/n8n/map/sectors` boundary.

## Security design

### Dedicated machine credential

Add a dedicated secret such as `N8N_CAPTURE_API_KEY`. N8N stores it in an
encrypted credential and sends it only as:

```text
X-N8N-Capture-API-Key: <secret>
```

The map key and admin N8N key cannot mint capture tokens. A dashboard cookie
cannot access the machine endpoint.

### Capture-token contract

Add:

```text
POST /api/v1/integrations/n8n/site-detail-capture-token
```

Request:

```json
{
  "site_id": "BGL002",
  "theme": "dark"
}
```

Response:

```json
{
  "site_id": "BGL002",
  "capture_url": "https://nod-dashboard.zeabur.app/capture/site-detail/BGL002#token=<signed-token>",
  "expires_at": "2026-08-04T12:00:45Z"
}
```

The signed token has a 60-second lifetime and contains these claims:

```text
aud = nod-site-detail-capture
site_id = BGL002
theme = dark
iat = issued timestamp
exp = expiry timestamp
```

Use a dedicated signing secret, `N8N_CAPTURE_SIGNING_SECRET`, rather than the
dashboard session secret. The token authorizes only the capture bundle for the
claimed Site ID. Stateless expiry is sufficient for the first release; a
Redis-backed one-time nonce is intentionally deferred.

The token is placed in the URL fragment so it is not sent in the initial page
request, access log, or referrer. The capture page reads it, immediately removes
it from the visible address with `history.replaceState`, and uses it as a Bearer
token for the data request.

### Response hardening

- Capture routes use `Cache-Control: no-store`.
- Capture pages use `Referrer-Policy: no-referrer`.
- Tokens and capture URLs are never logged.
- The token issuer is rate-limited independently from login and admin routes.
- Site IDs are trimmed, uppercased, length-limited, and validated before token
  issuance.

## Capture bundle

Add:

```text
GET /api/v1/integrations/n8n/site-detail-capture/{site_id}
Authorization: Bearer <capture-token>
```

Response:

```json
{
  "site_id": "BGL002",
  "detail": {},
  "trend_data": [],
  "performance_data": {}
}
```

The endpoint reuses the same detail, availability-trend, and performance
sources used by `fetchSiteDetailBundle`. Detail is resolved first because it
defines the availability period; trend and performance are then loaded in
parallel.

The response distinguishes valid missing data from request failure:

- A missing master site returns `404`.
- A successful optional query with no rows returns an empty/null value that the
  existing modal renders as unavailable.
- A failed trend or performance query returns a retryable `503`; the capture
  page must not mark itself ready with partial data.
- Authentication or token-scope failure returns `401` or `403` and is not
  retried.

## Capture-only frontend route

Add an unauthenticated shell route:

```text
/capture/site-detail/:siteId
```

The route does not render `AppShell`, the sidebar, Data Potensi charts, filters,
or the site table. It reads the fragment token, requests the capture bundle,
and renders the existing `SiteDetailModal` in a scoped capture mode.

The normal modal remains unchanged. Capture mode only changes layout behavior:

- Position the dialog wrapper at the top of the document instead of vertically
  centering it in a fixed viewport.
- Set `.site-detail-modal` to `max-height: none`, `height: auto`, and visible
  overflow.
- Set `.site-detail-scroll` to non-flexing, visible overflow.
- Remove both `mask-image` and `-webkit-mask-image` so the first and last rows
  are not faded.
- Hide scrollbars and disable transitions, pulsing, and entry animations.
- Preserve the normal modal width, spacing, field order, colors, and charts.

The capture page uses a fixed dark theme for deterministic output. It sets:

```html
data-capture-state="loading|ready|error"
data-capture-site-id="BGL002"
```

`ready` is set only after:

1. The complete capture bundle succeeds.
2. React has committed the modal for the requested Site ID.
3. Chart containers have non-zero dimensions.
4. `document.fonts.ready` resolves.
5. Two animation frames complete after full-height styles are applied.

The visible modal title and `data-capture-site-id` must both exactly equal the
normalized requested Site ID.

## Browserless capture contract

Browserless opens the capture URL with a deterministic viewport, for example:

```text
viewport: 1200 x 1000 CSS pixels
deviceScaleFactor: 1.5
theme: dark
```

It waits for:

```css
[data-capture-state="ready"][data-capture-site-id="BGL002"]
```

It then screenshots only:

```css
.site-detail-modal
```

The screenshot operation must capture beyond the initial viewport. The output
is a PNG whose height follows the actual modal content. A typical capture is
expected to be approximately 1620 pixels wide after device scaling and
1-6 MB, while remaining below Telegram's 50 MB document limit.

If the rendered modal exceeds Browserless or PNG dimension limits, the
subworkflow fails with an explicit error rather than silently cropping the
bottom. Automatic multi-image splitting is not part of the first release
because the approved output is one complete image.

## N8N workflow

### Main workflow

```text
Telegram Trigger
  -> AI Agent
       -> tool: capture_site_detail(site_id, chat_id)
```

The AI tool accepts a strict schema containing only normalized `site_id` and
the originating `chat_id`. For standard messages such as `/site BGL002`, a
deterministic parser may bypass the LLM and call the same subworkflow directly.
Free-form requests continue through the AI Agent.

### Capture tool subworkflow

```text
Execute Workflow Trigger
  -> Validate Site ID
  -> HTTP Request: Mint Capture Token
  -> HTTP Request or Browserless: Capture PNG
  -> Validate Binary and MIME Type
  -> Telegram: Send Document
  -> Return { sent, site_id, telegram_message_id, elapsed_ms }
```

The Browserless node returns binary PNG under a stable binary property such as
`data`. The Telegram node uses Send Document with a deterministic filename:

```text
site-detail-BGL002.png
```

Suggested caption:

```text
Detail Site BGL002 - full capture
```

Binary data never returns to the AI prompt. The tool returns only a compact
JSON status so the model does not process image base64 or duplicate the image
as text.

## Latency budget

Normal target budget:

```text
Telegram trigger and AI extraction     1.0-5.0 s
Capture-token request                  0.1-0.5 s
Browserless startup and page render    2.0-6.0 s
Full-height PNG encoding               0.3-1.0 s
Telegram document upload               0.5-2.0 s
```

The expected normal end-to-end range is 5-12 seconds. Use the Browserless
region nearest the application or a trusted self-hosted Browserless deployment
near Zeabur. Record timing for token issuance, capture readiness, screenshot
completion, and Telegram delivery so actual p50 and p95 can replace estimates.

## Error handling and retry

- Invalid Site ID: return a Telegram text response without calling Browserless.
- Site not found: return a concise Telegram text response naming the Site ID.
- `401` or `403`: treat as configuration/security failure; do not retry.
- `429`, timeout, or transient `5xx`: retry the capture path once with short
  jitter.
- Capture page `error` state: collect a diagnostic screenshot internally but
  do not send it as the requested site image.
- Readiness timeout: fail rather than capturing a skeleton or partial chart.
- PNG missing, zero-length, wrong MIME type, or obviously cropped: do not call
  Telegram Send Document.
- Telegram upload failure: retry the upload once without regenerating the PNG.
- Every failure returns a compact status to the AI tool and a user-safe Telegram
  message; tokens, secrets, stack traces, and internal URLs are excluded.

## Verification strategy

### Backend

- Prove only `X-N8N-Capture-API-Key` can mint tokens.
- Prove admin, map, and dashboard-session credentials cannot mint tokens.
- Prove token expiry, audience, signature, and Site ID scope validation.
- Prove a token for `BGL002` cannot fetch any other site.
- Prove invalid Site IDs and missing sites return the specified status codes.
- Prove detail period resolution and parallel trend/performance loading reuse
  the current site-detail contracts.
- Prove optional empty data differs from an optional-query failure.
- Prove capture responses are not cacheable and do not expose tokens.

### Frontend

- Prove the capture route is outside `PrivateRoute` but cannot fetch data
  without a valid capture token.
- Prove normal modal scrolling, overlay, animations, and closing behavior are
  unchanged.
- Prove capture mode removes max-height, internal scrolling, masks, and
  animations only inside the capture route.
- Prove the ready marker is absent during loading and errors.
- Prove the ready marker is set only for the exact visible Site ID.
- Prove fonts and chart sizing complete before readiness.

### Browser and N8N QA

- Capture at least one typical site, one site with the largest known
  `Data Lainnya` section, and one site with valid missing optional data.
- Verify the PNG includes `Periode Data`, `Kualitas Data`, and the final modal
  border with no scrollbar, fade mask, or cropped row.
- Verify text, charts, colors, and field order match the interactive modal.
- Verify the PNG Site ID matches the Telegram request.
- Verify Telegram receives the original PNG as a document with the expected
  filename and readable zoomed text.
- Measure p50 and p95 for at least 20 executions, including one Browserless
  cold start and one transient retry.
- Verify failures send text rather than a misleading image.

## Observability

Log structured, secret-free events with:

```text
request_id
site_id
token_issue_ms
capture_ready_ms
screenshot_ms
telegram_upload_ms
total_ms
result
```

Do not log signed tokens, capture URLs, dashboard credentials, Browserless
tokens, Telegram bot tokens, or response image bytes.

## Repository maintenance

After implementation and verification, run `graphify update .` and confirm
that both `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` describe
the new capture boundaries.
