# Login and Transport Reliability Follow-ups Design

**Date:** 2026-08-03

**Status:** Approved for implementation

## Goal

Make the login background match the approved dynamic Vanta Fog reference, improve the login identity hierarchy, distinguish the packet-loss series in Weekly Quality Trend, and prevent transient Transport Quality refresh failures from blanking valid data.

## Scope

This follow-up changes only:

- the login background and title block;
- the Transport Quality weekly trend presentation;
- Transport Quality filter/data request resilience and failure states;
- the Transport Quality filter cache fallback;
- focused automated and rendered-browser verification.

It does not change business formulas, source datasets, thresholds, authentication behavior, Tower Visualizer output, or unrelated dashboard pages.

## Root Causes

### Vanta Fog remains static

The installed Vanta UMD build is wrapped by Vite as a nested default export. The production bundle exposes the factory as `module.default.default`, while `LoginFogBackground` only checks `module.default` and `module.FOG`. It therefore attempts to call an object, catches the resulting exception, and silently keeps the static graphite-red fallback.

The current Three.js dependency is also newer than the `three.r134.min.js` version used by the approved Vanta reference. Because Three.js is used only by the login fog effect, aligning the dependency to r134 does not affect other application features.

### Transport Quality failures blank the page

The initial filter request has no retry or explicit retry action. When it fails, the page marks filters as loaded, clears loading states, and renders scorecards as zero even though zero is not a confirmed data value.

The backend Redis cache is optional. When Redis is disabled or temporarily unreachable, every request executes the full filter aggregation and period queries. A read-only measurement against the configured database completed the options query in about 2.5 seconds and the periods query in about 0.5 seconds, which is normally acceptable but leaves the first request vulnerable to database wake-up, network, or cache-infrastructure transients.

Dashboard modules are also loaded with `Promise.all`, so one failed module rejects the whole group and prevents successful responses from updating their panels.

## Approved Design

### 1. Dynamic login background

- Keep Vanta and Three.js self-hosted through npm; do not add CDN scripts because the production Content Security Policy allows only same-origin scripts.
- Pin `three` to `0.134.0`, matching the requested Three r134 runtime.
- Import the ESM Vanta Fog source or resolve the nested module shape explicitly through a small pure factory resolver.
- Use the approved options:
  - `mouseControls: true`
  - `touchControls: true`
  - `gyroControls: false`
  - `minHeight: 200`
  - `minWidth: 200`
  - `highlightColor: 0x000000`
  - `midtoneColor: 0xe60013`
  - `lowlightColor: 0x000000`
  - `baseColor: 0x000000`
  - `backgroundAlpha: 1`
  - `blurFactor: 0.64`
  - `speed: 2.6`
  - `zoom: 1.3`
- Reduce the heavy static vignette so the animated red fog remains visible across the viewport.
- Retain a dark red static fallback for reduced-motion preference, unavailable WebGL, import failure, or initialization failure.
- Destroy the Vanta instance on unmount and do not initialize more than one instance.

### 2. Login identity hierarchy

- Keep the title `NOD`.
- Add `Network Operation Dashboard` directly below the title.
- Keep `All in one Dashboard ENOM and Tools` as the footer description.
- Preserve the password visibility control and existing authentication behavior.

### 3. Weekly Quality Trend

- Replace the weekly `LineChart` with `ComposedChart`.
- Assign `pl_over_1_sites` permanently to the right axis.
- Render packet loss as a Telkomsel-red `Area` with a low-opacity vertical gradient, a strong red boundary line, and red right-axis ticks.
- Keep latency, jitter, and THI as distinct lines on the left 0-50 axis.
- Keep raw values, tooltips, legend labels, dates, thresholds, and backend series unchanged.
- Retain six horizontal grid levels based on the left axis so small series remain readable.

### 4. Transient request policy

