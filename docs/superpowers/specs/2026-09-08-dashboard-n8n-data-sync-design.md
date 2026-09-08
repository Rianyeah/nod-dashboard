# Dashboard N8N Data Sync Design

**Date:** 2026-09-08

**Status:** Approved in chat; awaiting written-spec review

## Context

The Impact Service, Data Potensi, and Activity ENOM pages read operational data
from separate tables in Neon Postgres. Each dataset already has its own N8N
workflow. The dashboard needs one `Sync Data` button on each related page so any
authenticated viewer can start the matching workflow without receiving an N8N
URL or credential.

The sync must be asynchronous from the user's perspective. While it runs, the
button shows a spinner, the text `Syncing`, and an elapsed duration. The rest of
the dashboard remains interactive, and sync state survives navigation, refresh,
and another viewer opening the same page.

## Dataset Mapping

| Dataset key | Dashboard route | Source table | N8N workflow |
| --- | --- | --- | --- |
| `impact_service` | `/impact-service` | `public.alarm_impact_service` | Impact Service sync |
| `data_master` | `/data-potensi` | `public.data_site_master` | Data Master sync |
| `activity_enom` | `/activity-enom` | `public.proker_enom_jatim_2026` | Activity ENOM sync |

The backend owns this allowlisted mapping. The browser sends only the dataset
key and never supplies a webhook URL.

## Goals

- Let `viewer`, `data_admin`, and `sysadmin` users start all three syncs through
  a dedicated permission that is initially granted to every role.
- Put one consistent `Sync Data` control in each related page header.
- Keep page filters, tables, navigation, and unrelated requests usable during a
  sync.
- Show authoritative, shared job state and elapsed time across navigation,
  refresh, and multiple viewers.
- Prevent overlapping runs for the same dataset while allowing different
  datasets to run concurrently.
- Refresh the affected page data and cache after a successful sync.
- Keep all N8N URLs and credentials on the server.
- Provide an auditable record of who started each sync and how it ended.

## Non-goals

- Do not create or redesign the three existing N8N data-sync workflows.
- Do not expose the N8N executions API to the browser.
- Do not add row-level progress or percentage completion in the first release.
- Do not allow canceling an N8N execution from the dashboard.
- Do not change the schema or business rules of the three source tables.
- Do not test the migration or feature against a Neon database branch.
- Do not add a confirmation dialog before starting a sync.

## Approaches Considered

### Hold the dashboard request until N8N finishes

N8N can respond when its last node finishes. This gives the caller the final
result without a separate status channel, but keeps the HTTP connection open for
the full import. Long-running data loads can exceed browser, reverse-proxy, or
application timeouts, and the browser loses useful state after navigation or
refresh.

### Respond immediately and poll the N8N executions API

N8N can acknowledge the trigger immediately while the backend polls execution
state. This keeps the browser responsive, but couples the dashboard to N8N's
administrative API, execution identifiers, retention settings, and an additional
privileged credential.

### Respond immediately and call back to the dashboard

This is the selected approach. Each production webhook acknowledges the trigger
immediately. The workflow carries the dashboard job ID through the run and calls
a machine-authenticated dashboard endpoint on success or failure. The dashboard
polls its own job status, not N8N.

## Architecture

The feature has four isolated parts:

1. **Browser sync router:** validates the dataset, creates or returns the active
   job, triggers the mapped N8N webhook, and exposes status behind the dashboard
   session and same-origin boundary.
2. **Machine callback router:** accepts N8N claim/completion requests using a
   per-job secret and never accepts a browser session as authentication.
3. **Job repository:** persists sync state in Postgres and atomically enforces one
   active job per dataset.
4. **Frontend sync provider:** loads shared status, polls while jobs are active,
   maintains accurate elapsed time, and publishes completion events.
5. **Reusable sync button:** renders the dataset-specific state in each page
   header and starts the corresponding job.

The existing page routers remain read-only consumers of their source tables.
They do not call N8N and do not own job state.

## Authorization and Secret Boundaries

Add `data_sync:trigger` to the role-permission map and grant it to `viewer`,
`data_admin`, and `sysadmin`. The browser start route requires this permission;
status requires `dashboard:view`. This preserves the approved viewer behavior
without converting the general read permission into a permanent mutation
capability. Existing same-origin checks on unsafe browser requests continue to
protect the start endpoint.