- Add one focused idempotent GET retry helper for Transport Quality requests.
- Retry at most two times after the initial attempt.
- Retry only network failures, timeouts, HTTP 408, 429, 502, 503, and 504.
- Never retry HTTP 400, 401, 403, 404, or validation errors.
- Use short bounded backoff and allow AbortSignal cancellation.
- Do not retry indefinitely or create a global Axios behavior change for unrelated pages.

### 5. Stale-data and partial-success behavior

- Preserve the last successful filters and dashboard payloads while a refresh is in progress.
- If refresh fails after valid data has been loaded, keep that data visible and show a compact warning that it may not be current.
- Provide a `Coba lagi` button that reruns the failed filter/dashboard/table requests.
- If the first-ever filter load fails and no data exists, show an honest unavailable state and retry action; do not render zero-valued scorecards as confirmed data.
- Replace the dashboard `Promise.all` update with per-module settlement so successful summary, trend, distributions, or breakdown responses are retained even if one module fails.
- Keep table failures isolated from dashboard failures.
- Clear the warning after the affected request succeeds.

### 6. Backend filter fallback

- Keep Redis as the shared cache when available.
- Add a process-local TTL snapshot for Transport Quality filters as a fallback when Redis is bypassed or temporarily unavailable.
- Use a lock to prevent concurrent cold requests from stampeding the same filter queries.
- Serve a stale local snapshot only when a database refresh fails and a prior successful snapshot exists.
- Mark cache behavior through `X-Cache` values so local/stale responses are observable.
- Do not conceal a first-load database failure when no snapshot exists.

## Data Flow

1. Login loads the lightweight shell immediately.
2. When motion is allowed, Three r134 and the Vanta Fog factory are loaded lazily and initialized once.
3. Transport Quality requests filters through the bounded retry helper.
4. The backend resolves filters from Redis, a fresh local snapshot, or the database in that order.
5. Once a valid date is available, dashboard modules and the priority table load independently.
6. Successful responses replace their own prior state. Failed responses leave prior state intact and register a retryable warning.
7. A user-triggered retry increments an explicit refresh key without resetting current data.

## Error Handling

- Vanta failures remain non-blocking and fall back to the approved static background.
- Authentication failures continue through the existing unauthorized handler and are not retried.
- Transient Transport failures expose a concise user message rather than raw Axios or database errors.
- Stale responses are labeled as stale; they are never presented as freshly updated.
- No empty or zero state is shown as real operational data unless a successful API response contains it.

## Testing

### Frontend automated tests

- A pure Vanta factory resolver unwraps direct and nested default exports.
- Login source includes the approved sublabel and Vanta options.
- The weekly chart uses `ComposedChart`, a right-axis PL `Area`, and left-axis lines.
- Retry classification covers network errors, timeout, supported transient statuses, and non-retryable authentication/client errors.
- Transport page contracts cover explicit retry keys, retained data, partial settlements, and first-load failure behavior.

### Backend automated tests

- The filter endpoint prefers Redis hits.
- A fresh local snapshot avoids repeated database scans when Redis is bypassed.
- Concurrent misses share one refresh.
- A stale local snapshot is returned only after a refresh failure.
- A cold refresh failure without a snapshot still propagates.

### Rendered verification

- Desktop and mobile login preserve layout and show the new sublabel.
- A WebGL-capable browser shows a Vanta canvas and animated Fog; reduced-motion or unavailable WebGL shows the fallback.
- Weekly Quality Trend shows PL as a red area aligned to the red right axis while 0-50 line dynamics remain legible.
- A simulated transient failure retains prior Transport data and exposes a working retry action.
- Page identity, nonblank rendering, framework overlay, console health, screenshots, and target interactions are checked.

## Acceptance Criteria

- The login background visibly matches the dynamic black/red Vanta Fog reference in a WebGL-capable browser.
- `Network Operation Dashboard` appears directly below `NOD`.
- Packet loss is visually tied to the right axis and cannot be confused with the small-axis lines.
- A transient refresh error no longer wipes valid Transport Quality data.
- Initial load failures do not display misleading zero metrics.
- Retrying can recover without a full-page reload.
- Existing business calculations and all unrelated dashboard contracts remain unchanged.