The backend stores one approved N8N base origin and three production webhook
URLs:

- `N8N_IMPACT_SERVICE_SYNC_WEBHOOK_URL`
- `N8N_DATA_MASTER_SYNC_WEBHOOK_URL`
- `N8N_ACTIVITY_ENOM_SYNC_WEBHOOK_URL`
- `N8N_SYNC_BASE_URL`

It also stores one outbound credential:

- `N8N_SYNC_TRIGGER_API_KEY`: sent by the backend to N8N using header auth.

`DATA_SYNC_ENABLED` is an explicit feature flag and defaults to false. When it is
true, production startup requires all four URL settings and the trigger key.
Every webhook URL must use HTTPS; match the exact configured base origin; use an
approved webhook path; and contain no userinfo, query, or fragment. Outbound
requests disable redirects and use separate connect/read plus total timeouts.
The trigger key must be strong and distinct from unrelated N8N keys. URLs, keys,
per-job tokens, callback headers, and raw internal errors must not be logged or
returned to the browser.

Each job receives a cryptographically random callback token. Only its SHA-256
hash is stored. The plaintext token is delivered to the matching N8N execution
over the authenticated trigger request and is sent back in a callback header.
This limits a leaked execution token to one job and avoids one long-lived
callback credential that could terminate every running job. Token comparison is
constant-time, and authentication occurs before the API reveals whether a job
exists.

## Job Persistence

Add `backend/sql/data_sync_jobs.sql` as idempotent startup DDL, matching the
repository's existing schema-bootstrap pattern. A focused
`backend/data_sync_schema.py` parses the file and `backend/main.py` executes its
statements during lifespan startup before the application becomes ready. It
creates `public.data_sync_jobs` with:

- `id uuid primary key`;
- `dataset text` constrained to the three supported keys;
- `status text` constrained to `dispatching`, `running`, `dispatch_unknown`,
  `succeeded`, `failed`, or `timed_out`;
- `requested_by_user_id text`, plus username and role snapshots for audit;
- `started_at timestamptz`;
- `dispatch_finished_at timestamptz null` and a bounded dispatch outcome code;
- `claimed_at timestamptz null` and `callback_received_at timestamptz null`;
- `finished_at timestamptz null`;
- `rows_processed integer null`;
- `result_code text null` from an allowlist used to select a server-authored
  public message;
- `callback_token_hash text`;
- a request/correlation ID and protocol version;
- `created_at` and `updated_at` timestamps.

A partial unique index on `dataset` for rows whose status is `dispatching`,
`running`, or `dispatch_unknown` is the authoritative concurrency guard.
Application-level checks improve responses but do not replace this database
constraint.

Terminal rows remain as a restricted operational audit trail. They are not
exposed through a general history endpoint in the first release. Automated
retention is deferred; the table is expected to grow slowly because it stores
one row per user-triggered sync, not imported records.

## API Contract

### Start or join an active sync

```text
POST /api/v1/data-sync/{dataset}
```

The endpoint requires `data_sync:trigger`. It first expires stale jobs and
enforces durable limits from the job table: no more than ten newly created jobs
per user in one hour and a 60-second dataset cooldown after a terminal run.
Joining an already-active job does not consume this quota. A rejected start
returns `429` with `Retry-After`. It then atomically creates a `dispatching` job
or returns the already-active job when the unique constraint wins a concurrent
race.

Response:

```json
{
  "job": {
    "id": "3ea11624-287a-451d-a050-772944599a2f",
    "dataset": "data_master",
    "status": "dispatching",
    "started_at": "2026-09-08T10:15:30Z",
    "finished_at": null,
    "rows_processed": null,
    "result_code": null,
    "public_message": null
  },
  "already_running": false
}
```

For a newly created job, the backend calls the mapped N8N webhook once, without
automatic transport retries, and sends `Idempotency-Key: <job_id>`. A valid N8N
acknowledgement is HTTP `202`, JSON content type, and this body:

```json
{
  "accepted": true,
  "job_id": "3ea11624-287a-451d-a050-772944599a2f"
}
```

A valid acknowledgement changes `dispatching` to `running`. A definitive
pre-dispatch rejection, such as failed header authentication or an unknown
webhook, changes the job to `failed`. A timeout, connection reset, N8N 5xx, or
malformed response is ambiguous because N8N may already have accepted the run;
it changes the job to `dispatch_unknown`, which remains active and cannot be
retried until callback or expiry. The backend does not use an in-process
background task for dispatch, so it never reports a successful start before the
trigger request has been attempted.

If a job is already running, the endpoint does not call N8N again. It returns the
same shape with `already_running: true`, allowing all viewers to join the shared
status without seeing a conflict error.

Public job responses omit requester identity, token hashes, dispatch diagnostics,
and internal messages. They contain only the fields needed to render state,
elapsed time, row count, and a server-authored public result.

### Read all latest statuses

```text
GET /api/v1/data-sync/status
```

The endpoint requires `dashboard:view`, expires stale active jobs, and returns
the feature-enabled flag plus the latest public job or `null` for each allowlisted
dataset. One compact endpoint lets the app restore global state after login or a
full browser refresh. When the feature is disabled, new starts return `503`, but
claim and callback endpoints remain available so an in-flight job can finish.

### Claim a dispatched job from N8N

```text
POST /api/v1/integrations/n8n/data-sync/{job_id}/claim
X-Data-Sync-Job-Token: <per-job token>
```

The first N8N operational step claims the job before any source read or database
write. The first valid claim records `claimed_at` and succeeds. A repeated claim
for the same job is identified as a duplicate; that workflow execution must stop
without performing the sync. This provides durable job-ID deduplication if an
ambiguous trigger is ever delivered more than once. The three N8N workflows also
run with concurrency one so existing scheduled runs cannot overlap their manual
trigger path.

### Complete a job from N8N

```text
POST /api/v1/integrations/n8n/data-sync/{job_id}/callback
X-Data-Sync-Job-Token: <per-job token>
```

Body:

```json
{
  "status": "succeeded",
  "rows_processed": 1240,
  "result_code": "completed"
}
```

`status` accepts only `succeeded` or `failed`. `rows_processed` is optional and
non-negative. `result_code` comes from a small allowlist and maps to a
server-authored public message. Arbitrary workflow/SQL error strings are neither
stored in the job nor returned to viewers; restricted N8N execution data remains
the diagnostic source.

The callback transition is idempotent. Repeating the same terminal result
returns the stored job. A contradictory callback cannot overwrite an existing
terminal state. An unknown job or invalid token returns the same generic `401`
without disclosing job existence.

## N8N Trigger and Callback Contract

Each existing workflow receives:

```json
{
  "job_id": "3ea11624-287a-451d-a050-772944599a2f",
  "dataset": "data_master",
  "requested_by": "viewer-a",
  "requested_at": "2026-09-08T10:15:30Z",
  "claim_url": "https://dashboard.example/api/v1/integrations/n8n/data-sync/3ea11624-287a-451d-a050-772944599a2f/claim",
  "callback_url": "https://dashboard.example/api/v1/integrations/n8n/data-sync/3ea11624-287a-451d-a050-772944599a2f/callback",
  "job_token": "<single-job secret>"
}
```

The Webhook node uses its production URL, header authentication, and immediate
response mode, returning the exact HTTP `202` acknowledgement defined above.
The first branch claims the job and stops cleanly when the claim reports a
duplicate. The existing synchronization nodes continue unchanged after that
guard. The job ID and token are preserved only for claim/callback requests and
must be excluded from N8N logs where configuration permits.

The success path sends a `succeeded` callback after the database write and its
validation have completed. A handled failure path sends `failed` with an
allowlisted result code. Unexpected workflow termination may prevent a failure
callback; the dashboard's 30-minute stale-job rule is the fallback for that
case. The backend never automatically retries an ambiguous trigger request.

## Timeout and Concurrency Rules

- Only one active row (`dispatching`, `running`, or `dispatch_unknown`) is
  allowed per dataset.
- Different datasets may run at the same time.
- N8N workflow concurrency is one per dataset, and the per-job claim rejects a
  duplicate delivery before it reaches existing synchronization nodes.
- An active job becomes `timed_out` after 30 minutes without a terminal callback.
- Stale-job expiration occurs atomically before status reads and new starts, so
  it does not depend on an in-process scheduler.
- A timed-out job no longer blocks a retry. A late callback cannot change it
  back to `succeeded` or `failed`.
- The timeout must be longer than the measured normal maximum for each production
  workflow. If any workflow legitimately approaches 30 minutes, operators must
  increase the configured timeout before enabling viewer-triggered retries.
- The job table enforces a ten-starts-per-user rolling hourly limit and a
  60-second dataset cooldown. Rejections return `429` with `Retry-After`.
- Start transactions take a transaction-scoped Postgres advisory lock for the
  actor/dataset before checking quotas and inserting, keeping the limits correct
  across multiple backend workers.
- There is no percentage estimate because the workflows do not expose reliable
  step-level progress.

## Cache and Data Refresh

After an accepted `succeeded` callback, the backend invalidates only the cache
associated with the dataset:

| Dataset | Cache action |
| --- | --- |
| `impact_service` | Invalidate `filters` so Impact Service date/NOP options reload |
| `data_master` | Invalidate `data-potensi`, `overview`, `reporting`, and `filters` because the master table feeds all four |
| `activity_enom` | Invalidate `reporting`; Activity ENOM itself has no current Redis namespace |

Cache invalidation occurs only for successful syncs and completes before the job
is published as `succeeded`, so frontend polling cannot observe success before
the invalidation attempt. Postgres remains the source of truth. A cache outage
does not rewrite the N8N result; it is recorded as a bounded outcome code and
logged as an operational warning while existing cache fallback behavior remains
authoritative.

When the frontend observes a transition to `succeeded`, the related mounted page
reloads its filter options, summary, charts, and table exactly once. If that page
is not mounted, it performs its normal fresh load the next time it opens.

## Frontend Behavior

Add one `DataSyncProvider` beneath `AuthProvider` but above the authenticated
route tree, rather than inside the route-local `AppShell`. It activates only for
an authenticated session, resets on logout, and does not remount during normal
route navigation. On session startup it calls the status endpoint once. While
any job is active it polls with approximately three-to-five-second jitter;
polling stops when all jobs are terminal.

The provider keeps status by dataset and exposes a small hook to the page-level
buttons. This lets a sync continue to be observed while the user navigates. All
viewers see the same server-backed job rather than independent browser state.
When the status contract reports that the feature is disabled, buttons are not
rendered and the provider does not poll.

Add a reusable `DataSyncButton` to:

- `ImpactServiceHeader` for `impact_service`;
- the Data Potensi page header for `data_master`;
- the Activity ENOM page header for `activity_enom`.

Button states:

| State | Label and behavior |
| --- | --- |
| Idle | Refresh icon and `Sync Data`; enabled |
| Dispatching | Spinner and `Starting...`; only this button disabled |
| Running or dispatch unknown | Spinner and `Syncing mm:ss`; only this button disabled |
| Succeeded | Brief `Synced`, then return to idle |
| Failed/timed out | Brief failure state, accessible notification, then return to idle |

Elapsed time is derived from the server's `started_at` and the current clock,
not from accumulated interval ticks. It therefore remains accurate after tab
suspension, route changes, and refresh. The format is `mm:ss` below one hour and
`hh:mm:ss` at or above one hour. The timer is visual text with tabular numerals
and an `aria-live` status that avoids announcing every second.

The button does not block filters, tables, dialogs, page navigation, or unrelated
API requests. It does not open a confirmation dialog.

## Notifications

The provider renders a small application-level completion notification so the
user sees the result even after navigating away:

- success: dataset label and final duration;
- failure: dataset label and a safe summary;
- timeout: dataset label and instruction to retry or check N8N.

Notifications are keyboard and screen-reader accessible. They do not reveal raw
N8N responses, URLs, credentials, SQL errors, or stack traces.

## Error Handling

- Unsupported dataset keys return `404` or `422` before any outbound request.
- Missing/invalid browser sessions return `401`; insufficient permissions return
  `403`. All current roles receive `data_sync:trigger` as approved.
- Invalid browser origins are rejected by the existing same-origin protection.
- Definitive N8N pre-dispatch rejections terminate the job with a safe error.
- Ambiguous trigger outcomes remain active as `dispatch_unknown`; the backend
  never retries them automatically or invites an immediate viewer retry.
- Invalid or unknown per-job callback tokens return the same generic `401`.
- Invalid callback payloads return `422` without changing job state.
- A duplicate claim stops the duplicate N8N execution before data work.
- Duplicate same-result callbacks are successful no-ops.
- Contradictory or late callbacks return a conflict response and preserve the
  first terminal state.
- Status polling uses bounded retry/backoff after transient network errors and
  does not log the viewer out unless the server returns the existing `401` signal.
- One failed dataset does not affect other datasets or ordinary dashboard reads.

## Testing Strategy

Implementation follows red-green-refactor TDD.

### Backend tests

- every supported role, including viewer, can start a sync;
- `data_sync:trigger` remains distinct from `dashboard:view` while being granted
  to all current roles;
- anonymous requests, invalid origins, and invalid datasets are rejected;
- each dataset maps to only its configured webhook;
- feature-flag behavior and strict webhook origin/path validation;
- secrets and raw N8N errors never appear in responses or logs;
- simultaneous starts create one job and trigger N8N once;
- an existing active job returns `already_running: true`;
- durable hourly/cooldown limits return `429` and `Retry-After`;
- valid acknowledgement, definitive rejection, ambiguous timeout/5xx, and network
  failure update state correctly without an automatic retry;
- status output restores the latest state for all datasets;
- per-job token hashing/comparison, first claim, duplicate claim, callback
  authentication, idempotency, and terminal-state conflicts;
- 30-minute expiration and retry after timeout;
- source-aware cache invalidation completes before success is published.

### Frontend tests

- the correct dataset button is present in each page header;
- idle, starting, running, success, failure, and timeout labels;
- elapsed formatting and server-time derivation;
- controls outside the sync button remain enabled;
- polling starts and stops at the correct state transitions;
- polling jitter prevents synchronized client bursts;
- the provider does not remount across authenticated route navigation and clears
  its state on logout;
- provider state survives route changes and restores from the server after reload;
- an already-running job is displayed instead of retriggered;
- a success transition reloads the mounted page exactly once;
- notifications are accessible and contain no internal error detail.

### Integration tests

A local fake N8N HTTP service covers exact immediate acknowledgement, definitive
rejection, ambiguous 5xx/connection timeout, first and duplicate claims,
callback success, callback failure, duplicate callback, and missing callback.
Tests never invoke production workflows.

Schema validation checks the idempotent SQL file, its parser/executor, repeated
bootstrap behavior, constraints, and indexes through the project's normal
local/test database path. Per user direction, no Neon branch is created or used
for validation.

### Browser verification

- start each dataset from its matching page as a viewer;
- verify `Syncing` and increasing elapsed duration;
- change filters, open table/detail UI, and navigate while sync is running;
- return to the page and confirm the same running job and timer;
- refresh the browser and confirm state restoration;
- complete and fail fake callbacks and verify notification/button behavior;
- verify successful sync refreshes only the related mounted page;
- verify two viewers share one active job and cannot duplicate the trigger;
- verify zero unexpected browser console errors.

## Deployment and Operations

Deployment requires these coordinated steps:

1. Deploy backend and frontend with `DATA_SYNC_ENABLED=false`. The idempotent
   startup bootstrap creates or verifies the job table, while the API rejects
   starts and the UI hides the buttons.
2. Add the base URL, three webhook URLs, and trigger key to backend deployment
   configuration without storing their values in Git.
3. Configure exact HTTP `202` acknowledgement, header authentication, first-step
   claim, concurrency one, and success/failure callbacks on each production N8N
   workflow while preserving its existing sync and validation logic.
4. Set `DATA_SYNC_ENABLED=true` and deploy backend/frontend configuration
   together so API and UI contracts become active at the same time.
5. Run one controlled sync per dataset and verify job audit rows, claim/callback
   state, cache invalidation, page refresh, and source-table counts.

Rollback sets `DATA_SYNC_ENABLED=false` and redeploys. Conditional configuration
validation then permits removing webhook values later without preventing startup.
The job table remains for restricted audit/history; dropping it is not required
for application rollback.

## Acceptance Criteria

- A logged-in viewer can start the matching N8N workflow from each of the three
  page headers.
- The browser never receives an N8N URL or credential.
- A newly triggered workflow is acknowledged quickly and runs independently of
  ordinary dashboard interaction.
- The button shows `Syncing` with accurate elapsed duration for the shared job.
- Navigation and refresh preserve or restore the running state.
- One dataset cannot have overlapping jobs; different datasets can run together.
- N8N success, failure, and missing callback produce deterministic terminal
  states.
- Successful sync invalidates the correct cache and refreshes the related page.
- All defined backend, frontend, integration, and browser checks pass without
  using a Neon branch.
